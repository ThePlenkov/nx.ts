import { getProjects, updateProjectConfiguration, type Tree } from '@nx/devkit'

/**
 * Migration: replace nx:run-commands with @nx-devkit/typescript:typecheck
 * for any project that has a typecheck target using run-commands with
 * tsc/tsgo --build.
 *
 * Walks all projects in the workspace, finds typecheck targets using
 * `nx:run-commands` with tsc/tsgo commands, and replaces them with the
 * custom `@nx-devkit/typescript:typecheck` executor.
 *
 * Only migrates commands that match the exact supported forms:
 *   - `tsc --build <config>`
 *   - `tsgo --build <config>`
 *   - `tsc --build --clean <config>` (and reverse order)
 *
 * Commands with additional flags, shell composition (&&, |, ;), or a
 * cwd different from the project root are skipped to avoid silently
 * changing behavior.
 */
export default function replaceTypecheckExecutor(tree: Tree): void {
  const projects = getProjects(tree)

  for (const [projectName, projectConfig] of projects) {
    const typecheck = projectConfig.targets?.typecheck
    if (!typecheck) continue

    if (typecheck.executor !== 'nx:run-commands') continue

    const options = typecheck.options as { command?: string; cwd?: string } | undefined
    const command = options?.command
    if (!command) continue

    // Skip shell composition — the executor runs a single command
    if (/[;&|]/.test(command)) continue

    const trimmed = command.trim()

    // Match: <bin> --build [--clean] <config>  (or --clean before --build)
    const match = trimmed.match(
      /^(tsc|tsgo)\s+--build(?:\s+--clean)?\s+(\S+\.json)$/,
    )
    const matchCleanFirst = trimmed.match(
      /^(tsc|tsgo)\s+--clean\s+--build\s+(\S+\.json)$/,
    )
    const m = match ?? matchCleanFirst
    if (!m) continue

    const bin = m[1]
    const configFile = m[2]
    const hasClean = Boolean(match?.[0]?.includes('--clean') ?? matchCleanFirst)

    // Skip if the target sets a cwd different from the project root —
    // the executor always resolves config relative to the project root.
    if (options?.cwd && options.cwd !== projectConfig.root && options.cwd !== '.') {
      continue
    }

    typecheck.executor = '@nx-devkit/typescript:typecheck'
    typecheck.options = {
      tsgo: bin === 'tsgo',
      configFile,
      clean: hasClean,
    }

    updateProjectConfiguration(tree, projectName, projectConfig)
  }
}
