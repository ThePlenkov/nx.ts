#!/usr/bin/env node

/**
 * One-command bootstrap: npx @nx-devkit/typescript init
 *
 * This is a thin launcher. It ensures `nx` is available, then delegates
 * all logic to the Nx init generator at `@nx-devkit/typescript:init`.
 */

import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

function hasNx(): boolean {
  return existsSync(join(process.cwd(), 'node_modules', 'nx', 'package.json'))
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

function main(): void {
  const args = process.argv.slice(2)
  const pm = detectPackageManager()

  // If nx is not installed, install it first
  if (!hasNx()) {
    console.log('Nx not found. Installing nx + @nx/devkit...')
    try {
      if (pm === 'bun') {
        run('bun', ['add', '-D', 'nx', '@nx/devkit'])
      } else if (pm === 'pnpm') {
        run('pnpm', ['add', '-D', 'nx', '@nx/devkit'])
      } else if (pm === 'yarn') {
        run('yarn', ['add', '-D', 'nx', '@nx/devkit'])
      } else {
        run('npm', ['install', '-D', 'nx', '@nx/devkit'])
      }
    } catch (error) {
      console.error('Failed to install nx + @nx/devkit. Please install them manually.')
      if (error instanceof Error && error.message) {
        console.error(`Error: ${error.message}`)
      }
      process.exit(1)
    }
  }

  // Build the generator command. Pass through any args after "init".
  const genArgs = args.filter((a) => a !== 'init')
  const generatorArgs = ['g', '@nx-devkit/typescript:init', ...genArgs]

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

main()
