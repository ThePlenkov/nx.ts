import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { type CreateNodesV2, logger, workspaceRoot } from '@nx/devkit'

let cachedEnv: { exists: boolean; verbose: boolean } | null = null

function readEnv(): { exists: boolean; verbose: boolean } {
  if (cachedEnv) return cachedEnv
  try {
    const envPath = join(workspaceRoot, '.env')
    if (!existsSync(envPath)) {
      cachedEnv = { exists: false, verbose: false }
      return cachedEnv
    }
    const stat = statSync(envPath)
    if (stat.size > 1_048_576) {
      cachedEnv = { exists: true, verbose: false }
      return cachedEnv
    }
    const fd = openSync(envPath, 'r')
    try {
      const buf = Buffer.alloc(Math.min(stat.size, 4096))
      readSync(fd, buf, 0, buf.length, 0)
      const content = buf.toString('utf-8')
      const verbose = content
        .split('\n')
        .some(
          (line) => !line.trimStart().startsWith('#') && line.includes('NX_VERBOSE_LOGGING=true'),
        )
      cachedEnv = { exists: true, verbose }
      return cachedEnv
    } finally {
      closeSync(fd)
    }
  } catch {
    cachedEnv = { exists: false, verbose: false }
    return cachedEnv
  }
}

export function isVerbose(): boolean {
  if (process.argv.includes('--verbose')) {
    return true
  }
  if (process.env.NX_VERBOSE_LOGGING === 'true') {
    return true
  }
  return readEnv().verbose
}

function logDebug(message: string): void {
  if (isVerbose()) {
    logger.info(`[nx-devkit/tsdown] ${message}`)
  }
}

export const createNodesV2: CreateNodesV2 = [
  '**/tsdown.config.ts',
  (configFiles, _options, context) => {
    const verbose = isVerbose()
    const workspaceRootAbs = context.workspaceRoot
    if (verbose) {
      logger.info(`[nx-devkit/tsdown] Processing ${configFiles.length} tsdown config files`)
    }

    return configFiles
      .map((configFile) => {
        const dir = dirname(configFile)
        const dirAbs = resolve(workspaceRootAbs, dir)
        if (dirAbs === workspaceRootAbs) {
          return null
        }
        const projectRoot = relative(workspaceRootAbs, dirAbs)
        logDebug(`Found tsdown.config.ts in ${projectRoot}`)

        const buildTarget = {
          executor: 'nx:run-commands',
          options: {
            command: 'npx tsdown',
            cwd: projectRoot,
          },
          outputs: [`{projectRoot}/dist`],
          cache: true,
          inputs: [
            `{projectRoot}/src/**/*.ts`,
            `{projectRoot}/tsconfig.lib.json`,
            `{projectRoot}/tsdown.config.ts`,
            `{projectRoot}/package.json`,
          ],
          dependsOn: ['^build'],
        }

        return [
          configFile,
          {
            projects: {
              [projectRoot]: {
                targets: {
                  build: buildTarget,
                },
              },
            },
          },
        ] as const
      })
      .filter((result): result is NonNullable<typeof result> => result !== null)
  },
]
