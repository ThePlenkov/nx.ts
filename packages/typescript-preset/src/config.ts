import { access } from 'node:fs/promises'
import { readFile } from 'node:fs/promises'
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

export async function findConfigFile(
  projectRoot: string,
  workspaceRoot: string,
  candidates: string[],
): Promise<string | null> {
  const absProjectRoot = resolve(workspaceRoot, projectRoot)
  for (const name of candidates) {
    const candidate = join(absProjectRoot, name)
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- candidate names are fixed config basenames joined to an Nx project root
      await access(candidate)
      return candidate
    } catch {
      continue
    }
  }
  return null
}

export function findVitestConfig(
  projectRoot: string,
  workspaceRoot: string,
): Promise<string | null> {
  return findConfigFile(projectRoot, workspaceRoot, VITEST_CONFIG_NAMES)
}

/**
 * Check if @typescript/native-preview is listed in the project's package.json.
 */
export async function checkNativePreview(
  projectRoot: string,
  workspaceRoot: string,
): Promise<boolean> {
  const absProjectRoot = resolve(workspaceRoot, projectRoot)
  const pkgPath = join(absProjectRoot, 'package.json')
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is the project's own package.json under an Nx project root
    const content = await readFile(pkgPath, 'utf8')
    const pkg = JSON.parse(content) as Record<string, unknown>
    const allDeps = {
      ...(pkg.dependencies as Record<string, string> | undefined),
      ...(pkg.devDependencies as Record<string, string> | undefined),
      ...(pkg.peerDependencies as Record<string, string> | undefined),
    }
    return '@typescript/native-preview' in allDeps
  } catch {
    return false
  }
}
