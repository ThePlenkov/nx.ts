import { getProjects, updateProjectConfiguration, type Tree } from '@nx/devkit'
import { cwdResolvesToProjectRoot, getSingleRunCommand, getTargetCwd } from '../utils.js'

/**
 * Migration: replace nx:run-commands with @nx-devkit/typescript:build
 * for any project that has a build (or build:watch) target using
 * run-commands with tsdown.
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
 * avoid silently dropping behavior. A target is only rewritten when its
 * `cwd` explicitly resolves to the project root — `nx:run-commands`
 * defaults `cwd` to the workspace root, so rewriting an unset/mismatched
 * cwd would silently change which config tsdown loads. Watch targets are
 * marked non-cacheable (`cache: false`) because they never exit.
 */
export default function replaceBuildExecutor(tree: Tree): void {
  const projects = getProjects(tree)

  for (const [projectName, projectConfig] of projects) {
    for (const targetName of ['build', 'build:watch'] as const) {
      // eslint-disable-next-line security/detect-object-injection -- targetName is a literal union member
      const target = projectConfig.targets?.[targetName]
      if (!target) continue

      const command = getSingleRunCommand(target)
      if (!command) continue

      // Only migrate exact supported forms: `tsdown` or `tsdown --watch`
      const trimmed = command.trim()
      const isPlain = trimmed === 'tsdown'
      const isWatch = trimmed === 'tsdown --watch'
      if (!isPlain && !isWatch) continue

      if (!cwdResolvesToProjectRoot(getTargetCwd(target), projectConfig)) continue

      const watch = isWatch || targetName === 'build:watch'
      target.executor = '@nx-devkit/typescript:build'
      target.options = watch ? { watch: true } : {}
      if (watch) {
        // Watch tasks never exit — caching them lets Nx skip or
        // incorrectly restore the long-running target.
        target.cache = false
      }

      updateProjectConfiguration(tree, projectName, projectConfig)
    }
  }
}
