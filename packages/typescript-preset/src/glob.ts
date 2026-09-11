import { glob, stat } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Check if any file in `rootDir` matches the given glob pattern.
 * Uses Node.js built-in `fs.promises.glob` (Node 22+) with async I/O.
 */
export async function globMatch(rootDir: string, pattern: string): Promise<boolean> {
  try {
    const matches = glob(pattern, {
      cwd: rootDir,
      // `exclude` receives path strings (withFileTypes is unsupported on
      // some runtimes). node_modules is pruned at any depth (vendored
      // files are never sources); dist/coverage only at the project
      // root so legitimately-named source dirs and explicit
      // testGlob/specGlob paths still match.
      exclude: (entry) => {
        const segments = entry.split(/[\\/]/)
        return (
          segments.includes('node_modules') || segments[0] === 'dist' || segments[0] === 'coverage'
        )
      },
    })
    // glob can return directories that match the pattern (e.g. a
    // `foo.test.ts/` directory). Only count real files as matches so we
    // don't infer a native test target for a matching directory name.
    for await (const m of matches) {
      try {
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- match paths are produced by glob under the project root
        if ((await stat(join(rootDir, m))).isFile()) return true
      } catch {
        continue
      }
    }
    return false
  } catch (error) {
    // Only swallow ENOENT (directory missing). Surface other errors
    // (permission denied, invalid pattern, missing fs.promises.glob) so
    // callers don't silently treat real failures as "no test files".
    if (error instanceof Error && 'code' in error && (error as { code: string }).code === 'ENOENT') {
      return false
    }
    throw error
  }
}

// --- Backward-compat re-exports for the old hand-rolled glob engine ---
// These are preserved so consumers importing `globToRegExp` or
// `expandBraces` from `@nx-devkit/typescript` continue to work. The
// preset itself now uses `fs.promises.glob` internally.

const MAX_BRACE_DEPTH = 3
const MAX_BRACE_OPTIONS = 20

export function expandBraces(pattern: string, depth = 0): string[] {
  if (depth >= MAX_BRACE_DEPTH) return [pattern]
  const match = pattern.match(/\{([^}]+)\}/)
  if (!match) return [pattern]
  const options = match[1].split(',')
  if (options.length > MAX_BRACE_OPTIONS) return [pattern]
  const prefix = pattern.slice(0, match.index)
  const suffix = pattern.slice((match.index ?? 0) + match[0].length)
  const results: string[] = []
  for (const opt of options) {
    results.push(...expandBraces(prefix + opt + suffix, depth + 1))
  }
  return results
}

function globSegmentToRegex(pattern: string): string {
  let result = ''
  let i = 0
  while (i < pattern.length) {
    const char = pattern.charAt(i)
    if (char === '*') {
      if (pattern.charAt(i + 1) === '*') {
        result += '.*'
        i += 2
        if (pattern.charAt(i) === '/') i++
      } else {
        result += '[^/]*'
        i++
      }
    } else if (char === '?') {
      result += '[^/]'
      i++
    } else if (char === '.') {
      result += '\\.'
      i++
    } else if ('+()^$|[]\\{}'.includes(char)) {
      result += `\\${char}`
      i++
    } else {
      result += char
      i++
    }
  }
  return result
}

function compileRegex(source: string): RegExp {
  const ctor = RegExp
  return new ctor(source)
}

export function globToRegExp(pattern: string): RegExp {
  const expanded = expandBraces(pattern)
  const sources = expanded.map((p) => `^${globSegmentToRegex(p)}$`)
  const source = sources.join('|')
  if (source.length > 10_000) {
    return /$^/
  }
  return compileRegex(source)
}
