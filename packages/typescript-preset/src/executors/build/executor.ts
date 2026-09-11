import { execFile, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

export interface BuildExecutorOptions {
  /** Watch mode — rebuild on file changes. Default: false. */
  watch?: boolean
}

export interface BuildExecutorResult {
  success: boolean
}

interface NxExecutorContext {
  root: string
  projectConfig?: { root?: string }
}

/**
 * Build executor for `@nx-devkit/typescript:build`.
 *
 * Runs `tsdown` via `execFile` (no shell) for security. Detects
 * tsdown config in the project root automatically.
 *
 * In watch mode, the promise resolves after the process starts
 * successfully — the process itself runs indefinitely until killed
 * by Nx when the user stops the watch.
 */
export async function buildExecutor(
  options: BuildExecutorOptions,
  context: NxExecutorContext,
): Promise<BuildExecutorResult> {
  const watch = options.watch ?? false
  const workspaceRoot = context.root
  const projectRoot = context.projectConfig?.root ?? ''
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
    console.error(`[nx-devkit/build] No tsdown.config.* found in ${absProjectRoot}`)
    return { success: false }
  }

  const args = watch ? ['--watch'] : []

  if (watch) {
    // Watch mode: resolve after process starts, don't wait for exit
    return new Promise<BuildExecutorResult>((resolvePromise) => {
      const child: ChildProcess = execFile(
        'tsdown',
        args,
        { cwd: absProjectRoot, shell: false },
        (err) => {
          if (err) {
            console.error(`[nx-devkit/build] tsdown ${args.join(' ')} failed in ${absProjectRoot}`)
            console.error(`[nx-devkit/build] error: ${err.message}`)
            resolvePromise({ success: false })
          }
        },
      )
      // If process starts without immediate error, resolve as success
      child.on('spawn', () => {
        resolvePromise({ success: true })
      })
      child.on('error', (err) => {
        console.error(`[nx-devkit/build] spawn error: ${err.message}`)
        resolvePromise({ success: false })
      })
    })
  }

  return new Promise<BuildExecutorResult>((resolvePromise) => {
    execFile('tsdown', args, { cwd: absProjectRoot, shell: false }, (err, stdout, stderr) => {
      if (err) {
        console.error(`[nx-devkit/build] tsdown ${args.join(' ')} failed in ${absProjectRoot}`)
        console.error(`[nx-devkit/build] error: ${err.message}`)
        if (stdout) console.error(`[nx-devkit/build] stdout: ${stdout}`)
        if (stderr) console.error(`[nx-devkit/build] stderr: ${stderr}`)
        resolvePromise({ success: false })
        return
      }
      resolvePromise({ success: true })
    })
  })
}

export default buildExecutor
