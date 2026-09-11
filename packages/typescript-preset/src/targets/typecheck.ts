import type { NxDevkitTypescriptOptions } from '../types.js'

export function inferTypecheckTarget(
  projectRoot: string,
  options: Required<Pick<NxDevkitTypescriptOptions, 'tsgo' | 'configFile' | 'clean'>>,
  hasNativePreview = true,
): {
  executor: string
  options: { tsgo: boolean; configFile: string; clean: boolean }
  cache: true
  inputs: (string | { externalDependencies: string[] })[]
} {
  const externalDependency = options.tsgo ? '@typescript/native-preview' : 'typescript'

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
    executor: '@nx-devkit/typescript:typecheck',
    options: {
      tsgo: options.tsgo,
      configFile: options.configFile,
      clean: options.clean,
    },
    cache: true,
    inputs,
  }
}
