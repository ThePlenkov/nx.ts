import { getProjects, updateProjectConfiguration, type Tree } from '@nx/devkit'
import { cwdResolvesToProjectRoot, getSingleRunCommand, getTargetCwd } from '../utils.js'

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
 * Commands with additional flags or shell composition (&&, |, ;) are
 * skipped to avoid silently changing behavior. A target is only
 * rewritten when its `cwd` explicitly resolves to the project root —
 * `nx:run-commands` defaults `cwd` to the workspace root, so rewriting
 * an unset/mismatched cwd would silently change which tsconfig is built.
 */
export default function replaceTypecheckExecutor(tree: Tree): void {
  const projects = getProjects(tree)

  for (const [projectName, projectConfig] of projects) {
    const typecheck = projectConfig.targets?.typecheck
    if (!typecheck) continue

    const command = getSingleRunCommand(typecheck)
    if (!command) continue

    // Skip shell composition — the executor runs a single command
    if (/[;&|]/.test(command)) continue

    const trimmed = command.trim()

    // Match: <bin> --build [--clean] <config>  (or --clean before --build)
    // eslint-disable-next-line security/detect-unsafe-regex -- bounded input (a single command line); alternation is literal
    const RE_BUILD = /^(tsc|tsgo)\s+--build(?:\s+--clean)?\s+(\S+\.json)$/
    // eslint-disable-next-line security/detect-unsafe-regex -- bounded input (a single command line); alternation is literal
    const RE_CLEAN_FIRST = /^(tsc|tsgo)\s+--clean\s+--build\s+(\S+\.json)$/
    const match = trimmed.match(RE_BUILD)
    const matchCleanFirst = trimmed.match(RE_CLEAN_FIRST)
    const m = match ?? matchCleanFirst
    if (!m) continue

    const bin = m[1]
    const configFile = m[2]
    const hasClean = Boolean(match?.[0]?.includes('--clean') ?? matchCleanFirst)

    if (!cwdResolvesToProjectRoot(getTargetCwd(typecheck), projectConfig)) continue

    typecheck.executor = '@nx-devkit/typescript:typecheck'
    typecheck.options = {
      tsgo: bin === 'tsgo',
      configFile,
      clean: hasClean,
    }

    updateProjectConfiguration(tree, projectName, projectConfig)
  }
}
