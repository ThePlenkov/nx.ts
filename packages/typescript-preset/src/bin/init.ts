#!/usr/bin/env node

/**
 * One-command bootstrap: npx @nx-devkit/typescript init
 *
 * This is a thin launcher. It ensures `nx` and the plugin itself are
 * installed in the workspace, then delegates all logic to the Nx init
 * generator at `@nx-devkit/typescript:init`.
 */

import { existsSync, realpathSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Bound each install so a stalled package-manager process can't pend the
// bootstrap command indefinitely.
const INSTALL_TIMEOUT_MS = 10 * 60 * 1000

const PLUGIN_PACKAGE = '@nx-devkit/typescript'

function hasPackage(name: string): boolean {
  return existsSync(join(process.cwd(), 'node_modules', name, 'package.json'))
}

function detectPackageManager(): 'bun' | 'npm' | 'pnpm' | 'yarn' {
  if (existsSync(join(process.cwd(), 'bun.lock'))) return 'bun'
  if (existsSync(join(process.cwd(), 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(process.cwd(), 'yarn.lock'))) return 'yarn'
  return 'npm'
}

function run(cmd: string, args: string[]): void {
  execFileSync(cmd, args, {
    stdio: 'inherit',
    cwd: process.cwd(),
    shell: false,
    timeout: INSTALL_TIMEOUT_MS,
  })
}

function install(pm: 'bun' | 'npm' | 'pnpm' | 'yarn', packages: string[]): void {
  if (pm === 'bun') {
    run('bun', ['add', '-D', ...packages])
  } else if (pm === 'pnpm') {
    run('pnpm', ['add', '-D', ...packages])
  } else if (pm === 'yarn') {
    run('yarn', ['add', '-D', ...packages])
  } else {
    run('npm', ['install', '-D', ...packages])
  }
}

export function main(): void {
  const args = process.argv.slice(2)
  const pm = detectPackageManager()

  const missing: string[] = []
  if (!hasPackage('nx')) missing.push('nx')
  if (!hasPackage('@nx/devkit')) missing.push('@nx/devkit')
  // When invoked via `npx @nx-devkit/typescript init` the package lives in
  // the npx cache, not the workspace — install it so `nx g` can resolve it.
  if (!hasPackage(PLUGIN_PACKAGE)) missing.push(PLUGIN_PACKAGE)

  if (missing.length > 0) {
    console.log(`Installing: ${missing.join(', ')}`)
    try {
      install(pm, missing)
    } catch (error) {
      console.error(`Failed to install ${missing.join(', ')}. Please install them manually.`)
      if (error instanceof Error && error.message) {
        console.error(`Error: ${error.message}`)
      }
      process.exit(1)
    }
  }

  // Build the generator command. Pass through any args after "init".
  const genArgs = args.filter((a) => a !== 'init')
  const generatorArgs = ['g', `${PLUGIN_PACKAGE}:init`, ...genArgs]

  try {
    if (pm === 'bun') {
      run('bunx', ['nx', ...generatorArgs])
    } else if (pm === 'pnpm') {
      run('pnpm', ['exec', 'nx', ...generatorArgs])
    } else if (pm === 'yarn') {
      run('yarn', ['nx', ...generatorArgs])
    } else {
      run('npx', ['nx', ...generatorArgs])
    }
  } catch (error) {
    console.error('Failed to run the init generator.')
    if (error instanceof Error && error.message) {
      console.error(`Error: ${error.message}`)
    }
    process.exit(1)
  }
}

// npx invokes the bin through a node_modules/.bin symlink: argv[1] keeps the
// symlink path while import.meta.url resolves to the real file — compare
// canonical paths so the direct-entry check still fires under npm/npx.
function invokedDirectly(): boolean {
  if (!process.argv[1]) return false
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
  } catch {
    return false
  }
}

if (invokedDirectly()) {
  main()
}
