import type { CreateNodesV2, ProjectConfiguration } from '@nx/devkit'
import { dirname } from 'node:path'

export interface NxCloudPluginOptions {
  /** Target name inferred on the root project. */
  targetName?: string
}

const PLUGIN_NAME = '@nx-devkit/nx-cloud'

export const createNodesV2: CreateNodesV2<NxCloudPluginOptions> = [
  'nx.json',
  (configFiles, options = {}, _context) => {
    const targetName = options.targetName ?? 'nx-cloud-rotate'
    const results: (readonly [string, { projects: Record<string, ProjectConfiguration> }])[] = []
    for (const configFile of configFiles) {
      const normalized = configFile.replace(/\\/g, '/')
      if (dirname(normalized) !== '.') {
        continue
      }
      results.push([
        configFile,
        {
          projects: {
            '.': {
              targets: {
                [targetName]: {
                  executor: `${PLUGIN_NAME}:rotate`,
                  options: {},
                },
              },
            },
          },
        },
      ])
    }
    return results
  },
]

const plugin = { createNodesV2, name: PLUGIN_NAME }
export default plugin
