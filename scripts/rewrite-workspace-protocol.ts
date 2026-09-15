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
// No dynamic-key writes: deps maps are rebuilt via Object.fromEntries so
// SAST's prototype-pollution/object-injection rules see only literals.
const rewriteDeps = (
  deps: Record<string, string> | undefined,
  pkgName: string,
  field: string,
): Record<string, string> | undefined => {
  if (!deps) return deps
  return Object.fromEntries(
    Object.entries(deps).map(([name, spec]) => {
      if (!spec.startsWith('workspace:')) return [name, spec]
      const replacement = localVersions.get(name) ?? '*'
      rewritten += 1
      console.log(`${pkgName}: ${field}.${name} ${spec} → ${replacement}`)
      return [name, replacement]
    }),
  )
}

for (const [dir, { path, pkg }] of manifests) {
  const pkgName = pkg.name ?? dir
  const out: Manifest = {
    ...pkg,
    dependencies: rewriteDeps(pkg.dependencies, pkgName, 'dependencies'),
    devDependencies: rewriteDeps(pkg.devDependencies, pkgName, 'devDependencies'),
    peerDependencies: rewriteDeps(pkg.peerDependencies, pkgName, 'peerDependencies'),
    optionalDependencies: rewriteDeps(pkg.optionalDependencies, pkgName, 'optionalDependencies'),
  }
  if (out !== pkg && JSON.stringify(out) !== JSON.stringify(pkg)) {
    // Atomic write — a partial manifest would break the publish step.
    const tmp = `${path}.tmp`
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is built from packages/* directory entries
    writeFileSync(tmp, `${JSON.stringify(out, null, 2)}\n`)
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- same fixed workspace path
    renameSync(tmp, path)
  }
}
console.log(`rewrote ${rewritten} workspace: specifier(s)`)
