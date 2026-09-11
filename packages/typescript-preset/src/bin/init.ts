#!/usr/bin/env node

/**
 * One-command bootstrap: npx @nx-devkit/typescript init
 *
 * This is a thin launcher. It ensures `nx` is available, then delegates
 * all logic to the Nx init generator at `@nx-devkit/typescript:init`.
 */

import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function hasNx(): boolean {
  return existsSync(join(process.cwd(), 'node_modules', 'nx', 'package.json'))
}

function detectPackageManager(): 'bun' | 'npm' | 'pnpm' | 'yarn' {
  if (existsSync(join(process.cwd(), 'bun.lock'))) return 'bun'
  if (existsSync(join(process.cwd(), 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(process.cwd(), 'yarn.lock'))) return 'yarn'
  return 'npm'
}

function main(): void {
  const args = process.argv.slice(2)
  const pm = detectPackageManager()

  // If nx is not installed, install it first
  if (!hasNx()) {
    console.log('Nx not found. Installing nx + @nx/devkit...')
    const installCmd =
      pm === 'bun'
        ? 'bun add -D nx @nx/devkit'
        : pm === 'pnpm'
          ? 'pnpm add -D nx @nx/devkit'
          : pm === 'yarn'
            ? 'yarn add -D nx @nx/devkit'
            : 'npm install -D nx @nx/devkit'
    execSync(installCmd, { stdio: 'inherit', cwd: process.cwd() })
  }

  // Build the generator command
  // Pass through any args after "init" to the generator
  const genArgs = args.filter((a) => a !== 'init').join(' ')
  const nxBin =
    pm === 'bun' ? 'bunx nx' : pm === 'pnpm' ? 'pnpm exec nx' : pm === 'yarn' ? 'yarn nx' : 'npx nx'

  const cmd = `${nxBin} g @nx-devkit/typescript:init ${genArgs}`.trim()
  console.log(`Running: ${cmd}`)
  execSync(cmd, { stdio: 'inherit', cwd: process.cwd() })
}

main()
