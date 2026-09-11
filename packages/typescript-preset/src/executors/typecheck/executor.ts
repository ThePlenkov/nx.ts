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
  context: { projectRoot: string; workspaceRoot: string },
): Promise<TypecheckExecutorResult> {
  const tsgo = options.tsgo ?? true
  const configFile = options.configFile ?? 'tsconfig.json'
  const clean = options.clean ?? false

  const projectRoot = context.projectRoot
  const workspaceRoot = context.workspaceRoot
  const absProjectRoot = resolve(workspaceRoot, projectRoot)
  const configPath = join(absProjectRoot, configFile)

  if (!existsSync(configPath)) {
    return { success: false }
  }

  // Check if tsgo is available when requested
  let useTsgo = tsgo
  if (useTsgo) {
    const nativePkg = join(workspaceRoot, 'node_modules', '@typescript', 'native-preview')
    useTsgo = existsSync(nativePkg)
  }

  const bin = useTsgo ? 'tsgo' : 'tsc'

  // Clean phase: `tsc --build --clean` removes stale build info.
  // This does NOT build — it only cleans.
  if (clean) {
    await new Promise<void>((resolvePromise) => {
      execFile(
        bin,
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
    execFile(bin, ['--build', configFile], { cwd: absProjectRoot, shell: false }, (err) => {
      if (err) {
        resolvePromise({ success: false })
        return
      }
      resolvePromise({ success: true })
    })
  })
}

export default typecheckExecutor
