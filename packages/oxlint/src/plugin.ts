import { readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, relative } from 'node:path'
import type { CreateNodesV2, ProjectConfiguration, TargetConfiguration } from '@nx/devkit'

const OXLINT_RC_PATTERN = /(^|\/)\.oxlintrc\.(json|ya?ml|[cm]?js)$/

// Cap the size of an .oxlintrc file we will parse. A malicious or
// accidentally huge config file should not be loaded into memory.
const MAX_OXLINT_RC_BYTES = 1 * 1024 * 1024 // 1 MiB

function inferLintTarget(projectRoot: string, workspaceRoot: string): TargetConfiguration {
  const absProjectRoot = isAbsolute(projectRoot) ? projectRoot : join(workspaceRoot, projectRoot)
  const cwd = relative(workspaceRoot, absProjectRoot) || '.'
  return {
    executor: 'nx:run-commands',
    cache: true,
    inputs: ['{projectRoot}/src/**/*', '{projectRoot}/.oxlintrc.*', '{projectRoot}/package.json'],
    options: {
      command: 'npx oxlint .',
      cwd,
    },
  }
}

function readOxLintrc(file: string): Record<string, unknown> | null {
  try {
    const stat = statSync(file)
    if (!stat.isFile() || stat.size > MAX_OXLINT_RC_BYTES) {
      return null
    }
    const raw = readFileSync(file, 'utf-8')
    if (file.endsWith('.json')) {
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return null
      }
      return parsed as Record<string, unknown>
    }
    return { '//': 'yaml/js configs parsed at runtime by oxlint' } as Record<string, unknown>
  } catch {
    return null
  }
}

export const createNodesV2: CreateNodesV2 = [
  OXLINT_RC_PATTERN.source,
  (projectConfigurationFiles, _options, context) => {
    const workspaceRoot = context.workspaceRoot
    const results: Array<readonly [string, { projects: Record<string, ProjectConfiguration> }]> = []

    for (const configFilePath of projectConfigurationFiles) {
      const fileName = configFilePath.replace(/\\/g, '/').split('/').pop() ?? ''
      if (!OXLINT_RC_PATTERN.test(fileName)) continue

      const configFilePathAbs = isAbsolute(configFilePath)
        ? configFilePath
        : join(workspaceRoot, configFilePath)
      const projectRootAbs = dirname(configFilePathAbs)
      const projectRoot = relative(workspaceRoot, projectRootAbs)
      if (projectRoot === '' || projectRoot === '.') continue

      const config = readOxLintrc(configFilePathAbs)
      if (config === null) continue

      const project: ProjectConfiguration = {
        targets: {
          lint: inferLintTarget(projectRootAbs, workspaceRoot),
        },
      }
      results.push([configFilePath, { projects: { [projectRoot]: project } }])
    }
    return results
  },
]

export const createNodes = createNodesV2

export default createNodesV2

export const __testing = {
  inferLintTarget,
  readOxLintrc,
  OXLINT_RC_PATTERN,
}
