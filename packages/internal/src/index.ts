import { existsSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

let cachedEnv: { verbose: boolean } | null = null

function readEnvVerbose(workspaceRoot: string = process.cwd()): boolean {
  if (cachedEnv) return cachedEnv.verbose
  try {
    const envPath = join(workspaceRoot, '.env')
    if (!existsSync(envPath)) {
      cachedEnv = { verbose: false }
      return false
    }
    const content = readFileSync(envPath, 'utf-8')
    const verbose = content
      .split('\n')
      .some(
        (line) =>
          !line.trimStart().startsWith('#') &&
          /^\s*NX_VERBOSE_LOGGING\s*=\s*["']?true["']?\s*$/.test(line),
      )
    cachedEnv = { verbose }
    return verbose
  } catch {
    cachedEnv = { verbose: false }
    return false
  }
}

export function isVerbose(): boolean {
  if (process.argv.includes('--verbose')) {
    return true
  }
  if (process.env.NX_VERBOSE_LOGGING === 'true') {
    return true
  }
  return readEnvVerbose()
}

export function resetCachedEnv(): void {
  cachedEnv = null
}

export function logDebug(scope: string, message: string): void {
  if (isVerbose()) {
    console.error(`[${scope}] ${message}`)
  }
}

export function shouldSkipPath(projectRoot: string, workspaceRoot: string): boolean {
  const absProjectRoot = resolve(workspaceRoot, projectRoot)
  if (absProjectRoot === workspaceRoot) {
    return true
  }

  const rel = relative(workspaceRoot, absProjectRoot)
  if (!rel || rel.startsWith('..')) {
    return true
  }

  // Match `node_modules` as a path segment, not as a substring, so that
  // legitimate project names like `node_modules-docs` are not skipped.
  const segments = rel.split(/[/\\]+/)
  if (segments.includes('node_modules')) {
    return true
  }

  return false
}
