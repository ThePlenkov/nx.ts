import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { type CreateNodesV2, logger, workspaceRoot } from '@nx/devkit'

const VERBOSE_RE = /^\s*NX_VERBOSE_LOGGING\s*=\s*["']?true["']?\s*$/m

const MAX_ENV_BYTES = 1024 * 64 // 64 KiB

let cachedVerbose: boolean | null = null

function readEnvVerbose(): boolean {
  if (cachedVerbose !== null) return cachedVerbose
  try {
    const envPath = join(workspaceRoot, '.env')
    if (!existsSync(envPath)) { cachedVerbose = false; return false }
    if (statSync(envPath).size > MAX_ENV_BYTES) { cachedVerbose = false; return false }
    cachedVerbose = readFileSync(envPath, 'utf-8').split('\n').some(
      (l) => !l.trimStart().startsWith('#') && VERBOSE_RE.test(l),
    )
    return cachedVerbose
  } catch {
    cachedVerbose = false
    return false
  }
}

export function isVerbose(): boolean {
  return process.argv.includes('--verbose') ||
    process.env.NX_VERBOSE_LOGGING === 'true' ||
    readEnvVerbose()
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
        const projectRoot = relative(workspaceRootAbs, dirAbs).replace(/\\/g, '/')
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
            `{projectRoot}/tsconfig*.json`,
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
