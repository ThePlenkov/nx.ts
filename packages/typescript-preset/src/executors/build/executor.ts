import { execFile, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { resolveBinLaunch } from '@nx-devkit/internal'

export interface BuildExecutorOptions {
  /** Watch mode — rebuild on file changes. Default: false. */
  watch?: boolean
}

export interface BuildExecutorResult {
  success: boolean
}

interface NxExecutorContext {
  root: string
  projectName?: string
  projectsConfigurations?: { projects?: Record<string, { root?: string }> }
}

// Bundler/compiler output on failure can exceed execFile's 1 MiB
// default maxBuffer — truncating it would hide the real errors.
const MAX_BUFFER = 16 * 1024 * 1024

/**
 * Build executor for `@nx-devkit/typescript:build`.
 *
 * Runs `tsdown` via `execFile` (no shell) for security. Detects
 * tsdown config in the project root automatically.
 *
 * In watch mode the promise stays pending for the life of the child —
 * resolving early would make Nx consider the task complete and kill the
 * watcher. Output is inherited so rebuilds stream live; Nx terminates
 * the process group when the user stops the watch.
 */
export async function buildExecutor(
  options: BuildExecutorOptions,
  context: NxExecutorContext,
): Promise<BuildExecutorResult> {
  const watch = options.watch ?? false
  const workspaceRoot = context.root
  const projectName = context.projectName ?? ''
  const projects = context.projectsConfigurations?.projects ?? {}
  const projectConfig = Object.hasOwn(projects, projectName) ? projects[projectName] : undefined
  const projectRoot = projectConfig?.root ?? ''
  const absProjectRoot = resolve(workspaceRoot, projectRoot)

  const configNames = [
    'tsdown.config.ts',
    'tsdown.config.js',
    'tsdown.config.mts',
    'tsdown.config.mjs',
    'tsdown.config.cts',
    'tsdown.config.cjs',
  ]

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- candidate names are fixed config basenames joined to the project root
  const hasConfig = configNames.some((name) => existsSync(join(absProjectRoot, name)))
  if (!hasConfig) {
    console.error(`[nx-devkit/build] No tsdown.config.* found in ${absProjectRoot}`)
    return { success: false }
  }

  const args = watch ? ['--watch'] : []
  // Resolve through the owning package's `bin` field and launch Node
  // scripts via process.execPath — `.bin` shims are shell scripts /
  // `.cmd` wrappers that cannot run with `shell: false`.
  const launch = resolveBinLaunch('tsdown', 'tsdown', absProjectRoot, workspaceRoot)
  const fullArgs = [...launch.prependArgs, ...args]

  if (watch) {
    // Watch mode: keep the promise pending until the child exits so Nx
    // treats the task as long-running. Inherit stdio for live rebuild
    // output; Nx kills the process when the user interrupts.
    return new Promise<BuildExecutorResult>((resolvePromise) => {
      const child: ChildProcess = execFile(launch.command, fullArgs, {
        cwd: absProjectRoot,
        shell: false,
        stdio: 'inherit',
      })
      child.on('error', (err) => {
        console.error(`[nx-devkit/build] spawn error: ${err.message}`)
        resolvePromise({ success: false })
      })
      child.on('exit', (code) => {
        resolvePromise({ success: code === 0 })
      })
    })
  }

  return new Promise<BuildExecutorResult>((resolvePromise) => {
    execFile(
      launch.command,
      fullArgs,
      { cwd: absProjectRoot, shell: false, maxBuffer: MAX_BUFFER },
      (err, stdout, stderr) => {
        if (err) {
          console.error(`[nx-devkit/build] tsdown ${args.join(' ')} failed in ${absProjectRoot}`)
          console.error(`[nx-devkit/build] error: ${err.message}`)
          if (stdout) console.error(`[nx-devkit/build] stdout: ${stdout}`)
          if (stderr) console.error(`[nx-devkit/build] stderr: ${stderr}`)
          resolvePromise({ success: false })
          return
        }
        resolvePromise({ success: true })
      },
    )
  })
}

export default buildExecutor
