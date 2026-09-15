import type { ProjectConfiguration, TargetConfiguration } from '@nx/devkit'

/**
 * Extract the single shell command from an `nx:run-commands` target.
 *
 * Supports both supported forms:
 *   options: { command: 'tsc --build tsconfig.json' }
 *   options: { commands: ['tsc --build tsconfig.json'] }
 *   options: { commands: [{ command: 'tsc --build tsconfig.json' }] }
 *
 * Returns `null` when the target uses the multi-command `commands`
 * array — a custom executor cannot represent sequential commands, so
 * migrating would silently drop steps.
 */
export function getSingleRunCommand(
  target: TargetConfiguration | undefined,
): string | null {
  if (!target || target.executor !== 'nx:run-commands') return null
  const options = target.options as
    | {
        command?: string
        commands?: (string | { command: string })[]
      }
    | undefined
  if (!options) return null

  if (typeof options.command === 'string') return options.command

  const commands = options.commands
  if (!Array.isArray(commands) || commands.length !== 1) return null
  const entry = commands[0]
  if (typeof entry === 'string') return entry
  return typeof entry?.command === 'string' ? entry.command : null
}

/**
 * Whether a run-commands `cwd` resolves to the project root.
 *
 * `nx:run-commands` resolves `cwd` relative to the workspace root and
 * defaults to the workspace root when unset — not to the project root.
 * So a target with no `cwd` ran from the workspace root; rewriting it
 * to a custom executor that resolves config under the project root
 * would silently change which files are processed. Only migrate when
 * `cwd` is explicitly the project root (`'{projectRoot}'` counts — Nx
 * interpolates it), or when the project IS the workspace root and cwd
 * is unset/`'.'` — in that case both resolve to the same directory.
 */
export function cwdResolvesToProjectRoot(
  cwd: string | undefined,
  project: ProjectConfiguration,
): boolean {
  const projectRoot = project.root || '.'
  if (cwd === '{projectRoot}') return true
  if (cwd === projectRoot) return true
  const cwdUnset = cwd === undefined || cwd === '' || cwd === '.'
  const isRootProject = projectRoot === '.' || projectRoot === ''
  return cwdUnset && isRootProject
}

/** Read the `cwd` option from an nx:run-commands target. */
export function getTargetCwd(target: TargetConfiguration): string | undefined {
  const options = target.options as { cwd?: string } | undefined
  return options?.cwd
}
