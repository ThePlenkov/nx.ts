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
      command: 'tsdown',
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
      command: 'tsdown --watch',
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
