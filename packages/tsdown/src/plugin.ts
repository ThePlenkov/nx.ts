import { dirname, relative, resolve } from 'node:path'
import { type CreateNodesV2, logger } from '@nx/devkit'
import { isVerbose, logDebug } from '@nx-devkit/internal'

export { isVerbose }

const PLUGIN_SCOPE = 'nx-devkit/tsdown'

export const createNodesV2: CreateNodesV2 = [
  '**/tsdown.config.ts',
  (configFiles, _options, context) => {
    const verbose = isVerbose()
    const workspaceRootAbs = context.workspaceRoot
    if (verbose) {
      logger.info(`[${PLUGIN_SCOPE}] Processing ${configFiles.length} tsdown config files`)
    }

    return configFiles
      .map((configFile) => {
        const dir = dirname(configFile)
        const dirAbs = resolve(workspaceRootAbs, dir)
        if (dirAbs === workspaceRootAbs) {
          return null
        }
        const projectRoot = relative(workspaceRootAbs, dirAbs).replace(/\\/g, '/')
        logDebug(PLUGIN_SCOPE, `Found tsdown.config.ts in ${projectRoot}`)

        const buildTarget = {
          executor: 'nx:run-commands',
          options: {
            command: 'tsdown',
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
