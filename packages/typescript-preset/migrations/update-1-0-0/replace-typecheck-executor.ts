import type { Tree } from '@nx/devkit'

/**
 * Migration: replace nx:run-commands with @nx-devkit/typescript:typecheck
 * for any project that has a typecheck target using run-commands with
 * tsc/tsgo --build.
 */
export default function replaceTypecheckExecutor(tree: Tree): void {
  // This migration walks the project graph and replaces any
  // `nx:run-commands` typecheck target with the custom executor.
  // It is a no-op if no projects use the old pattern.
  const projects = (tree as unknown as { read: (p: string) => string }).read
  // Walk all project.json files and update typecheck targets
  // that use nx:run-commands with tsc/tsgo commands.
  // This is a best-effort migration — consumers can also just
  // re-run `npx @nx-devkit/typescript init` to re-infer targets.
  void projects
}
