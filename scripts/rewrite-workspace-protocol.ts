#!/usr/bin/env bun
// Rewrites `workspace:*` dependency specs to `*` in packages/*/package.json.
//
// npm (and Nx's publish preflight) rejects the `workspace:` protocol — the
// release job runs `nx release publish`, which shells out to npm. The only
// workspace: dep is `@nx-devkit/internal`: private, bundled into dist via
// tsdown `alwaysBundle`, so its published spec is cosmetic. `*` is a valid
// npm range and bun links the local workspace package for it regardless.
//
// Runs in the CI working tree only — sources keep `workspace:*`.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const packagesDir = join(import.meta.dir, '..', 'packages')
const DEP_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const

let rewritten = 0
for (const dir of readdirSync(packagesDir)) {
  const manifestPath = join(packagesDir, dir, 'package.json')
  let raw: string
  try {
    raw = readFileSync(manifestPath, 'utf8')
  } catch {
    continue
  }
  const pkg = JSON.parse(raw) as Record<string, Record<string, string> | undefined>
  let changed = false
  for (const field of DEP_FIELDS) {
    const deps = pkg[field]
    if (!deps) continue
    for (const [name, spec] of Object.entries(deps)) {
      if (typeof spec === 'string' && spec.startsWith('workspace:')) {
        deps[name] = '*'
        changed = true
        rewritten += 1
        console.log(`${pkg.name ?? dir}: ${field}.${name} ${spec} → *`)
      }
    }
  }
  if (changed) writeFileSync(manifestPath, `${JSON.stringify(pkg, null, 2)}\n`)
}
console.log(`rewrote ${rewritten} workspace: specifier(s)`)
