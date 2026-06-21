import type { CreateNodesFunctionV2 } from 'nx/src/project-graph/plugins/public-api'

const PLUGIN_NAME = '@nx-devkit/biome'
const WORKSPACE_ROOT_MARKER = 'biome.json'

export interface BiomePluginOptions {
  formatCommand?: string
  formatCheckCommand?: string
  lintCommand?: string
}

export interface BiomeTargetOptions {
  command: string
  cwd: string
}

export interface BiomeTarget {
  executor: 'nx:run-commands'
  options: BiomeTargetOptions
  cache: boolean
  inputs: string[]
}

export interface BiomeProjectConfiguration {
  projects: Record<string, { targets: Record<string, BiomeTarget> }>
}

export type BiomeCreateNodesResult = ReadonlyArray<readonly [string, BiomeProjectConfiguration]>

function isWorkspaceRoot(configFilePath: string): boolean {
  const normalized = configFilePath.replaceAll('\\', '/')
  return normalized === WORKSPACE_ROOT_MARKER || normalized === 'biome.jsonc'
}

function inferBiomeTargets(
  projectRoot: string,
  configFileBasename: string,
  options: BiomePluginOptions | undefined,
): Record<string, BiomeTarget> {
  const formatCommand = options?.formatCommand ?? 'npx biome format --write .'
  const formatCheckCommand = options?.formatCheckCommand ?? 'npx biome format .'
  const lintCommand = options?.lintCommand ?? 'npx biome lint .'

  const configInput = `{projectRoot}/${configFileBasename}`
  const baseInputs: string[] = [configInput, '{projectRoot}/src/**/*']

  return {
    format: {
      executor: 'nx:run-commands',
      options: { command: formatCommand, cwd: projectRoot },
      cache: false,
      inputs: baseInputs,
    },
    'format-check': {
      executor: 'nx:run-commands',
      options: { command: formatCheckCommand, cwd: projectRoot },
      cache: true,
      inputs: baseInputs,
    },
    lint: {
      executor: 'nx:run-commands',
      options: { command: lintCommand, cwd: projectRoot },
      cache: true,
      inputs: baseInputs,
    },
  }
}

const createNodesFn: CreateNodesFunctionV2<BiomePluginOptions> = (
  configFiles,
  options,
  context,
) => {
  const workspaceRoot = context.workspaceRoot.replaceAll('\\', '/')
  const results: BiomeCreateNodesResult = []

  for (const configFile of configFiles) {
    const normalized = configFile.replaceAll('\\', '/')

    if (isWorkspaceRoot(normalized)) {
      continue
    }

    const projectRoot = normalized.replace(/\/biome\.jsonc?$/, '')
    if (projectRoot === '' || projectRoot === '.' || projectRoot === workspaceRoot) {
      continue
    }

    const configFileBasename = normalized.split('/').pop() ?? 'biome.json'

    results.push([
      configFile,
      {
        projects: {
          [projectRoot]: {
            targets: inferBiomeTargets(projectRoot, configFileBasename, options),
          },
        },
      },
    ])
  }

  return results as unknown as ReturnType<CreateNodesFunctionV2<BiomePluginOptions>>
}

export const createNodesV2: readonly ['**/biome.json{,c}', CreateNodesFunctionV2<BiomePluginOptions>] =
  ['**/biome.json{,c}', createNodesFn]

export default { createNodesV2, name: PLUGIN_NAME }
