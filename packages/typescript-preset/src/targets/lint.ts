export function inferOxlintTarget(projectRoot: string): {
  executor: 'nx:run-commands'
  options: { command: string; cwd: string }
  cache: true
  inputs: string[]
} {
  return {
    executor: 'nx:run-commands',
    options: {
      command: 'oxlint .',
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
      command: 'eslint .',
      cwd: projectRoot,
    },
    cache: true,
    inputs: ['{projectRoot}/**/*', '{projectRoot}/eslint.config.*', '{projectRoot}/package.json'],
  }
}
