import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import {
  type CreateNodesResult,
  type CreateNodesV2,
  workspaceRoot as defaultWorkspaceRoot,
  logger,
} from '@nx/devkit'

export interface NxDevkitTypescriptOptions {
  tsgo?: boolean
  configFile?: string
  clean?: boolean
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
    const stat = statSync(envPath)
    if (stat.size > 1_048_576) {
      cachedEnv = { exists: true, verbose: false }
      return cachedEnv
    }
    const fd = openSync(envPath, 'r')
    try {
      const buf = Buffer.alloc(Math.min(stat.size, 4096))
      readSync(fd, buf, 0, buf.length, 0)
      const content = buf.toString('utf-8')
      const verbose = content
        .split('\n')
        .some(
          (line) => !line.trimStart().startsWith('#') && line.includes('NX_VERBOSE_LOGGING=true'),
        )
      cachedEnv = { exists: true, verbose }
      return cachedEnv
    } finally {
      closeSync(fd)
    }
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
): {
  executor: 'nx:run-commands'
  options: { command: string; cwd: string }
  cache: true
  inputs: (string | { externalDependencies: string[] })[]
} {
  const executorCommand = options.tsgo ? 'npx tsgo' : 'npx tsc'
  const externalDependency = options.tsgo ? '@typescript/native-preview' : 'typescript'

  const buildCommand = `${executorCommand} --build ${options.configFile}`
  const command = options.clean
    ? `${executorCommand} --build --clean ${options.configFile} && ${buildCommand}`
    : buildCommand

  return {
    executor: 'nx:run-commands',
    options: {
      command,
      cwd: projectRoot,
    },
    cache: true,
    inputs: [
      `{projectRoot}/src/**/*.ts`,
      `{projectRoot}/${options.configFile}`,
      `{projectRoot}/package.json`,
      `{workspaceRoot}/tsconfig.base.json`,
      { externalDependencies: [externalDependency] },
    ],
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
  const baseInputs = [
    '{projectRoot}/src/**/*.ts',
    '{projectRoot}/tests/**/*',
    `{projectRoot}/${configName}`,
    '{projectRoot}/package.json',
    '{workspaceRoot}/vitest.config.ts',
  ]

  return {
    test: {
      executor: 'nx:run-commands',
      options: {
        command: 'npx vitest run --reporter=default',
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
        command: 'npx vitest --reporter=default',
        cwd: projectRoot,
      },
      cache: false,
      inputs: baseInputs,
      dependsOn: ['^build'],
    },
    'test:coverage': {
      executor: 'nx:run-commands',
      options: {
        command: 'npx vitest run --coverage --reporter=default',
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

export const createNodesV2: CreateNodesV2<NxDevkitTypescriptOptions> = [
  '**/tsconfig*.json',
  (configFiles, options = {}, context) => {
    const configFileName = options.configFile ?? 'tsconfig.json'
    const tsgo = options.tsgo ?? true
    const clean = options.clean ?? false
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

        const typecheckTarget = inferTypecheckTarget(projectRoot, {
          tsgo,
          configFile: configFileName,
          clean,
        })

        const targets: Record<string, unknown> = {
          typecheck: typecheckTarget,
        }

        const vitestConfigPath = findVitestConfig(projectRoot, workspaceRoot)
        if (vitestConfigPath) {
          Object.assign(targets, inferVitestTargets(projectRoot, vitestConfigPath))
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
