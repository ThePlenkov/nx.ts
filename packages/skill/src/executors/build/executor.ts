import { execFile } from 'node:child_process'

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

  return new Promise((resolvePromise) => {
    execFile(
      'skills-compiler',
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
