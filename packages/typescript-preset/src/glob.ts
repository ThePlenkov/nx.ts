import { globSync } from 'node:fs'

/**
 * Check if any file in `rootDir` matches the given glob pattern.
 * Uses Node.js built-in `fs.globSync` (Node 22+).
 */
export function globMatch(rootDir: string, pattern: string): boolean {
  try {
    const matches = globSync(pattern, { cwd: rootDir })
    return matches.length > 0
  } catch {
    return false
  }
}
