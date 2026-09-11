import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { NxDevkitTypescriptOptions } from '../src/plugin.js'
import {
  createNodesV2,
  inferEslintTarget,
  inferTypecheckTarget,
  inferVitestTargets,
  isVerbose,
  logDebug,
  resetCachedEnv,
  shouldSkipPath,
} from '../src/plugin.js'

function makeWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'nx-devkit-typescript-'))
  return root
}

function touch(root: string, rel: string): string {
  const abs = join(root, rel)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, '{}')
  return abs
}

type ProjectConfiguration = {
  projects?: Record<string, { targets?: Record<string, unknown> }>
}
type CreateNodesResultEntry = [string, ProjectConfiguration]
type CreateNodesResult = CreateNodesResultEntry[]

function callCreateNodes(
  configFiles: string[],
  options: Partial<NxDevkitTypescriptOptions> = {},
  workspaceRoot = '/workspace',
): CreateNodesResult {
  const fn = createNodesV2[1]
  return fn(configFiles, options, {
    nxJsonConfiguration: {},
    workspaceRoot,
  }) as CreateNodesResult
}

describe('shouldSkipPath', () => {
  it('skips the workspace root', () => {
    expect(shouldSkipPath('/workspace', '/workspace')).toBe(true)
  })

  it('skips paths outside the workspace', () => {
    expect(shouldSkipPath('/other/project', '/workspace')).toBe(true)
  })

  it('skips paths that traverse upward', () => {
    expect(shouldSkipPath('/workspace/../escape', '/workspace')).toBe(true)
  })

  it('skips paths that contain node_modules', () => {
    expect(shouldSkipPath('/workspace/packages/foo/node_modules/x', '/workspace')).toBe(true)
  })

  it('keeps normal project roots', () => {
    expect(shouldSkipPath('/workspace/packages/foo', '/workspace')).toBe(false)
  })
})

describe('isVerbose / logDebug', () => {
  const originalArgv = process.argv
  const originalEnv = process.env.NX_VERBOSE_LOGGING

  beforeEach(() => {
    process.argv = originalArgv.filter((a) => a !== '--verbose')
    delete process.env.NX_VERBOSE_LOGGING
    resetCachedEnv()
  })

  afterEach(() => {
    process.argv = originalArgv
    if (originalEnv === undefined) delete process.env.NX_VERBOSE_LOGGING
    else process.env.NX_VERBOSE_LOGGING = originalEnv
  })

  it('returns false by default', () => {
    expect(isVerbose()).toBe(false)
  })

  it('returns true when --verbose is on argv', () => {
    process.argv = [...originalArgv, '--verbose']
    expect(isVerbose()).toBe(true)
  })

  it('returns true when NX_VERBOSE_LOGGING=true', () => {
    process.env.NX_VERBOSE_LOGGING = 'true'
    expect(isVerbose()).toBe(true)
  })

  it('logDebug is a noop when not verbose', () => {
    delete process.env.NX_VERBOSE_LOGGING
    process.argv = process.argv.filter((a) => a !== '--verbose')
    expect(isVerbose()).toBe(false)
    // Should not throw; calling it covers the noop branch.
    expect(() => logDebug('nx-typescript', 'silent message')).not.toThrow()
  })
})

describe('inferTypecheckTarget', () => {
  const opts = { tsgo: true, configFile: 'tsconfig.json', clean: false }

  it('builds a tsgo --build command by default', () => {
    const t = inferTypecheckTarget('/w/packages/foo', opts)
    expect(t.executor).toBe('nx:run-commands')
    expect(t.options.command).toBe('tsgo --build tsconfig.json')
    expect(t.options.cwd).toBe('/w/packages/foo')
    expect(t.cache).toBe(true)
  })

  it('uses tsc and typescript external dep when tsgo=false', () => {
    const t = inferTypecheckTarget('/w/packages/foo', {
      tsgo: false,
      configFile: 'tsconfig.json',
      clean: false,
    })
    expect(t.options.command).toBe('tsc --build tsconfig.json')
    const ext = t.inputs.find((i) => typeof i === 'object') as
      | { externalDependencies: string[] }
      | undefined
    expect(ext?.externalDependencies).toEqual(['typescript'])
  })

  it('uses @typescript/native-preview when tsgo=true', () => {
    const t = inferTypecheckTarget('/w/p', opts)
    const ext = t.inputs.find((i) => typeof i === 'object') as
      | { externalDependencies: string[] }
      | undefined
    expect(ext?.externalDependencies).toEqual(['@typescript/native-preview'])
  })

  it('prefixes --clean when clean=true', () => {
    const t = inferTypecheckTarget('/w/p', {
      tsgo: true,
      configFile: 'tsconfig.json',
      clean: true,
    })
    expect(t.options.command).toBe(
      'tsgo --build --clean tsconfig.json && tsgo --build tsconfig.json',
    )
  })

  it('substitutes the configured configFile', () => {
    const t = inferTypecheckTarget('/w/p', {
      tsgo: true,
      configFile: 'tsconfig.lib.json',
      clean: false,
    })
    expect(t.options.command).toBe('tsgo --build tsconfig.lib.json')
    expect(t.inputs).toContain('{projectRoot}/tsconfig.lib.json')
  })

  it('includes shared inputs', () => {
    const t = inferTypecheckTarget('/w/p', opts)
    expect(t.inputs).toEqual(
      expect.arrayContaining([
        '{projectRoot}/src/**/*.ts',
        '{projectRoot}/tsconfig.json',
        '{projectRoot}/package.json',
        '{workspaceRoot}/tsconfig.base.json',
      ]),
    )
  })
})

describe('inferVitestTargets', () => {
  it('produces test, test:watch, and test:coverage targets', () => {
    const targets = inferVitestTargets('/w/p', 'vitest.config.ts')
    expect(Object.keys(targets).sort()).toEqual(['test', 'test:coverage', 'test:watch'])
  })

  it('test target caches and outputs coverage', () => {
    const t = inferVitestTargets('/w/p', 'vitest.config.ts').test
    expect(t.executor).toBe('nx:run-commands')
    expect(t.options.command).toBe('vitest run')
    expect(t.options.cwd).toBe('/w/p')
    expect(t.cache).toBe(true)
    expect(t.outputs).toEqual(['{projectRoot}/coverage'])
    expect(t.dependsOn).toEqual(['^build'])
    expect(t.inputs).toEqual(
      expect.arrayContaining([
        '{projectRoot}/src/**/*.ts',
        '{projectRoot}/tests/**/*',
        '{projectRoot}/vitest.config.ts',
        '{projectRoot}/package.json',
        '{workspaceRoot}/vitest.config.ts',
      ]),
    )
  })

  it('test:watch disables cache', () => {
    const w = inferVitestTargets('/w/p', 'vitest.config.ts')['test:watch']
    expect(w.cache).toBe(false)
    expect(w.options.command).toBe('vitest')
  })

  it('test:coverage adds --coverage and outputs', () => {
    const c = inferVitestTargets('/w/p', 'vitest.config.ts')['test:coverage']
    expect(c.options.command).toBe('vitest run --coverage')
    expect(c.outputs).toEqual(['{projectRoot}/coverage'])
    expect(c.cache).toBe(true)
  })
})

function firstProject(
  result: CreateNodesResult,
  projectKey: string,
): { targets?: Record<string, unknown> } {
  expect(result).toHaveLength(1)
  const entry = result[0]
  if (!entry) throw new Error('expected a result entry')
  const projects = entry[1].projects
  if (!projects) throw new Error('expected projects')
  const proj = projects[projectKey]
  if (!proj) throw new Error(`expected project ${projectKey}`)
  return proj
}

describe('createNodesV2 integration', () => {
  it('returns an empty array when no config files match', () => {
    const result = callCreateNodes([], {}, '/workspace')
    expect(result).toEqual([])
  })

  it('infers a typecheck target for a project with tsconfig.json', () => {
    const root = makeWorkspace()
    try {
      const cfg = touch(root, 'packages/foo/tsconfig.json')
      const result = callCreateNodes([cfg], {}, root)
      const proj = firstProject(result, 'packages/foo')
      const typecheck = proj.targets?.typecheck
      expect(typecheck).toBeDefined()
      expect(typecheck?.executor).toBe('nx:run-commands')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('ignores tsconfig.json at the workspace root', () => {
    const root = makeWorkspace()
    try {
      const cfg = touch(root, 'tsconfig.json')
      const result = callCreateNodes([cfg], {}, root)
      expect(result).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('respects options.configFile', () => {
    const root = makeWorkspace()
    try {
      const cfg = touch(root, 'packages/foo/tsconfig.lib.json')
      const result = callCreateNodes([cfg], { configFile: 'tsconfig.lib.json' }, root)
      expect(result).toHaveLength(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('does not match tsconfig.json when configFile is tsconfig.lib.json', () => {
    const root = makeWorkspace()
    try {
      const cfg = touch(root, 'packages/foo/tsconfig.json')
      const result = callCreateNodes([cfg], { configFile: 'tsconfig.lib.json' }, root)
      expect(result).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('infers test targets when vitest.config.ts coexists with tsconfig.json', () => {
    const root = makeWorkspace()
    try {
      const ts = touch(root, 'packages/foo/tsconfig.json')
      const vitest = touch(root, 'packages/foo/vitest.config.ts')
      const result = callCreateNodes([ts], {}, root)
      const proj = firstProject(result, 'packages/foo')
      expect(proj.targets?.test).toBeDefined()
      expect(proj.targets?.['test:watch']).toBeDefined()
      expect(proj.targets?.['test:coverage']).toBeDefined()
      expect(vitest).toBeTruthy()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('does not infer test targets when no vitest.config.* exists', () => {
    const root = makeWorkspace()
    try {
      const ts = touch(root, 'packages/foo/tsconfig.json')
      const result = callCreateNodes([ts], {}, root)
      const proj = firstProject(result, 'packages/foo')
      expect(proj.targets?.test).toBeUndefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('skips paths under node_modules', () => {
    const root = makeWorkspace()
    try {
      const cfg = touch(root, 'packages/foo/node_modules/bar/tsconfig.json')
      const result = callCreateNodes([cfg], {}, root)
      expect(result).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------
// Mega-preset: native Node test runner
// ---------------------------------------------------------------------------

describe('native Node test runner inference', () => {
  it('infers test target when test files exist but no vitest config', () => {
    const root = makeWorkspace()
    try {
      const ts = touch(root, 'packages/foo/tsconfig.json')
      touch(root, 'packages/foo/src/foo.test.ts')
      const result = callCreateNodes([ts], {}, root)
      const proj = firstProject(result, 'packages/foo')
      expect(proj.targets?.test).toBeDefined()
      const test = proj.targets?.test as Record<string, unknown>
      expect(test.executor).toBe('nx:run-commands')
      const opts = test.options as Record<string, unknown>
      expect(opts.command).toContain('node --test')
      expect(opts.command).toContain('--test-reporter spec')
      expect(opts.command).not.toContain('{projectRoot}/')
      expect(opts.cwd).toBe('packages/foo')
      expect(test.cache).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('vitest takes priority over native test runner', () => {
    const root = makeWorkspace()
    try {
      const ts = touch(root, 'packages/foo/tsconfig.json')
      touch(root, 'packages/foo/vitest.config.ts')
      touch(root, 'packages/foo/src/foo.test.ts')
      const result = callCreateNodes([ts], {}, root)
      const proj = firstProject(result, 'packages/foo')
      const test = proj.targets?.test as Record<string, unknown>
      const opts = test.options as Record<string, unknown>
      expect(opts.command).toBe('vitest run')
      expect(proj.targets?.['test:tap']).toBeUndefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('no test files and no vitest config = no test targets', () => {
    const root = makeWorkspace()
    try {
      const ts = touch(root, 'packages/foo/tsconfig.json')
      const result = callCreateNodes([ts], {}, root)
      const proj = firstProject(result, 'packages/foo')
      expect(proj.targets?.test).toBeUndefined()
      expect(proj.targets?.['test:tap']).toBeUndefined()
      expect(proj.targets?.['test:coverage']).toBeUndefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('infers test:tap target when tap:true', () => {
    const root = makeWorkspace()
    try {
      const ts = touch(root, 'packages/foo/tsconfig.json')
      touch(root, 'packages/foo/src/foo.test.ts')
      const result = callCreateNodes([ts], { tap: true }, root)
      const proj = firstProject(result, 'packages/foo')
      expect(proj.targets?.['test:tap']).toBeDefined()
      const tap = proj.targets?.['test:tap'] as Record<string, unknown>
      const opts = tap.options as Record<string, unknown>
      expect(opts.command).toContain('--test-reporter tap')
      expect(opts.command).toContain('> test-results.tap')
      expect(opts.command).not.toContain('| tee')
      expect(opts.command).not.toContain('{projectRoot}/')
      expect(tap.outputs).toEqual(['{projectRoot}/test-results.tap'])
      expect(tap.cache).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('infers test:coverage target when coverage:true', () => {
    const root = makeWorkspace()
    try {
      const ts = touch(root, 'packages/foo/tsconfig.json')
      touch(root, 'packages/foo/src/foo.test.ts')
      const result = callCreateNodes([ts], { coverage: true }, root)
      const proj = firstProject(result, 'packages/foo')
      expect(proj.targets?.['test:coverage']).toBeDefined()
      const cov = proj.targets?.['test:coverage'] as Record<string, unknown>
      const opts = cov.options as Record<string, unknown>
      expect(opts.command).toContain('--experimental-test-coverage')
      expect(opts.command).not.toContain('{projectRoot}/')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('uses specGlob to detect spec files', () => {
    const root = makeWorkspace()
    try {
      const ts = touch(root, 'packages/foo/tsconfig.json')
      touch(root, 'packages/foo/src/foo.spec.ts')
      const result = callCreateNodes([ts], {}, root)
      const proj = firstProject(result, 'packages/foo')
      expect(proj.targets?.test).toBeDefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------
// Mega-preset: Oxlint lint delegation
// ---------------------------------------------------------------------------

describe('oxlint lint delegation', () => {
  it('infers lint target when .oxlintrc.json exists', () => {
    const root = makeWorkspace()
    try {
      const ts = touch(root, 'packages/foo/tsconfig.json')
      touch(root, 'packages/foo/.oxlintrc.json')
      const result = callCreateNodes([ts], {}, root)
      const proj = firstProject(result, 'packages/foo')
      expect(proj.targets?.lint).toBeDefined()
      const lint = proj.targets?.lint as Record<string, unknown>
      expect(lint.executor).toBe('nx:run-commands')
      const opts = lint.options as Record<string, unknown>
      expect(opts.command).toContain('oxlint')
      expect(opts.cwd).toBe('packages/foo')
      expect(lint.cache).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('does not infer oxlint lint when oxlint:false', () => {
    const root = makeWorkspace()
    try {
      const ts = touch(root, 'packages/foo/tsconfig.json')
      touch(root, 'packages/foo/.oxlintrc.json')
      const result = callCreateNodes([ts], { oxlint: false }, root)
      const proj = firstProject(result, 'packages/foo')
      expect(proj.targets?.lint).toBeUndefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('infers lint target when .oxlintrc.yaml exists', () => {
    const root = makeWorkspace()
    try {
      const ts = touch(root, 'packages/foo/tsconfig.json')
      touch(root, 'packages/foo/.oxlintrc.yaml')
      const result = callCreateNodes([ts], {}, root)
      const proj = firstProject(result, 'packages/foo')
      expect(proj.targets?.lint).toBeDefined()
      const lint = proj.targets?.lint as Record<string, unknown>
      const opts = lint.options as Record<string, unknown>
      expect(opts.command).toContain('oxlint')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('infers lint target when .oxlintrc.yml exists', () => {
    const root = makeWorkspace()
    try {
      const ts = touch(root, 'packages/foo/tsconfig.json')
      touch(root, 'packages/foo/.oxlintrc.yml')
      const result = callCreateNodes([ts], {}, root)
      const proj = firstProject(result, 'packages/foo')
      expect(proj.targets?.lint).toBeDefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------
// Mega-preset: ESLint lint delegation
// ---------------------------------------------------------------------------

describe('eslint lint delegation', () => {
  it('inferEslintTarget produces a cached lint target', () => {
    const t = inferEslintTarget('/w/packages/foo')
    expect(t.executor).toBe('nx:run-commands')
    expect(t.options.command).toBe('eslint .')
    expect(t.options.cwd).toBe('/w/packages/foo')
    expect(t.cache).toBe(true)
    expect(t.inputs).toEqual(
      expect.arrayContaining([
        '{projectRoot}/**/*',
        '{projectRoot}/eslint.config.*',
        '{projectRoot}/package.json',
      ]),
    )
  })

  it('infers lint target when eslint.config.mjs exists (no oxlint)', () => {
    const root = makeWorkspace()
    try {
      const ts = touch(root, 'packages/foo/tsconfig.json')
      touch(root, 'packages/foo/eslint.config.mjs')
      const result = callCreateNodes([ts], {}, root)
      const proj = firstProject(result, 'packages/foo')
      expect(proj.targets?.lint).toBeDefined()
      const lint = proj.targets?.lint as Record<string, unknown>
      const opts = lint.options as Record<string, unknown>
      expect(opts.command).toContain('eslint')
      expect(opts.command).not.toContain('oxlint')
      expect(opts.command).not.toContain('biome')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('oxlint wins over eslint when both configs exist', () => {
    const root = makeWorkspace()
    try {
      const ts = touch(root, 'packages/foo/tsconfig.json')
      touch(root, 'packages/foo/.oxlintrc.json')
      touch(root, 'packages/foo/eslint.config.mjs')
      const result = callCreateNodes([ts], {}, root)
      const proj = firstProject(result, 'packages/foo')
      const lint = proj.targets?.lint as Record<string, unknown>
      const opts = lint.options as Record<string, unknown>
      expect(opts.command).toContain('oxlint')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('does not infer eslint lint when eslint:false', () => {
    const root = makeWorkspace()
    try {
      const ts = touch(root, 'packages/foo/tsconfig.json')
      touch(root, 'packages/foo/eslint.config.mjs')
      const result = callCreateNodes([ts], { eslint: false }, root)
      const proj = firstProject(result, 'packages/foo')
      expect(proj.targets?.lint).toBeUndefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('eslint wins over biome for lint when both exist', () => {
    const root = makeWorkspace()
    try {
      const ts = touch(root, 'packages/foo/tsconfig.json')
      touch(root, 'packages/foo/eslint.config.mjs')
      touch(root, 'packages/foo/biome.json')
      const result = callCreateNodes([ts], {}, root)
      const proj = firstProject(result, 'packages/foo')
      const lint = proj.targets?.lint as Record<string, unknown>
      const opts = lint.options as Record<string, unknown>
      expect(opts.command).toContain('eslint')
      expect(opts.command).not.toContain('biome lint')
      // biome still provides format targets
      expect(proj.targets?.format).toBeDefined()
      expect(proj.targets?.['format-check']).toBeDefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('biome provides lint when neither oxlint nor eslint config exists', () => {
    const root = makeWorkspace()
    try {
      const ts = touch(root, 'packages/foo/tsconfig.json')
      touch(root, 'packages/foo/biome.json')
      const result = callCreateNodes([ts], {}, root)
      const proj = firstProject(result, 'packages/foo')
      const lint = proj.targets?.lint as Record<string, unknown>
      const opts = lint.options as Record<string, unknown>
      expect(opts.command).toContain('biome lint')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------
// Mega-preset: Biome format/lint delegation
// ---------------------------------------------------------------------------

describe('biome format/lint delegation', () => {
  it('infers format and format-check from biome.json', () => {
    const root = makeWorkspace()
    try {
      const ts = touch(root, 'packages/foo/tsconfig.json')
      touch(root, 'packages/foo/biome.json')
      const result = callCreateNodes([ts], {}, root)
      const proj = firstProject(result, 'packages/foo')
      expect(proj.targets?.format).toBeDefined()
      expect(proj.targets?.['format-check']).toBeDefined()
      const fmt = proj.targets?.format as Record<string, unknown>
      const fmtOpts = fmt.options as Record<string, unknown>
      expect(fmtOpts.command).toContain('biome format --write')
      expect(fmt.cache).toBe(false)
      const fmtCheck = proj.targets?.['format-check'] as Record<string, unknown>
      const fcOpts = fmtCheck.options as Record<string, unknown>
      expect(fcOpts.command).toContain('biome format')
      expect(fcOpts.command).not.toContain('--write')
      expect(fmtCheck.cache).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('biome with oxlintrc = no biome lint (oxlint wins)', () => {
    const root = makeWorkspace()
    try {
      const ts = touch(root, 'packages/foo/tsconfig.json')
      touch(root, 'packages/foo/.oxlintrc.json')
      touch(root, 'packages/foo/biome.json')
      const result = callCreateNodes([ts], {}, root)
      const proj = firstProject(result, 'packages/foo')
      const lint = proj.targets?.lint as Record<string, unknown>
      const opts = lint.options as Record<string, unknown>
      expect(opts.command).toContain('oxlint')
      expect(opts.command).not.toContain('biome lint')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('oxlint disabled, biome provides lint', () => {
    const root = makeWorkspace()
    try {
      const ts = touch(root, 'packages/foo/tsconfig.json')
      touch(root, 'packages/foo/biome.json')
      const result = callCreateNodes([ts], { oxlint: false }, root)
      const proj = firstProject(result, 'packages/foo')
      const lint = proj.targets?.lint as Record<string, unknown>
      const opts = lint.options as Record<string, unknown>
      expect(opts.command).toContain('biome lint')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------
// Mega-preset: Tsdown build delegation
// ---------------------------------------------------------------------------

describe('tsdown build delegation', () => {
  it('infers build target from tsdown.config.ts', () => {
    const root = makeWorkspace()
    try {
      const ts = touch(root, 'packages/foo/tsconfig.json')
      touch(root, 'packages/foo/tsdown.config.ts')
      const result = callCreateNodes([ts], {}, root)
      const proj = firstProject(result, 'packages/foo')
      expect(proj.targets?.build).toBeDefined()
      const build = proj.targets?.build as Record<string, unknown>
      expect(build.executor).toBe('nx:run-commands')
      const opts = build.options as Record<string, unknown>
      expect(opts.command).toContain('tsdown')
      expect(opts.cwd).toBe('packages/foo')
      expect(build.cache).toBe(true)
      expect(build.outputs).toEqual(['{projectRoot}/dist'])
      expect(build.dependsOn).toEqual(['^build'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('infers build:watch target from tsdown.config.ts', () => {
    const root = makeWorkspace()
    try {
      const ts = touch(root, 'packages/foo/tsconfig.json')
      touch(root, 'packages/foo/tsdown.config.ts')
      const result = callCreateNodes([ts], {}, root)
      const proj = firstProject(result, 'packages/foo')
      expect(proj.targets?.['build:watch']).toBeDefined()
      const watch = proj.targets?.['build:watch'] as Record<string, unknown>
      expect(watch.executor).toBe('nx:run-commands')
      const opts = watch.options as Record<string, unknown>
      expect(opts.command).toBe('tsdown --watch')
      expect(opts.cwd).toBe('packages/foo')
      expect(watch.cache).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('does not infer build when tsdown:false', () => {
    const root = makeWorkspace()
    try {
      const ts = touch(root, 'packages/foo/tsconfig.json')
      touch(root, 'packages/foo/tsdown.config.ts')
      const result = callCreateNodes([ts], { tsdown: false }, root)
      const proj = firstProject(result, 'packages/foo')
      expect(proj.targets?.build).toBeUndefined()
      expect(proj.targets?.['build:watch']).toBeUndefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('infers build target from tsdown.config.js', () => {
    const root = makeWorkspace()
    try {
      const ts = touch(root, 'packages/foo/tsconfig.json')
      touch(root, 'packages/foo/tsdown.config.js')
      const result = callCreateNodes([ts], {}, root)
      const proj = firstProject(result, 'packages/foo')
      expect(proj.targets?.build).toBeDefined()
      const build = proj.targets?.build as Record<string, unknown>
      expect(build.executor).toBe('nx:run-commands')
      const opts = build.options as Record<string, unknown>
      expect(opts.command).toContain('tsdown')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------
// Mega-preset: all targets from one plugin
// ---------------------------------------------------------------------------

describe('mega scenario — all targets from one plugin', () => {
  it('infers typecheck + native test + oxlint + biome format + tsdown build', () => {
    const root = makeWorkspace()
    try {
      const ts = touch(root, 'packages/foo/tsconfig.json')
      touch(root, 'packages/foo/src/foo.test.ts')
      touch(root, 'packages/foo/.oxlintrc.json')
      touch(root, 'packages/foo/biome.json')
      touch(root, 'packages/foo/tsdown.config.ts')
      const result = callCreateNodes([ts], { tap: true, coverage: true }, root)
      const proj = firstProject(result, 'packages/foo')
      const targets = Object.keys(proj.targets ?? {}).sort()
      expect(targets).toEqual(
        expect.arrayContaining([
          'typecheck',
          'test',
          'test:tap',
          'test:coverage',
          'lint',
          'format',
          'format-check',
          'build',
        ]),
      )
      // oxlint owns lint
      const lint = proj.targets?.lint as Record<string, unknown>
      const lintOpts = lint.options as Record<string, unknown>
      expect(lintOpts.command).toContain('oxlint')
      // native test runner (no vitest)
      const test = proj.targets?.test as Record<string, unknown>
      const testOpts = test.options as Record<string, unknown>
      expect(testOpts.command).toContain('node --test')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
