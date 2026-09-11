import { getProjects, updateProjectConfiguration, type Tree } from '@nx/devkit'

/**
 * Migration: replace nx:run-commands with @nx-devkit/typescript:typecheck
 * for any project that has a typecheck target using run-commands with
 * tsc/tsgo --build.
 *
 * Walks all projects in the workspace, finds typecheck targets using
 * `nx:run-commands` with tsc/tsgo commands, and replaces them with the
 * custom `@nx-devkit/typescript:typecheck` executor.
 */
export default async function replaceTypecheckExecutor(tree: Tree): Promise<void> {
  const projects = await getProjects(tree)

  for (const [projectName, projectConfig] of projects) {
    const typecheck = projectConfig.targets?.typecheck
    if (!typecheck) continue

    if (typecheck.executor !== 'nx:run-commands') continue

    const command = (typecheck.options as { command?: string } | undefined)?.command
    if (!command) continue

    // Only migrate if the command uses tsc or tsgo
    if (!/\b(tsc|tsgo)\b/.test(command)) continue

    // Detect if tsgo was used
    const usedTsgo = /\btsgo\b/.test(command)
    // Detect configFile from command
    const configFileMatch = command.match(/(\S+\.json)\s*$/)
    const configFile = configFileMatch?.[1] ?? 'tsconfig.json'
    // Detect --clean flag
    const hasClean = command.includes('--clean')

    typecheck.executor = '@nx-devkit/typescript:typecheck'
    typecheck.options = {
      tsgo: usedTsgo,
      configFile,
      clean: hasClean,
    }

    updateProjectConfiguration(tree, projectName, projectConfig)
  }
}
