import { readFileSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { CreateNodesV2, ProjectConfiguration, TargetConfiguration } from '@nx/devkit'

const OXLINT_RC_GLOB = '**/.oxlintrc.{json,yml,yaml,cjs,mjs,js,cts,mts}'

function inferLintTarget(projectRoot: string): TargetConfiguration {
  return {
    executor: 'nx:run-commands',
    cache: true,
    inputs: ['{projectRoot}/src/**/*', '{projectRoot}/.oxlintrc.*', '{projectRoot}/package.json'],
    options: {
      command: 'npx oxlint .',
      cwd: projectRoot || '.',
    },
  }
}

const MAX_OXLINTRC_BYTES = 1024 * 1024 // 1 MiB

function readOxLintrc(file: string): Record<string, unknown> | null {
  try {
    if (statSync(file).size > MAX_OXLINTRC_BYTES) {
      return null
    }
    const raw = readFileSync(file, 'utf-8')
    if (file.endsWith('.json')) {
      try {
        return JSON.parse(raw) as Record<string, unknown>
      } catch {
        return { '//': 'oxlint config may contain comments/trailing commas' } as Record<
          string,
          unknown
        >
      }
    }
    return { '//': 'yaml/js configs parsed at runtime by oxlint' } as Record<string, unknown>
  } catch {
    return null
  }
}

export const createNodesV2: CreateNodesV2 = [
  OXLINT_RC_GLOB,
  (projectConfigurationFiles, _options, context) => {
    const workspaceRoot = context.workspaceRoot
    const results: Array<readonly [string, { projects: Record<string, ProjectConfiguration> }]> = []

    for (const configFilePath of projectConfigurationFiles) {
      const fileName = basename(configFilePath)
      if (!fileName.startsWith('.oxlintrc.')) continue

      const projectRoot = dirname(configFilePath).replace(/\\/g, '/')
      if (projectRoot === '' || projectRoot === '.') continue

      const config = readOxLintrc(join(workspaceRoot, configFilePath))
      if (config === null) continue

      const project: ProjectConfiguration = {
        targets: {
          lint: inferLintTarget(projectRoot),
        },
      }
      results.push([configFilePath, { projects: { [projectRoot]: project } }])
    }
    return results
  },
]

export default createNodesV2

export const __testing = {
  inferLintTarget,
  readOxLintrc,
  OXLINT_RC_GLOB,
}
