import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const VITEST_CONFIG_NAMES = [
  'vitest.config.ts',
  'vitest.config.js',
  'vitest.config.mts',
  'vitest.config.mjs',
  'vitest.config.cts',
  'vitest.config.cjs',
]

export const OXLINTRC_NAMES = [
  '.oxlintrc.json',
  '.oxlintrc.jsonc',
  '.oxlintrc.yaml',
  '.oxlintrc.yml',
  '.oxlintrc.js',
  '.oxlintrc.mjs',
  '.oxlintrc.cjs',
  '.oxlintrc.ts',
  '.oxlintrc.mts',
  '.oxlintrc.cts',
]

export const ESLINT_CONFIG_NAMES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  'eslint.config.mts',
  'eslint.config.cts',
]

export const BIOME_CONFIG_NAMES = ['biome.json', 'biome.jsonc']

export const TSDOWN_CONFIG_NAMES = [
  'tsdown.config.ts',
  'tsdown.config.js',
  'tsdown.config.mts',
  'tsdown.config.mjs',
  'tsdown.config.cts',
  'tsdown.config.cjs',
]

export function findConfigFile(
  projectRoot: string,
  workspaceRoot: string,
  candidates: string[],
): string | null {
  const absProjectRoot = resolve(workspaceRoot, projectRoot)
  for (const name of candidates) {
    const candidate = join(absProjectRoot, name)
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

export function findVitestConfig(projectRoot: string, workspaceRoot: string): string | null {
  return findConfigFile(projectRoot, workspaceRoot, VITEST_CONFIG_NAMES)
}

/**
 * Check if @typescript/native-preview is listed in the project's package.json.
 *
 * Returns `false` when the package.json is absent or does not list the
 * dependency. Throws when the file exists but cannot be parsed, so callers
 * can distinguish a missing manifest from a corrupt one.
 */
export function checkNativePreview(projectRoot: string, workspaceRoot: string): boolean {
  const absProjectRoot = resolve(workspaceRoot, projectRoot)
  const pkgPath = join(absProjectRoot, 'package.json')
  let raw: string
  try {
    raw = readFileSync(pkgPath, 'utf8')
  } catch {
    return false
  }
  let pkg: Record<string, unknown>
  try {
    pkg = JSON.parse(raw) as Record<string, unknown>
  } catch (error) {
    throw new Error(
      `Failed to parse ${pkgPath}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
  const allDeps = {
    ...(pkg.dependencies as Record<string, string> | undefined),
    ...(pkg.devDependencies as Record<string, string> | undefined),
    ...(pkg.peerDependencies as Record<string, string> | undefined),
  }
  return '@typescript/native-preview' in allDeps
}
