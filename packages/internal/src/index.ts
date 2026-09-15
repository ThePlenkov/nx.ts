import { relative, resolve } from 'node:path'
import { logger } from '@nx/devkit'

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
    logger.info(`[${scope}] ${message}`)
  }
}

export function shouldSkipPath(projectRoot: string, workspaceRoot: string): boolean {
  const absProjectRoot = resolve(workspaceRoot, projectRoot)
  if (absProjectRoot === workspaceRoot) {
    return true
  }

  const rel = relative(workspaceRoot, absProjectRoot)
  if (!rel) {
    return true
  }
  // Segment-aware check: skip paths that escape the workspace via `..`
  // segments. Using `startsWith('..')` would incorrectly skip valid
  // directories like `..foo` or `..hidden`.
  const segments = rel.split(/[\\/]/)
  if (segments[0] === '..' || segments.includes('..')) {
    return true
  }

  // Only skip paths that contain a `node_modules` path segment, not paths
  // that merely contain the substring (e.g. `skills/node_modules-docs/`).
  if (segments.includes('node_modules')) {
    return true
  }

  return false
}
