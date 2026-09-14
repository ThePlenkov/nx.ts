import { getProjects, updateProjectConfiguration, type Tree } from '@nx/devkit'

/**
 * Migration: replace nx:run-commands with @nx-devkit/typescript:build
 * for any project that has a build target using run-commands with tsdown.
 *
 * Walks all projects in the workspace, finds build targets using
 * `nx:run-commands` with tsdown commands, and replaces them with the
 * custom `@nx-devkit/typescript:build` executor.
 *
 * Only migrates commands that match the exact supported forms:
 *   - `tsdown`
 *   - `tsdown --watch`
 *
 * Commands with additional flags or shell composition are skipped to
 * avoid silently dropping behavior. The `cwd` option is preserved if
 * it differs from the project root (the executor always runs from the
 * project root, so a different cwd would change behavior).
 */
export default function replaceBuildExecutor(tree: Tree): void {
  const projects = getProjects(tree)

  for (const [projectName, projectConfig] of projects) {
    const build = projectConfig.targets?.build
    if (!build) continue

    if (build.executor !== 'nx:run-commands') continue

    const options = build.options as { command?: string; cwd?: string } | undefined
    const command = options?.command
    if (!command) continue

    // Only migrate exact supported forms: `tsdown` or `tsdown --watch`
    const trimmed = command.trim()
    const isPlain = trimmed === 'tsdown'
    const isWatch = trimmed === 'tsdown --watch'
    if (!isPlain && !isWatch) continue

    // Skip if the target sets a cwd different from the project root —
    // the executor always runs from the project root, so a different
    // cwd would change behavior.
    if (options?.cwd && options.cwd !== projectConfig.root && options.cwd !== '.') {
      continue
    }

    build.executor = '@nx-devkit/typescript:build'
    build.options = isWatch ? { watch: true } : {}

    updateProjectConfiguration(tree, projectName, projectConfig)
  }
}
