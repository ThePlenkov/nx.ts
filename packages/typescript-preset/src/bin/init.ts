#!/usr/bin/env node

/**
 * One-command bootstrap: npx @nx-devkit/typescript init
 *
 * This is a thin launcher. It ensures `nx` and the plugin itself are
 * installed in the workspace, then delegates all logic to the Nx init
 * generator at `@nx-devkit/typescript:init`.
 */

import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

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
  execFileSync(cmd, args, { stdio: 'inherit', cwd: process.cwd(), shell: false })
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
  if (!hasPackage('nx')) missing.push('nx', '@nx/devkit')
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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
}
