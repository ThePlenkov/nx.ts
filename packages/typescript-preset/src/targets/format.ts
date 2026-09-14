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
        command: 'biome format --write .',
        cwd: projectRoot,
      },
      cache: false,
      inputs: [
        '{projectRoot}/**/*',
        '{projectRoot}/biome.json',
        '{projectRoot}/biome.jsonc',
        '{projectRoot}/package.json',
        '!{projectRoot}/dist/**',
        '!{projectRoot}/node_modules/**',
        '!{projectRoot}/coverage/**',
      ],
    },
    'format-check': {
      executor: 'nx:run-commands',
      options: {
        command: 'biome format .',
        cwd: projectRoot,
      },
      cache: true,
      inputs: [
        '{projectRoot}/**/*',
        '{projectRoot}/biome.json',
        '{projectRoot}/biome.jsonc',
        '{projectRoot}/package.json',
        '!{projectRoot}/dist/**',
        '!{projectRoot}/node_modules/**',
        '!{projectRoot}/coverage/**',
      ],
    },
  }

  if (includeLint) {
    targets.lint = {
      executor: 'nx:run-commands',
      options: {
        command: 'biome lint .',
        cwd: projectRoot,
      },
      cache: true,
      inputs: [
        '{projectRoot}/**/*',
        '{projectRoot}/biome.json',
        '{projectRoot}/biome.jsonc',
        '{projectRoot}/package.json',
        '!{projectRoot}/dist/**',
        '!{projectRoot}/node_modules/**',
        '!{projectRoot}/coverage/**',
      ],
    }
  }

  return targets
}
