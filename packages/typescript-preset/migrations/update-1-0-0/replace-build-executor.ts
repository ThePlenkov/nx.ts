import { getProjects, updateProjectConfiguration, type Tree } from '@nx/devkit'

/**
 * Migration: replace nx:run-commands with @nx-devkit/typescript:build
 * for any project that has a build target using run-commands with tsdown.
 *
 * Walks all projects in the workspace, finds build targets using
 * `nx:run-commands` with tsdown commands, and replaces them with the
 * custom `@nx-devkit/typescript:build` executor.
 */
export default async function replaceBuildExecutor(tree: Tree): Promise<void> {
  const projects = await getProjects(tree)

  for (const [projectName, projectConfig] of projects) {
    const build = projectConfig.targets?.build
    if (!build) continue

    if (build.executor !== 'nx:run-commands') continue

    const command = (build.options as { command?: string } | undefined)?.command
    if (!command) continue

    // Only migrate if the command uses tsdown
    if (!/\btsdown\b/.test(command)) continue

    // Detect --watch flag
    const isWatch = command.includes('--watch')

    build.executor = '@nx-devkit/typescript:build'
    build.options = isWatch ? { watch: true } : {}

    updateProjectConfiguration(tree, projectName, projectConfig)
  }
}
