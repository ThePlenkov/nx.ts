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
        '{projectRoot}/src/**/*',
        '{projectRoot}/biome.json',
        '{projectRoot}/biome.jsonc',
        '{projectRoot}/package.json',
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
        command: 'biome lint .',
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
