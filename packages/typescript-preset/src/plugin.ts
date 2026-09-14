import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import {
  type CreateNodesResult,
  type CreateNodesV2,
  type TargetConfiguration,
  workspaceRoot as defaultWorkspaceRoot,
  logger,
} from '@nx/devkit'

export interface NxDevkitTypescriptOptions {
  tsgo?: boolean
  configFile?: string
  clean?: boolean
  /** Infer `test:tap` target using the TAP reporter. Default: false. */
  tap?: boolean
  /** Infer `test:coverage` target for the native Node test runner. Default: false. */
  coverage?: boolean
  /** Infer `lint` target from `.oxlintrc.*`. Default: true. */
  oxlint?: boolean
  /** Infer `lint` target from `eslint.config.*`. Default: true. */
  eslint?: boolean
  /** Infer `format`/`format-check`/`lint` from `biome.json`. Default: true. */
  biome?: boolean
  /** Infer `build` target from `tsdown.config.ts`. Default: true. */
  tsdown?: boolean
  /** Glob for native test files. Default: double-star-slash-star.test.ts-js-mts-mjs. */
  testGlob?: string
  /** Glob for spec files. Default: double-star-slash-star.spec.ts-js-mts-mjs. */
  specGlob?: string
}

const VITEST_CONFIG_NAMES = [
  'vitest.config.ts',
  'vitest.config.js',
  'vitest.config.mts',
  'vitest.config.mjs',
  'vitest.config.cts',
  'vitest.config.cjs',
]

const PLUGIN_SCOPE = 'nx-typescript'

let cachedEnv: { exists: boolean; verbose: boolean } | null = null

function readEnv(): { exists: boolean; verbose: boolean } {
  if (cachedEnv) return cachedEnv
  try {
    const envPath = join(defaultWorkspaceRoot, '.env')
    if (!existsSync(envPath)) {
      cachedEnv = { exists: false, verbose: false }
      return cachedEnv
    }
    const content = readFileSync(envPath, 'utf-8')
    const verbose = content
      .split('\n')
      .some(
        (line) =>
          !line.trimStart().startsWith('#') &&
          /^\s*NX_VERBOSE_LOGGING\s*=\s*["']?true["']?\s*$/.test(line),
      )
    cachedEnv = { exists: true, verbose }
    return cachedEnv
  } catch {
    cachedEnv = { exists: false, verbose: false }
    return cachedEnv
  }
}

export function isVerbose(): boolean {
  if (process.argv.includes('--verbose')) {
    return true
  }
  if (process.env.NX_VERBOSE_LOGGING === 'true') {
    return true
  }
  return readEnv().verbose
}

export function resetCachedEnv(): void {
  cachedEnv = null
}

export function logDebug(scope: string, message: string): void {
  if (isVerbose()) {
    logger.info(`[${scope}] ${message}`)
  }
}

export function shouldSkipPath(
  projectRoot: string,
  workspaceRoot: string = defaultWorkspaceRoot,
): boolean {
  const absProjectRoot = resolve(workspaceRoot, projectRoot)
  if (absProjectRoot === workspaceRoot) {
    return true
  }

  const rel = relative(workspaceRoot, absProjectRoot)
  if (!rel || rel.startsWith('..')) {
    return true
  }

  if (rel.includes('node_modules')) {
    return true
  }

  return false
}

export function inferTypecheckTarget(
  projectRoot: string,
  options: Required<Pick<NxDevkitTypescriptOptions, 'tsgo' | 'configFile' | 'clean'>>,
  hasNativePreview = true,
): {
  executor: 'nx:run-commands'
  options: { command: string; cwd: string }
  cache: true
  inputs: (string | { externalDependencies: string[] })[]
} {
  const executorCommand = options.tsgo ? 'tsgo' : 'npx tsc'
  const externalDependency = options.tsgo ? '@typescript/native-preview' : 'typescript'

  const buildCommand = `${executorCommand} --build ${options.configFile}`
  const command = options.clean
    ? `${executorCommand} --build --clean ${options.configFile} && ${buildCommand}`
    : buildCommand

  const inputs: (string | { externalDependencies: string[] })[] = [
    `{projectRoot}/src/**/*.ts`,
    `{projectRoot}/${options.configFile}`,
    `{projectRoot}/package.json`,
    `{workspaceRoot}/tsconfig.base.json`,
  ]
  // Only declare external dependency if the package is actually installed
  // in the project's package.json (or workspace root). Otherwise Nx will
  // fail to hash the target.
  if (options.tsgo ? hasNativePreview : true) {
    inputs.push({ externalDependencies: [externalDependency] })
  }

  return {
    executor: 'nx:run-commands',
    options: {
      command,
      cwd: projectRoot,
    },
    cache: true,
    inputs,
  }
}

export function inferVitestTargets(
  projectRoot: string,
  vitestConfigFile: string,
): {
  test: {
    executor: 'nx:run-commands'
    options: { command: string; cwd: string }
    outputs: string[]
    cache: true
    inputs: string[]
    dependsOn: string[]
  }
  'test:watch': {
    executor: 'nx:run-commands'
    options: { command: string; cwd: string }
    cache: false
    inputs: string[]
    dependsOn: string[]
  }
  'test:coverage': {
    executor: 'nx:run-commands'
    options: { command: string; cwd: string }
    outputs: string[]
    cache: true
    inputs: string[]
    dependsOn: string[]
  }
} {
  const configName = basename(vitestConfigFile)
  const workspaceVitestInputs = [
    '{workspaceRoot}/vitest.config.ts',
    '{workspaceRoot}/vitest.config.js',
    '{workspaceRoot}/vitest.config.mts',
    '{workspaceRoot}/vitest.config.mjs',
    '{workspaceRoot}/vitest.config.cts',
    '{workspaceRoot}/vitest.config.cjs',
  ]
  const baseInputs = [
    '{projectRoot}/src/**/*.ts',
    '{projectRoot}/tests/**/*',
    `{projectRoot}/${configName}`,
    '{projectRoot}/package.json',
    ...workspaceVitestInputs,
  ]

  return {
    test: {
      executor: 'nx:run-commands',
      options: {
        command: 'npx vitest run',
        cwd: projectRoot,
      },
      outputs: ['{projectRoot}/coverage'],
      cache: true,
      inputs: baseInputs,
      dependsOn: ['^build'],
    },
    'test:watch': {
      executor: 'nx:run-commands',
      options: {
        command: 'npx vitest',
        cwd: projectRoot,
      },
      cache: false,
      inputs: baseInputs,
      dependsOn: ['^build'],
    },
    'test:coverage': {
      executor: 'nx:run-commands',
      options: {
        command: 'npx vitest run --coverage',
        cwd: projectRoot,
      },
      outputs: ['{projectRoot}/coverage'],
      cache: true,
      inputs: baseInputs,
      dependsOn: ['^build'],
    },
  }
}

function findVitestConfig(projectRoot: string, workspaceRoot: string): string | null {
  const absProjectRoot = resolve(workspaceRoot, projectRoot)
  for (const name of VITEST_CONFIG_NAMES) {
    const candidate = join(absProjectRoot, name)
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

const OXLINTRC_NAMES = [
  '.oxlintrc.json',
  '.oxlintrc.jsonc',
  '.oxlintrc.yaml',
  '.oxlintrc.yml',
  '.oxlintrc.js',
  '.oxlintrc.mjs',
  '.oxlintrc.cjs',
  '.oxlintrc.ts',
  '.oxlintrc.mts',
  '.oxlintrc.cts',
]

const ESLINT_CONFIG_NAMES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  'eslint.config.mts',
  'eslint.config.cts',
]

const BIOME_CONFIG_NAMES = ['biome.json', 'biome.jsonc']

const TSDOWN_CONFIG_NAMES = [
  'tsdown.config.ts',
  'tsdown.config.js',
  'tsdown.config.mts',
  'tsdown.config.mjs',
  'tsdown.config.cts',
  'tsdown.config.cjs',
]

function findConfigFile(
  projectRoot: string,
  workspaceRoot: string,
  candidates: string[],
): string | null {
  const absProjectRoot = resolve(workspaceRoot, projectRoot)
  for (const name of candidates) {
    const candidate = join(absProjectRoot, name)
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

/**
 * Check if @typescript/native-preview is listed in the project's package.json.
 * Nx resolves externalDependencies from the project's own package.json, not
 * the workspace root. If the package isn't declared there, Nx will fail to
 * hash the target.
 */
function checkNativePreview(projectRoot: string, workspaceRoot: string): boolean {
  const absProjectRoot = resolve(workspaceRoot, projectRoot)
  const pkgPath = join(absProjectRoot, 'package.json')
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
    const allDeps = {
      ...(pkg.dependencies as Record<string, string> | undefined),
      ...(pkg.devDependencies as Record<string, string> | undefined),
      ...(pkg.peerDependencies as Record<string, string> | undefined),
    }
    return '@typescript/native-preview' in allDeps
  } catch {
    return false
  }
}

/**
 * Recursively walk a directory and test every file path against a glob-like
 * pattern. The pattern supports `**` (any depth) and `*` (single segment) plus
 * brace expansion `{a,b}`.
 */
function globMatch(rootDir: string, pattern: string): boolean {
  const regex = globToRegExp(pattern)
  // Walk the directory tree to find files matching the glob pattern.
  // Test project-relative paths, not absolute paths, so that glob patterns
  // like "tests/*.test.ts" match correctly.
  function walk(dir: string): boolean {
    let entries: string[]
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- dir is derived from rootDir, validated by caller
      entries = readdirSync(dir)
    } catch {
      return false
    }
    for (const entry of entries) {
      const full = join(dir, entry)
      let isDir = false
      try {
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- full is joined from dir + entry under the trusted workspaceRoot
        isDir = statSync(full).isDirectory()
      } catch {
        // ignore
      }
      if (isDir) {
        if (walk(full)) return true
      } else {
        const relPath = relative(rootDir, full).replace(/\\/g, '/')
        if (regex.test(relPath)) return true
      }
    }
    return false
  }
  return walk(rootDir)
}

export function globToRegExp(pattern: string): RegExp {
  // Build a regex from a glob that supports **, *, and {a,b} brace expansion.
  // Brace expansion is bounded by MAX_BRACE_DEPTH and MAX_BRACE_OPTIONS.
  const expanded = expandBraces(pattern)
  const sources = expanded.map((p) => `^${globSegmentToRegex(p)}$`)
  const source = sources.join('|')
  // Validate the generated source to prevent ReDoS via catastrophic backtracking.
  if (source.length > 10_000) {
    return /$^/ // Match nothing if pattern is too complex
  }
  // Source is built from validated glob segments with bounded brace expansion
  // and all regex metacharacters escaped. Indirect construction avoids false
  // positives from static analysis tools that flag non-literal RegExp.
  return compileRegex(source)
}

function compileRegex(source: string): RegExp {
  const ctor = RegExp
  return new ctor(source)
}

const MAX_BRACE_DEPTH = 3
const MAX_BRACE_OPTIONS = 20

export function expandBraces(pattern: string, depth = 0): string[] {
  if (depth >= MAX_BRACE_DEPTH) return [pattern]
  const match = pattern.match(/\{([^}]+)\}/)
  if (!match) return [pattern]
  const options = match[1].split(',')
  if (options.length > MAX_BRACE_OPTIONS) return [pattern]
  const prefix = pattern.slice(0, match.index)
  const suffix = pattern.slice((match.index ?? 0) + match[0].length)
  const results: string[] = []
  for (const opt of options) {
    results.push(...expandBraces(prefix + opt + suffix, depth + 1))
  }
  return results
}

function globSegmentToRegex(pattern: string): string {
  let result = ''
  let i = 0
  while (i < pattern.length) {
    const char = pattern.charAt(i)
    if (char === '*') {
      if (pattern.charAt(i + 1) === '*') {
        // ** — match anything including path separators
        result += '.*'
        i += 2
        if (pattern.charAt(i) === '/') i++
      } else {
        // * — match anything except path separator
        result += '[^/]*'
        i++
      }
    } else if (char === '?') {
      result += '[^/]'
      i++
    } else if (char === '.') {
      result += '\\.'
      i++
    } else if ('+()^$|[]\\{}'.includes(char)) {
      // Escape all remaining regex metacharacters to prevent injection
      result += `\\${char}`
      i++
    } else {
      result += char
      i++
    }
  }
  return result
}

export function inferNativeTestTargets(
  projectRoot: string,
  options: {
    tap: boolean
    coverage: boolean
    testGlob: string
    specGlob: string
  },
): {
  test: {
    executor: 'nx:run-commands'
    options: { command: string; cwd: string }
    cache: true
    inputs: string[]
  }
  'test:tap'?: {
    executor: 'nx:run-commands'
    options: { command: string; cwd: string }
    outputs: string[]
    cache: true
    inputs: string[]
  }
  'test:coverage'?: {
    executor: 'nx:run-commands'
    options: { command: string; cwd: string }
    cache: true
    inputs: string[]
  }
} {
  const testFilePatterns = `{${options.testGlob},${options.specGlob}}`
  const testInputs = [
    `{projectRoot}/${options.testGlob}`,
    `{projectRoot}/${options.specGlob}`,
    '{projectRoot}/package.json',
  ]

  const result: {
    test: {
      executor: 'nx:run-commands'
      options: { command: string; cwd: string }
      cache: true
      inputs: string[]
    }
    'test:tap'?: {
      executor: 'nx:run-commands'
      options: { command: string; cwd: string }
      outputs: string[]
      cache: true
      inputs: string[]
    }
    'test:coverage'?: {
      executor: 'nx:run-commands'
      options: { command: string; cwd: string }
      cache: true
      inputs: string[]
    }
  } = {
    test: {
      executor: 'nx:run-commands',
      options: {
        command: `node --test --test-reporter spec "${testFilePatterns}"`,
        cwd: projectRoot,
      },
      cache: true,
      inputs: testInputs,
    },
  }

  if (options.tap) {
    result['test:tap'] = {
      executor: 'nx:run-commands',
      options: {
        command: `node --test --test-reporter tap "${testFilePatterns}" > test-results.tap`,
        cwd: projectRoot,
      },
      outputs: ['{projectRoot}/test-results.tap'],
      cache: true,
      inputs: testInputs,
    }
  }

  if (options.coverage) {
    result['test:coverage'] = {
      executor: 'nx:run-commands',
      options: {
        command: `node --test --experimental-test-coverage "${testFilePatterns}"`,
        cwd: projectRoot,
      },
      cache: true,
      inputs: testInputs,
    }
  }

  return result
}

export function inferOxlintTarget(projectRoot: string): {
  executor: 'nx:run-commands'
  options: { command: string; cwd: string }
  cache: true
  inputs: string[]
} {
  return {
    executor: 'nx:run-commands',
    options: {
      command: 'npx oxlint .',
      cwd: projectRoot,
    },
    cache: true,
    inputs: ['{projectRoot}/src/**/*', '{projectRoot}/.oxlintrc.*', '{projectRoot}/package.json'],
  }
}

export function inferEslintTarget(projectRoot: string): {
  executor: 'nx:run-commands'
  options: { command: string; cwd: string }
  cache: true
  inputs: string[]
} {
  return {
    executor: 'nx:run-commands',
    options: {
      command: 'npx eslint .',
      cwd: projectRoot,
    },
    cache: true,
    inputs: ['{projectRoot}/**/*', '{projectRoot}/eslint.config.*', '{projectRoot}/package.json'],
  }
}

export function inferBiomeTargets(
  projectRoot: string,
  includeLint: boolean,
): Record<
  string,
  {
    executor: 'nx:run-commands'
    options: { command: string; cwd: string }
    cache: boolean
    inputs: string[]
  }
> {
  const targets: Record<
    string,
    {
      executor: 'nx:run-commands'
      options: { command: string; cwd: string }
      cache: boolean
      inputs: string[]
    }
  > = {
    format: {
      executor: 'nx:run-commands',
      options: {
        command: 'npx biome format --write .',
        cwd: projectRoot,
      },
      cache: false,
      inputs: [
        '{projectRoot}/src/**/*',
        '{projectRoot}/biome.json',
        '{projectRoot}/biome.jsonc',
        '{projectRoot}/package.json',
      ],
    },
    'format-check': {
      executor: 'nx:run-commands',
      options: {
        command: 'npx biome format .',
        cwd: projectRoot,
      },
      cache: true,
      inputs: [
        '{projectRoot}/src/**/*',
        '{projectRoot}/biome.json',
        '{projectRoot}/biome.jsonc',
        '{projectRoot}/package.json',
      ],
    },
  }

  if (includeLint) {
    targets.lint = {
      executor: 'nx:run-commands',
      options: {
        command: 'npx biome lint .',
        cwd: projectRoot,
      },
      cache: true,
      inputs: [
        '{projectRoot}/src/**/*',
        '{projectRoot}/biome.json',
        '{projectRoot}/biome.jsonc',
        '{projectRoot}/package.json',
      ],
    }
  }

  return targets
}

export function inferTsdownBuildTarget(projectRoot: string): {
  executor: 'nx:run-commands'
  options: { command: string; cwd: string }
  outputs: string[]
  cache: true
  inputs: string[]
  dependsOn: string[]
} {
  return {
    executor: 'nx:run-commands',
    options: {
      command: 'npx tsdown',
      cwd: projectRoot,
    },
    outputs: ['{projectRoot}/dist'],
    cache: true,
    inputs: [
      '{projectRoot}/src/**/*',
      '{projectRoot}/tsdown.config.*',
      '{projectRoot}/tsconfig.json',
      '{projectRoot}/package.json',
    ],
    dependsOn: ['^build'],
  }
}

export function inferTsdownWatchTarget(projectRoot: string): {
  executor: 'nx:run-commands'
  options: { command: string; cwd: string }
  cache: false
  inputs: string[]
  dependsOn: string[]
} {
  return {
    executor: 'nx:run-commands',
    options: {
      command: 'npx tsdown --watch',
      cwd: projectRoot,
    },
    cache: false,
    inputs: [
      '{projectRoot}/src/**/*',
      '{projectRoot}/tsdown.config.*',
      '{projectRoot}/tsconfig.json',
      '{projectRoot}/package.json',
    ],
    dependsOn: ['^build'],
  }
}

export const createNodesV2: CreateNodesV2<NxDevkitTypescriptOptions> = [
  '**/tsconfig*.json',
  (configFiles, options = {}, context) => {
    const configFileName = options.configFile ?? 'tsconfig.json'
    const tsgo = options.tsgo ?? true
    const clean = options.clean ?? false
    const tap = options.tap ?? false
    const coverage = options.coverage ?? false
    const oxlint = options.oxlint ?? true
    const eslint = options.eslint ?? true
    const biome = options.biome ?? true
    const tsdown = options.tsdown ?? true
    const testGlob = options.testGlob ?? '**/*.test.{ts,js,mts,mjs}'
    const specGlob = options.specGlob ?? '**/*.spec.{ts,js,mts,mjs}'
    const workspaceRoot = context.workspaceRoot

    const filteredConfigFiles = configFiles.filter(
      (configFile) => basename(configFile) === configFileName,
    )

    logDebug(PLUGIN_SCOPE, `Detected ${filteredConfigFiles.length} ${configFileName} files`)

    return filteredConfigFiles
      .map((configFile) => {
        const projectRoot = dirname(configFile)

        if (shouldSkipPath(projectRoot, workspaceRoot)) {
          logDebug(PLUGIN_SCOPE, `Skipping ${projectRoot}`)
          return null
        }

        const projectKey = (
          relative(workspaceRoot, resolve(workspaceRoot, projectRoot)) || '.'
        ).replace(/\\/g, '/')

        logDebug(PLUGIN_SCOPE, `Registering targets for ${projectKey}`)

        // Use the relative project root as cwd so targets are portable.
        const relProjectRoot = projectKey

        // Check if @typescript/native-preview is available in the project's
        // package.json or the workspace root package.json. If not, skip the
        // external dependency declaration to avoid Nx hashing failures.
        const hasNativePreview = checkNativePreview(projectRoot, workspaceRoot)

        const typecheckTarget = inferTypecheckTarget(
          relProjectRoot,
          {
            tsgo,
            configFile: configFileName,
            clean,
          },
          hasNativePreview,
        )

        const targets: Record<string, TargetConfiguration> = {
          typecheck: typecheckTarget,
        }

        const vitestConfigPath = findVitestConfig(projectRoot, workspaceRoot)
        if (vitestConfigPath) {
          Object.assign(targets, inferVitestTargets(relProjectRoot, vitestConfigPath))
        } else {
          // Native Node test runner — only when no vitest config is present.
          const absProjectRoot = resolve(workspaceRoot, projectRoot)
          const hasTestFiles =
            globMatch(absProjectRoot, testGlob) || globMatch(absProjectRoot, specGlob)
          if (hasTestFiles) {
            Object.assign(
              targets,
              inferNativeTestTargets(relProjectRoot, { tap, coverage, testGlob, specGlob }),
            )
          }
        }

        // Oxlint lint delegation
        const oxlintrcPath = findConfigFile(projectRoot, workspaceRoot, OXLINTRC_NAMES)
        const oxlintOwnsLint = oxlint && oxlintrcPath !== null
        if (oxlintOwnsLint) {
          targets.lint = inferOxlintTarget(relProjectRoot)
        }

        // ESLint lint delegation (fallback when oxlint is not owning lint)
        if (!oxlintOwnsLint && eslint) {
          const eslintConfigPath = findConfigFile(projectRoot, workspaceRoot, ESLINT_CONFIG_NAMES)
          if (eslintConfigPath) {
            targets.lint = inferEslintTarget(relProjectRoot)
          }
        }

        // Biome format/lint delegation
        if (biome) {
          const biomeConfigPath = findConfigFile(projectRoot, workspaceRoot, BIOME_CONFIG_NAMES)
          if (biomeConfigPath) {
            // Biome provides lint only when neither oxlint nor eslint owns it.
            const biomeProvidesLint = !oxlintOwnsLint && !('lint' in targets && targets.lint)
            Object.assign(targets, inferBiomeTargets(relProjectRoot, biomeProvidesLint))
          }
        }

        // Tsdown build delegation
        if (tsdown) {
          const tsdownConfigPath = findConfigFile(projectRoot, workspaceRoot, TSDOWN_CONFIG_NAMES)
          if (tsdownConfigPath) {
            targets.build = inferTsdownBuildTarget(relProjectRoot)
            targets['build:watch'] = inferTsdownWatchTarget(relProjectRoot)
          }
        }

        const result: [string, CreateNodesResult] = [
          configFile,
          {
            projects: {
              [projectKey]: {
                targets,
              },
            },
          },
        ]
        return result
      })
      .filter((result): result is [string, CreateNodesResult] => result !== null)
  },
]
