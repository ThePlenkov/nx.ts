import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { CreateNodesV2, ProjectConfiguration, TargetConfiguration } from '@nx/devkit'

const OXLINT_RC_GLOB = '**/.oxlintrc.{json,yml,yaml,cjs,mjs,js,cts,mts}'

function inferLintTarget(projectRoot: string): TargetConfiguration {
  return {
    executor: 'nx:run-commands',
    cache: true,
    inputs: ['{projectRoot}/src/**/*', '{projectRoot}/.oxlintrc.*', '{projectRoot}/package.json'],
    options: {
      command: 'oxlint .',
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

function findPackageJsonDirs(workspaceRoot: string): string[] {
  const dirs: string[] = []
  const pkgsDir = join(workspaceRoot, 'packages')
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- pkgsDir is composed from the trusted workspaceRoot provided by Nx
    const entries = readdirSync(pkgsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name === 'node_modules') continue
      try {
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- entry.name is a directory entry under the trusted workspaceRoot, joined into a fixed package.json path
        statSync(join(pkgsDir, entry.name, 'package.json'))
        dirs.push(join('packages', entry.name))
      } catch {
        // no package.json — skip
      }
    }
  } catch {
    // packages/ dir doesn't exist — skip
  }
  return dirs
}

export const createNodesV2: CreateNodesV2 = [
  OXLINT_RC_GLOB,
  (projectConfigurationFiles, _options, context) => {
    const workspaceRoot = context.workspaceRoot
    const results: Array<readonly [string, { projects: Record<string, ProjectConfiguration> }]> = []
    const coveredRoots = new Set<string>()

    for (const configFilePath of projectConfigurationFiles) {
      const fileName = basename(configFilePath)
      if (!fileName.startsWith('.oxlintrc.')) continue

      const projectRoot = dirname(configFilePath).replace(/\\/g, '/')
      if (projectRoot === '' || projectRoot === '.') continue

      const config = readOxLintrc(join(workspaceRoot, configFilePath))
      if (config === null) continue

      coveredRoots.add(projectRoot)
      const project: ProjectConfiguration = {
        root: projectRoot,
        targets: {
          lint: inferLintTarget(projectRoot),
        },
      }
      results.push([configFilePath, { projects: { [projectRoot]: project } }])
    }

    const rootConfig = readOxLintrc(join(workspaceRoot, '.oxlintrc.json'))
    if (rootConfig !== null) {
      const allProjectRoots = findPackageJsonDirs(workspaceRoot)
      for (const projectRoot of allProjectRoots) {
        if (coveredRoots.has(projectRoot)) continue
        const project: ProjectConfiguration = {
          root: projectRoot,
          targets: {
            lint: inferLintTarget(projectRoot),
          },
        }
        results.push(['.oxlintrc.json', { projects: { [projectRoot]: project } }])
      }
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
