import { basename } from 'node:path'

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
        command: 'vitest run',
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
        command: 'vitest',
        cwd: projectRoot,
      },
      cache: false,
      inputs: baseInputs,
      dependsOn: ['^build'],
    },
    'test:coverage': {
      executor: 'nx:run-commands',
      options: {
        command: 'vitest run --coverage',
        cwd: projectRoot,
      },
      outputs: ['{projectRoot}/coverage'],
      cache: true,
      inputs: baseInputs,
      dependsOn: ['^build'],
    },
  }
}
