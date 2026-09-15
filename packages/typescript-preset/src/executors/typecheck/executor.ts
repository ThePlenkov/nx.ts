import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { resolveBinLaunch } from '@nx-devkit/internal'

export interface TypecheckExecutorOptions {
  /** Use @typescript/native-preview (tsgo) instead of tsc. Default: true. */
  tsgo?: boolean
  /** Name of the tsconfig file to build. Default: "tsconfig.json". */
  configFile?: string
  /** Pre-clean the tsbuildinfo before building. Default: false. */
  clean?: boolean
}

export interface TypecheckExecutorResult {
  success: boolean
}

interface NxExecutorContext {
  root: string
  projectName?: string
  projectsConfigurations?: { projects?: Record<string, { root?: string }> }
}

// tsc can emit more than execFile's 1 MiB default maxBuffer of
// diagnostics on a failed typecheck — truncating the output would hide
// the real compiler errors.
const MAX_BUFFER = 16 * 1024 * 1024
// Bound each compiler launch so a stalled tsc/tsgo can't pend the Nx
// task forever.
const EXEC_TIMEOUT = 10 * 60 * 1000

/**
 * Typecheck executor for `@nx-devkit/typescript:typecheck`.
 *
 * Runs `tsc --build` or `tsgo --build` via `execFile` (no shell) so the
 * command is not vulnerable to shell injection. Falls back to `tsc`
 * when `tsgo` is requested but not installed.
 *
 * When `clean` is true, runs `tsc --build --clean` first (which removes
 * stale .tsbuildinfo files without building), then `tsc --build`.
 */
export async function typecheckExecutor(
  options: TypecheckExecutorOptions,
  context: NxExecutorContext,
): Promise<TypecheckExecutorResult> {
  const tsgo = options.tsgo ?? true
  const configFile = options.configFile ?? 'tsconfig.json'
  const clean = options.clean ?? false

  const workspaceRoot = context.root
  const projectName = context.projectName ?? ''
  const projects = context.projectsConfigurations?.projects ?? {}
  // eslint-disable-next-line security/detect-object-injection -- projectName comes from the Nx executor context
  const projectConfig = Object.hasOwn(projects, projectName) ? projects[projectName] : undefined
  const projectRoot = projectConfig?.root ?? ''
  const absProjectRoot = resolve(workspaceRoot, projectRoot)
  const configPath = join(absProjectRoot, configFile)

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- config filename comes from executor schema options joined to the project root
  if (!existsSync(configPath)) {
    console.error(`[nx-devkit/typecheck] Config not found: ${configPath}`)
    return { success: false }
  }

  // Check if tsgo is available when requested. Look in both the project
  // root and the workspace root — a project-local install is valid.
  let useTsgo = tsgo
  if (useTsgo) {
    const workspaceNativePkg = join(workspaceRoot, 'node_modules', '@typescript', 'native-preview')
    const projectNativePkg = join(absProjectRoot, 'node_modules', '@typescript', 'native-preview')
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed package path under node_modules
    useTsgo = existsSync(workspaceNativePkg) || existsSync(projectNativePkg)
  }

  const bin = useTsgo ? 'tsgo' : 'tsc'
  const packageName = useTsgo ? '@typescript/native-preview' : 'typescript'

  // Resolve the compiler through the owning package's `bin` field and
  // launch Node scripts via process.execPath — `.bin` shims are shell
  // scripts / `.cmd` wrappers that cannot run with `shell: false`
  // (and cannot run at all on Windows). Falls back to the bare name so
  // the system PATH can still be used.
  const launch = resolveBinLaunch(bin, packageName, absProjectRoot, workspaceRoot)

  // Clean phase: `tsc --build --clean` removes stale build info.
  // This does NOT build — it only cleans.
  if (clean) {
    await new Promise<void>((resolvePromise) => {
      execFile(
        launch.command,
        [...launch.prependArgs, '--build', '--clean', configFile],
        { cwd: absProjectRoot, shell: false, maxBuffer: MAX_BUFFER, timeout: EXEC_TIMEOUT },
        (err, _stdout, stderr) => {
          if (err) {
            // A non-zero clean is usually "no build info yet", but
            // surface it so real problems (bad tsconfig, permissions,
            // missing binary) aren't silently masked.
            console.error(
              `[nx-devkit/typecheck] clean phase failed in ${absProjectRoot}: ${err.message} — continuing to build`,
            )
            if (stderr) console.error(`[nx-devkit/typecheck] stderr: ${stderr}`)
          }
          resolvePromise()
        },
      )
    })
  }

  // Build phase: `tsc --build` compiles the project.
  return new Promise<TypecheckExecutorResult>((resolvePromise) => {
    execFile(
      launch.command,
      [...launch.prependArgs, '--build', configFile],
      { cwd: absProjectRoot, shell: false, maxBuffer: MAX_BUFFER, timeout: EXEC_TIMEOUT },
      (err, stdout, stderr) => {
        if (err) {
          console.error(
            `[nx-devkit/typecheck] ${bin} --build ${configFile} failed in ${absProjectRoot}`,
          )
          console.error(`[nx-devkit/typecheck] error: ${err.message}`)
          if (stdout) console.error(`[nx-devkit/typecheck] stdout: ${stdout}`)
          if (stderr) console.error(`[nx-devkit/typecheck] stderr: ${stderr}`)
          resolvePromise({ success: false })
          return
        }
        resolvePromise({ success: true })
      },
    )
  })
}

export default typecheckExecutor
