import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Detects a publishable package that tsdown can build config-free.
 * tsdown falls back to `src/index.ts` as entry when no config exists,
 * so we require both a publishable signal and that conventional entry.
 */
export async function hasConfigFreeTsdownEntry(absProjectRoot: string): Promise<boolean> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed basenames joined to the Nx-provided project root
    await access(join(absProjectRoot, 'src/index.ts'))
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed basename joined to the Nx-provided project root
    const pkg = JSON.parse(await readFile(join(absProjectRoot, 'package.json'), 'utf8'))
    return Boolean(pkg?.exports || pkg?.bin || (pkg?.main && pkg?.files))
  } catch {
    return false
  }
}

export function inferTsdownBuildTarget(_projectRoot: string): {
  executor: string
  options: Record<string, never>
  outputs: string[]
  cache: true
  inputs: string[]
  dependsOn: string[]
} {
  return {
    executor: '@nx-devkit/typescript:build',
    options: {},
    outputs: ['{projectRoot}/dist'],
    cache: true,
    inputs: [
      '{projectRoot}/src/**/*',
      '{projectRoot}/tsdown.config.*',
      '{projectRoot}/tsconfig.json',
      '{projectRoot}/package.json',
    ],
    dependsOn: ['^build'],
  }
}

export function inferTsdownWatchTarget(_projectRoot: string): {
  executor: string
  options: { watch: true }
  cache: false
  inputs: string[]
  dependsOn: string[]
} {
  return {
    executor: '@nx-devkit/typescript:build',
    options: { watch: true },
    cache: false,
    inputs: [
      '{projectRoot}/src/**/*',
      '{projectRoot}/tsdown.config.*',
      '{projectRoot}/tsconfig.json',
      '{projectRoot}/package.json',
    ],
    dependsOn: ['^build'],
  }
}
