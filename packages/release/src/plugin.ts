import type { CreateNodesV2, ProjectConfiguration } from '@nx/devkit'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'

export interface NxReleasePluginOptions {
  /** Path to the tools project that hosts the release target. */
  toolsProject?: string
  /** Target name inferred on the tools project. */
  targetName?: string
}

const PLUGIN_NAME = '@nx-devkit/release'

/**
 * Detect whether a project.json references the release executor shipped by
 * this plugin. Used by `createNodesV2` to auto-wire a `release` target.
 */
export function isReleaseProject(
  configFile: string,
  workspaceRoot: string,
  executor = `${PLUGIN_NAME}:publish`,
): boolean {
  const configDir = dirname(configFile)
  const projectRoot = isAbsolute(configDir) ? configDir : join(workspaceRoot, configDir)
  const projectJsonPath = join(projectRoot, 'project.json')
  if (!existsSync(projectJsonPath)) return false
  let contents: string
  try {
    contents = readFileSync(projectJsonPath, 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return false
    throw error
  }
  try {
    const raw = JSON.parse(contents) as Record<string, unknown>
    const targets = (raw.targets ?? {}) as Record<string, Record<string, unknown>>
    return Object.values(targets).some(
      (t) => typeof t.executor === 'string' && t.executor === executor,
    )
  } catch (error) {
    if (error instanceof SyntaxError) return false
    throw error
  }
}

export const createNodesV2: CreateNodesV2<NxReleasePluginOptions> = [
  '**/project.json',
  (configFiles, options = {}, context) => {
    const targetName = options.targetName ?? 'release'
    const toolsProjectRoot = options.toolsProject
      ?.replace(/\\/g, '/')
      .replace(/^\.\//, '')
      .replace(/\/+$/, '')
    const results: (readonly [string, { projects: Record<string, ProjectConfiguration> }])[] = []
    for (const configFile of configFiles) {
      const normalized = configFile.replace(/\\/g, '/')
      if (!isReleaseProject(normalized, context.workspaceRoot)) continue
      const projectRoot = dirname(normalized).replace(/\/+$/, '')
      if (projectRoot === '' || projectRoot === '.' || projectRoot === context.workspaceRoot)
        continue
      if (toolsProjectRoot && projectRoot !== toolsProjectRoot) continue
      results.push([
        configFile,
        {
          projects: {
            [projectRoot]: {
              targets: {
                [targetName]: {
                  executor: `${PLUGIN_NAME}:publish`,
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
