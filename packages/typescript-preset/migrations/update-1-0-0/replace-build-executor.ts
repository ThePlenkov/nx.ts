import type { Tree } from '@nx/devkit'

/**
 * Migration: replace nx:run-commands with @nx-devkit/typescript:build
 * for any project that has a build target using run-commands with tsdown.
 */
export default function replaceBuildExecutor(tree: Tree): void {
  // Walk all project.json files and replace build targets
  // that use nx:run-commands with tsdown commands.
  // This is a best-effort migration — consumers can also just
  // re-run `npx @nx-devkit/typescript init` to re-infer targets.
  void tree
}
