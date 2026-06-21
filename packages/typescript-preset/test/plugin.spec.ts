import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { NxDevkitTypescriptOptions } from '../src/plugin.js'
import {
  createNodesV2,
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
    expect(t.options.command).toBe('npx tsgo --build tsconfig.json')
    expect(t.options.cwd).toBe('/w/packages/foo')
    expect(t.cache).toBe(true)
  })

  it('uses tsc and typescript external dep when tsgo=false', () => {
    const t = inferTypecheckTarget('/w/packages/foo', {
      tsgo: false,
      configFile: 'tsconfig.json',
      clean: false,
    })
    expect(t.options.command).toBe('npx tsc --build tsconfig.json')
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
      'npx tsgo --build --clean tsconfig.json && npx tsgo --build tsconfig.json',
    )
  })

  it('substitutes the configured configFile', () => {
    const t = inferTypecheckTarget('/w/p', {
      tsgo: true,
      configFile: 'tsconfig.lib.json',
      clean: false,
    })
    expect(t.options.command).toBe('npx tsgo --build tsconfig.lib.json')
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
    expect(t.options.command).toBe('npx vitest run')
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
    expect(w.options.command).toBe('npx vitest')
  })

  it('test:coverage adds --coverage and outputs', () => {
    const c = inferVitestTargets('/w/p', 'vitest.config.ts')['test:coverage']
    expect(c.options.command).toBe('npx vitest run --coverage')
    expect(c.outputs).toEqual(['{projectRoot}/coverage'])
    expect(c.cache).toBe(true)
  })
})

describe('createNodesV2 integration', () => {
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
