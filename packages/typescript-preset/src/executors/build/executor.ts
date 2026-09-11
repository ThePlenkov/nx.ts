import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

export interface BuildExecutorOptions {
  /** Watch mode — rebuild on file changes. Default: false. */
  watch?: boolean
}

export interface BuildExecutorResult {
  success: boolean
}

/**
 * Build executor for `@nx-devkit/typescript:build`.
 *
 * Runs `tsdown` via `execFile` (no shell) for security. Detects
 * tsdown config in the project root automatically.
 */
export async function buildExecutor(
  options: BuildExecutorOptions,
  context: { projectRoot: string; workspaceRoot: string },
): Promise<BuildExecutorResult> {
  const watch = options.watch ?? false
  const projectRoot = context.projectRoot
  const workspaceRoot = context.workspaceRoot
  const absProjectRoot = resolve(workspaceRoot, projectRoot)

  const configNames = [
    'tsdown.config.ts',
    'tsdown.config.js',
    'tsdown.config.mts',
    'tsdown.config.mjs',
    'tsdown.config.cts',
    'tsdown.config.cjs',
  ]

  const hasConfig = configNames.some((name) => existsSync(join(absProjectRoot, name)))
  if (!hasConfig) {
    return { success: false }
  }

  const args = watch ? ['--watch'] : []

  return new Promise<BuildExecutorResult>((resolvePromise) => {
    execFile('tsdown', args, { cwd: absProjectRoot, shell: false }, (err) => {
      if (err) {
        resolvePromise({ success: false })
        return
      }
      resolvePromise({ success: true })
    })
  })
}

export default buildExecutor
