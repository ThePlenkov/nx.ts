import { relative, resolve } from 'node:path'

export function isVerbose(): boolean {
  if (process.argv.includes('--verbose')) {
    return true
  }
  if (process.env.NX_VERBOSE_LOGGING === 'true') {
    return true
  }
  return false
}

export function resetCachedEnv(): void {}

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

  if (rel.includes('node_modules')) {
    return true
  }

  return false
}
