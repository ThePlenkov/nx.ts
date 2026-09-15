#!/usr/bin/env bun
// Rewrites `workspace:*` dependency specs to the local package version in
// packages/*/package.json.
//
// npm (and Nx's publish preflight) rejects the `workspace:` protocol — the
// release job runs `nx release publish`, which shells out to npm. The only
// workspace: dep is `@nx-devkit/internal`: private, bundled into dist via
// tsdown `alwaysBundle`. The rewrite preserves the resolved local version
// rather than degrading to `*`.
//
// Runs in the CI working tree only — sources keep `workspace:*`.

import { readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const packagesDir = join(import.meta.dir, '..', 'packages')
const DEP_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const

interface Manifest {
  name?: string
  version?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

function readManifest(manifestPath: string): Manifest | null {
  let raw: string
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- manifest path is built from packages/* directory entries
    raw = readFileSync(manifestPath, 'utf8')
  } catch {
    return null
  }
  try {
    return JSON.parse(raw) as Manifest
  } catch (error) {
    throw new Error(`Invalid JSON in ${manifestPath}`, { cause: error })
  }
}

const manifests = new Map<string, { path: string; pkg: Manifest }>()
// eslint-disable-next-line security/detect-non-literal-fs-filename -- packagesDir is a fixed workspace path
for (const dir of readdirSync(packagesDir)) {
  const manifestPath = join(packagesDir, dir, 'package.json')
  const pkg = readManifest(manifestPath)
  if (pkg) manifests.set(dir, { path: manifestPath, pkg })
}

// Index local versions so workspace:* resolves to the real version.
const localVersions = new Map<string, string>()
for (const { pkg } of manifests.values()) {
  if (pkg.name && pkg.version) localVersions.set(pkg.name, pkg.version)
}

let rewritten = 0
for (const [dir, { path, pkg }] of manifests) {
  let changed = false
  for (const field of DEP_FIELDS) {
    // eslint-disable-next-line security/detect-object-injection -- field is a literal DEP_FIELDS union member
    const deps = pkg[field]
    if (!deps) continue
    for (const [name, spec] of Object.entries(deps)) {
      if (typeof spec === 'string' && spec.startsWith('workspace:')) {
        const replacement = localVersions.get(name) ?? '*'
        // eslint-disable-next-line security/detect-object-injection -- name is a dependency key from the manifest's own deps table
        deps[name] = replacement
        changed = true
        rewritten += 1
        console.log(`${pkg.name ?? dir}: ${field}.${name} ${spec} → ${replacement}`)
      }
    }
  }
  if (changed) {
    // Atomic write — a partial manifest would break the publish step.
    const tmp = `${path}.tmp`
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is built from packages/* directory entries
    writeFileSync(tmp, `${JSON.stringify(pkg, null, 2)}\n`)
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- same fixed workspace path
    renameSync(tmp, path)
  }
}
console.log(`rewrote ${rewritten} workspace: specifier(s)`)
