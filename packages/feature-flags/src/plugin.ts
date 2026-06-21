import type { CreateNodesV2, NxPluginV2 } from '@nx/devkit'
import { dirname, relative, resolve, isAbsolute } from 'node:path'
import { loadFeatureFlags, isFeatureEnabled, type FeatureFlagsConfig } from './feature-flags'

export interface FeatureFlagsPluginOptions {
  configFile?: string
}

function extractProjectRoot(configFile: string, workspaceRoot: string): string {
  const absConfig = isAbsolute(configFile) ? configFile : resolve(workspaceRoot, configFile)
  const projectDir = dirname(absConfig)
  const rel = relative(workspaceRoot, projectDir)
  return rel || '.'
}

const createNodesFn: CreateNodesV2<FeatureFlagsPluginOptions>[1] = (
  configFiles,
  options,
  context,
) => {
  const configFilePath = options?.configFile
    ? resolve(context.workspaceRoot, options.configFile)
    : resolve(context.workspaceRoot, '.feature-flags.json')

  let config: FeatureFlagsConfig
  try {
    config = loadFeatureFlags(configFilePath)
  } catch {
    return []
  }

  if (Object.keys(config.flags).length === 0) {
    return []
  }

  return configFiles.map((configFile) => {
    const projectRoot = extractProjectRoot(configFile, context.workspaceRoot)
    const resolvedFlags: Record<string, boolean> = {}

    for (const [flagName, definition] of Object.entries(config.flags)) {
      resolvedFlags[flagName] = isFeatureEnabled(projectRoot, flagName, definition)
    }

    return [
      configFile,
      {
        projects: {
          [projectRoot]: {
            metadata: { featureFlags: resolvedFlags },
          },
        },
      },
    ] as const
  })
}

export const createNodesV2: CreateNodesV2<FeatureFlagsPluginOptions> = [
  '.feature-flags.json',
  createNodesFn,
]

export const plugin: NxPluginV2<FeatureFlagsPluginOptions> = {
  createNodesV2,
  name: '@nx-devkit/feature-flags',
}

export default plugin
