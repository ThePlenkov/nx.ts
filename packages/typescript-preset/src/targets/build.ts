export function inferTsdownBuildTarget(_projectRoot: string): {
  executor: string
  options: Record<string, never>
  outputs: string[]
  cache: true
  inputs: string[]
  dependsOn: string[]
} {
  return {
    executor: '@nx-devkit/typescript:build',
    options: {},
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

export function inferTsdownWatchTarget(_projectRoot: string): {
  executor: string
  options: { watch: true }
  cache: false
  inputs: string[]
  dependsOn: string[]
} {
  return {
    executor: '@nx-devkit/typescript:build',
    options: { watch: true },
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
