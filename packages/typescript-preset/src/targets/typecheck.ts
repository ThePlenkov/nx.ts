import type { NxDevkitTypescriptOptions } from '../types.js'

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
  const executorCommand = options.tsgo ? 'tsgo' : 'tsc'
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
