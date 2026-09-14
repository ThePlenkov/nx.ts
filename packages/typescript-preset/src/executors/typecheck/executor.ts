import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

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

/**
 * Resolve a binary name to an absolute path in the project or workspace
 * `node_modules/.bin` directory. Falls back to the bare name so the
 * system PATH can still be used. This avoids relying on Nx's PATH
 * augmentation, which is not present when an executor is invoked
 * directly (as opposed to via `nx:run-commands`).
 */
function resolveBin(name: string, projectRoot: string, workspaceRoot: string): string {
  const candidates = [
    join(projectRoot, 'node_modules', '.bin', name),
    join(workspaceRoot, 'node_modules', '.bin', name),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return name
}

/**
 * Typecheck executor for `@nx-devkit/typescript:typecheck`.
 *
 * Runs `tsc --build` or `tsgo --build` via `execFile` (no shell) so the
 * command is not vulnerable to shell injection. Falls back to `tsc`
 * when `tsgo` is requested but not installed.
 *
 * When `clean` is true, runs `tsc --build --clean` first (which removes
 * stale .tsbuildinfo files), then runs `tsc --build` to rebuild.
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
  const projectConfig = Object.hasOwn(projects, projectName) ? projects[projectName] : undefined
  const projectRoot = projectConfig?.root ?? ''
  const absProjectRoot = resolve(workspaceRoot, projectRoot)
  const configPath = join(absProjectRoot, configFile)

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
    useTsgo = existsSync(workspaceNativePkg) || existsSync(projectNativePkg)
  }

  const bin = useTsgo ? 'tsgo' : 'tsc'

  // Resolve the compiler from the project or workspace node_modules/.bin
  // so it is found even when Nx invokes the executor directly (without the
  // nx:run-commands PATH augmentation). Falls back to the bare name so the
  // system PATH can still be used.
  const binPath = resolveBin(bin, absProjectRoot, workspaceRoot)

  // Clean phase: `tsc --build --clean` removes stale build info.
  // This does NOT build — it only cleans.
  if (clean) {
    await new Promise<void>((resolvePromise) => {
      execFile(
        binPath,
        ['--build', '--clean', configFile],
        { cwd: absProjectRoot, shell: false },
        () => {
          // Clean may fail if no build info exists yet — that's fine
          resolvePromise()
        },
      )
    })
  }

  // Build phase: `tsc --build` compiles the project.
  return new Promise<TypecheckExecutorResult>((resolvePromise) => {
    execFile(
      binPath,
      ['--build', configFile],
      { cwd: absProjectRoot, shell: false },
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
