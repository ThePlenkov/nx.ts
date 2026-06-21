import type { CreateNodesV2, NxPluginV2 } from '@nx/devkit'
import { loadFeatureFlags, isFeatureEnabled, type FeatureFlagsConfig } from './feature-flags'

export interface FeatureFlagsPluginOptions {
  configFile?: string
}

function extractProjectRoot(configFile: string, workspaceRoot: string): string {
  const normalizedConfig = configFile.replace(/\\/g, '/')
  const normalizedRoot = workspaceRoot.replace(/\\/g, '/')

  let relativePath = normalizedConfig
  if (normalizedConfig.startsWith(normalizedRoot)) {
    relativePath = normalizedConfig.slice(normalizedRoot.length + 1)
  }

  const parts = relativePath.split('/')
  parts.pop()
  return parts.join('/') || '.'
}

const createNodesFn: CreateNodesV2<FeatureFlagsPluginOptions>[1] = (
  configFiles,
  _options,
  context,
) => {
  const config: FeatureFlagsConfig = loadFeatureFlags(context.workspaceRoot)

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
  '**/.feature-flags.json',
  createNodesFn,
]

export const plugin: NxPluginV2<FeatureFlagsPluginOptions> = {
  createNodesV2,
  name: '@nx-devkit/feature-flags',
}

export default plugin
