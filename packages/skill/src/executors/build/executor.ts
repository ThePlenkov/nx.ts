import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export interface BuildExecutorOptions {
  /** Distribution target. Default: "skills-sh". */
  target?: string
  /** Output directory for compiled skill. Required. */
  outDir: string
  /** Relative path (from workspace root) to the skill directory. Required. */
  path: string
}

export interface BuildExecutorResult {
  success: boolean
}

const VALID_TARGETS = ['skills-sh', 'claude', 'codex', 'agents', 'obsidian']

/**
 * Resolve a binary name to an absolute path in the workspace
 * `node_modules/.bin` directory. Falls back to the bare name so the
 * system PATH can still be used.
 */
function resolveBin(name: string, workspaceRoot: string): string {
  const candidate = join(workspaceRoot, 'node_modules', '.bin', name)
  if (existsSync(candidate)) return candidate
  return name
}

/**
 * Build executor for `@nx-devkit/skill:build`.
 *
 * Wraps the `skills-compiler` CLI. Invokes the binary directly via `execFile`
 * (no shell) so the command is not vulnerable to shell injection.
 */
export async function buildExecutor(options: BuildExecutorOptions): Promise<BuildExecutorResult> {
  const target = options.target ?? 'skills-sh'
  if (!VALID_TARGETS.includes(target)) {
    return { success: false }
  }
  const outDir = options.outDir
  const skillPath = options.path
  const bin = resolveBin('skills-compiler', process.cwd())

  return new Promise((resolvePromise) => {
    execFile(
      bin,
      ['--target', target, '--out', outDir, '--skill', skillPath],
      { shell: false },
      (err, _stdout, _stderr) => {
        if (err) {
          resolvePromise({ success: false })
          return
        }
        resolvePromise({ success: true })
      },
    )
  })
}

export default buildExecutor
