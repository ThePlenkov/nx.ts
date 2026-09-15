import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
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

/**
 * Resolved launch descriptor for a package binary. `command` is either
 * `process.execPath` (when the bin is a Node script — the common case for
 * tsc/tsgo/tsdown) or a directly-executable binary path. `prependArgs`
 * carries the script path when launching through Node.
 */
export interface BinLaunch {
  command: string
  prependArgs: string[]
}

/**
 * Resolve a package binary to a launch descriptor that works with
 * `execFile(..., { shell: false })` on every platform.
 *
 * `.bin` shims are shell scripts (POSIX) or `.cmd`/`.ps1` wrappers
 * (Windows) and cannot be spawned without a shell — and spawning `.cmd`
 * files is blocked outright on modern Node. Instead we read the owning
 * package's `package.json` `bin` field and launch the underlying file
 * through `process.execPath` when it is a Node script. Native binaries
 * are returned as direct execFile targets.
 */
export function resolveBinLaunch(
  name: string,
  packageName: string,
  projectRoot: string,
  workspaceRoot: string,
): BinLaunch {
  // Node module resolution walks up from projectRoot through every
  // ancestor node_modules — a nested workspace (apps/demo inside a
  // monorepo) finds tools hoisted to the outer repo root. workspaceRoot
  // lies on that chain in any normal layout.
  const dirs = [
    ...new Set([...nodeModulesDirs(projectRoot), ...nodeModulesDirs(workspaceRoot)]),
  ]

  // 1. Resolve via the owning package's `bin` field — exact and
  //    cross-platform (no shim involved).
  for (const nmDir of dirs) {
    const pkgJsonPath = join(nmDir, packageName, 'package.json')
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- package name is a fixed tool identifier resolved under node_modules
    if (!existsSync(pkgJsonPath)) continue
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path validated above, owned by the resolved package
      const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as {
        bin?: string | Record<string, string>
      }
      // eslint-disable-next-line security/detect-object-injection -- name is a fixed tool identifier
      const rel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.[name]
      if (!rel) continue
      const binPath = join(nmDir, packageName, rel)
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- bin path comes from the package's own bin field
      if (!existsSync(binPath)) continue
      if (isNodeScript(binPath)) {
        return { command: process.execPath, prependArgs: [binPath] }
      }
      return { command: binPath, prependArgs: [] }
    } catch {
      continue
    }
  }

  // 2. `.bin` probe — POSIX symlinks resolve to the real JS entry.
  //    If the target is a Node script, launch it through process.execPath;
  //    otherwise execFile it directly (native binary).
  for (const nmDir of dirs) {
    const shim = join(nmDir, '.bin', name)
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- shim name is a fixed tool identifier under .bin
    if (!existsSync(shim)) continue
    if (isNodeScript(shim)) {
      return { command: process.execPath, prependArgs: [shim] }
    }
    return { command: shim, prependArgs: [] }
  }

  // 3. Bare name — let PATH resolution handle it.
  return { command: name, prependArgs: [] }
}

/**
 * Ancestor `node_modules` directories in Node resolution order:
 * `<dir>/node_modules`, `<dir>/../node_modules`, ... up to `/node_modules`.
 * Mirrors Node's algorithm — a directory named `node_modules` is skipped
 * so resolution inside one does not recurse.
 */
function* nodeModulesDirs(start: string): Generator<string> {
  let dir = resolve(start)
  while (true) {
    if (basename(dir) !== 'node_modules') yield join(dir, 'node_modules')
    const parent = dirname(dir)
    if (parent === dir) return
    dir = parent
  }
}

function isNodeScript(path: string): boolean {
  if (/\.(m?js|cjs)$/.test(path)) return true
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is a resolved bin entry under node_modules
    const head = readFileSync(path, 'utf8').slice(0, 128)
    return /^#!.*\bnode\b/.test(head)
  } catch {
    return false
  }
}

/**
 * Map over items with a bounded number of concurrent async operations.
 * Inference fans out over every detected config file; without a cap a
 * large monorepo would issue hundreds of concurrent fs calls.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += limit) {
    results.push(...(await Promise.all(items.slice(i, i + limit).map(fn))))
  }
  return results
}
