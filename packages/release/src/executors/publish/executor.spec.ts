/* eslint-disable one-var, node/no-sync -- test style follows repo conventions, not CodeFactor's default preset */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { publishExecutor } from './executor.ts'

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}))

import { spawnSync } from 'node:child_process'

const mockSpawn = spawnSync as unknown as ReturnType<typeof vi.fn>

function spawnResult(
  status: number,
  stdout = '',
  stderr = '',
): {
  status: number | null
  stdout: string
  stderr: string
} {
  return { status, stdout, stderr }
}

type SpawnOut = ReturnType<typeof spawnResult>

function ok(stdout = ''): SpawnOut {
  return spawnResult(0, stdout)
}

function fail(stderr = ''): SpawnOut {
  return spawnResult(1, '', stderr)
}

function makePkgDir(name: string, version: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'nx-release-test-'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version }))
  return dir
}

// Route spawn calls by line prefix (insertion order — put specific needles first),
// return ok() by default, and record every invocation line for assertions.
function mockFlow(responses: Record<string, SpawnOut> = {}): string[] {
  const calls: string[] = []
  mockSpawn.mockImplementation((cmd: string, args: string[]) => {
    const line = [cmd, ...args].join(' ')
    calls.push(line)
    for (const [needle, res] of Object.entries(responses)) {
      if (line.startsWith(needle)) return res
    }
    return ok()
  })
  return calls
}

const HEAD_SHA = 'a'.repeat(40)
const TIP_SHA = 'b'.repeat(40)
const STALE_SHA = 'c'.repeat(40)

const NO_REMOTE = {
  'git ls-remote': fail('not found'),
  'git diff --cached': fail('diff'), // non-empty staged diff
} satisfies Record<string, SpawnOut>

// Full mode: tag exists and marks the branch tip it was pushed on
const RELEASED = {
  'git ls-remote --exit-code --tags': ok(`${HEAD_SHA}\trefs/tags/v0.4.2`),
  'git ls-remote --exit-code --heads': ok(`${HEAD_SHA}\trefs/heads/main`),
  'gh release view': ok(),
} satisfies Record<string, SpawnOut>

describe('publishExecutor', () => {
  beforeEach(() => {
    mockSpawn.mockReset()
  })

  it('computes next patch version from npm latest', async () => {
    const dir = makePkgDir('@test/pkg', '0.4.1')
    mockFlow({ 'npm view': ok('0.4.1'), ...NO_REMOTE })

    const result = await publishExecutor({ packagePath: dir, version: 'patch' })
    expect(result.success).toBe(true)
    expect(result.version).toBe('0.4.2')
    expect(result.published).toBe(true)
    expect(result.tagged).toBe(true)
  })

  it('skips when already published, tagged, and released', async () => {
    const dir = makePkgDir('@test/pkg', '0.4.2')
    mockFlow({ 'npm view': ok('0.4.2'), ...RELEASED })

    const result = await publishExecutor({ packagePath: dir, version: '0.4.2' })
    expect(result.success).toBe(true)
    expect(result.skipped).toContain('already published, tagged, and released')
  })

  it('does release repair when npm+tag exist but no GitHub Release', async () => {
    const dir = makePkgDir('@test/pkg', '0.4.2')
    mockFlow({
      'npm view': ok('0.4.2'),
      'git ls-remote --exit-code --tags': ok(`${HEAD_SHA}\trefs/tags/v0.4.2`),
      'git ls-remote --exit-code --heads': ok(`${HEAD_SHA}\trefs/heads/main`),
      'gh release view': fail('not found'),
      'gh release create': ok(),
    })

    const result = await publishExecutor({ packagePath: dir, version: '0.4.2' })
    expect(result.success).toBe(true)
    expect(result.releaseCreated).toBe(true)
    expect(result.published).toBe(false)
    expect(result.tagged).toBe(false)
  })

  it('mode=publish skips tagging when the remote tag already marks HEAD', async () => {
    const dir = makePkgDir('@test/pkg', '0.4.2')
    const calls = mockFlow({
      'npm view': ok('0.4.2'),
      'git ls-remote --exit-code --tags': ok(`${HEAD_SHA}\trefs/tags/v0.4.2`),
      'git rev-parse HEAD': ok(HEAD_SHA),
      'gh release view': fail('not found'),
      'gh release create': ok(),
    })

    const result = await publishExecutor({ packagePath: dir, mode: 'publish' })
    expect(result.success).toBe(true)
    expect(result.tagged).toBe(false)
    expect(result.skipped).toContain('already tagged')
    expect(calls.some((c) => c === 'git tag v0.4.2')).toBe(false)
    // Sha matched — no need to fetch the tag for content verification
    expect(calls.some((c) => c.startsWith('git fetch'))).toBe(false)
  })

  it('mode=publish accepts a tag whose commit carries the version after main moved on', async () => {
    const dir = makePkgDir('@test/pkg', '0.4.2')
    mockFlow({
      'npm view': ok('0.4.2'),
      'git ls-remote --exit-code --tags': ok(`${HEAD_SHA}\trefs/tags/v0.4.2`),
      'git rev-parse HEAD': ok(TIP_SHA),
      'git fetch': ok(),
      'git show': ok(JSON.stringify({ name: '@test/pkg', version: '0.4.2' })),
      'gh release view': fail('not found'),
      'gh release create': ok(),
    })

    const result = await publishExecutor({ packagePath: dir, mode: 'publish' })
    expect(result.success).toBe(true)
    expect(result.tagged).toBe(false)
    expect(result.releaseCreated).toBe(true)
  })

  it('mode=publish fails loudly when the remote tag points at an unrelated commit', async () => {
    const dir = makePkgDir('@test/pkg', '0.4.2')
    mockFlow({
      'npm view': ok('0.4.2'),
      'git ls-remote --exit-code --tags': ok(`${STALE_SHA}\trefs/tags/v0.4.2`),
      'git rev-parse HEAD': ok(HEAD_SHA),
      'git fetch': ok(),
      'git show': ok(JSON.stringify({ name: '@test/pkg', version: '0.3.9' })),
    })

    await expect(publishExecutor({ packagePath: dir, mode: 'publish' })).rejects.toThrow(
      'stale tag',
    )
  })

  it('mode=full fails loudly when the remote tag does not mark the release commit', async () => {
    const dir = makePkgDir('@test/pkg', '0.4.1')
    mockFlow({
      'npm view': ok('0.4.2'),
      'git ls-remote --exit-code --tags': ok(`${STALE_SHA}\trefs/tags/v0.4.2`),
      'git ls-remote --exit-code --heads': ok(`${TIP_SHA}\trefs/heads/main`),
      'git fetch': ok(),
      'git show': ok(JSON.stringify({ name: '@test/pkg', version: '0.3.9' })),
    })

    await expect(publishExecutor({ packagePath: dir, version: 'patch' })).rejects.toThrow(
      'stale tag',
    )
  })

  it('dry run does nothing', async () => {
    const dir = makePkgDir('@test/pkg', '0.4.1')
    mockFlow()

    const result = await publishExecutor({ packagePath: dir, version: 'patch', dryRun: true })
    expect(result.success).toBe(true)
    expect(result.skipped).toContain('dry run')
  })

  it('accepts explicit version', async () => {
    const dir = makePkgDir('@test/pkg', '0.4.1')
    mockFlow({ 'npm view': fail('not found'), ...NO_REMOTE })

    const result = await publishExecutor({ packagePath: dir, version: '1.0.0' })
    expect(result.success).toBe(true)
    expect(result.version).toBe('1.0.0')
  })

  it('mode=bump creates a release branch + PR, never publishes or tags', async () => {
    const dir = makePkgDir('@test/pkg', '0.4.1')
    const calls = mockFlow({
      'npm view': ok('0.4.1'),
      ...NO_REMOTE,
      'gh pr create': ok('https://github.com/x/y/pull/1'),
    })

    const result = await publishExecutor({ packagePath: dir, version: 'patch', mode: 'bump' })
    expect(result.success).toBe(true)
    expect(result.version).toBe('0.4.2')
    expect(result.published).toBe(false)
    expect(result.tagged).toBe(false)
    expect(result.prCreated).toBe(true)
    expect(calls).toContainEqual(expect.stringContaining('checkout -B release/v0.4.2'))
    expect(calls).toContainEqual(expect.stringContaining('push origin release/v0.4.2'))
    expect(calls.some((c) => c.startsWith('npm publish'))).toBe(false)
    expect(calls.some((c) => c.startsWith('git tag'))).toBe(false)
  })

  it('mode=bump skips when the release branch and its PR already exist', async () => {
    const dir = makePkgDir('@test/pkg', '0.4.1')
    mockFlow({
      'npm view': ok('0.4.1'),
      'git ls-remote --exit-code --heads': ok('refs/heads/release/v0.4.2'),
      'git ls-remote --exit-code --tags': fail('no tag'),
      'gh pr create': fail('a pull request already exists'),
    })

    const result = await publishExecutor({ packagePath: dir, version: 'patch', mode: 'bump' })
    expect(result.success).toBe(true)
    expect(result.prCreated).toBe(false)
    expect(result.skipped).toContain('release branch already exists')
  })

  it('mode=bump repairs a missing PR when the release branch exists without one', async () => {
    const dir = makePkgDir('@test/pkg', '0.4.1')
    mockFlow({
      'npm view': ok('0.4.1'),
      'git ls-remote --exit-code --heads': ok('refs/heads/release/v0.4.2'),
      'git ls-remote --exit-code --tags': fail('no tag'),
      'gh pr create': ok('https://github.com/x/y/pull/9'),
    })

    const result = await publishExecutor({ packagePath: dir, version: 'patch', mode: 'bump' })
    expect(result.success).toBe(true)
    expect(result.prCreated).toBe(true)
    expect(result.skipped).not.toContain('release branch already exists')
  })

  it('mode=publish uses package.json version and never pushes the branch', async () => {
    const dir = makePkgDir('@test/pkg', '0.4.2')
    const calls = mockFlow({ 'npm view': ok('0.4.1'), ...NO_REMOTE })

    const result = await publishExecutor({ packagePath: dir, mode: 'publish' })
    expect(result.success).toBe(true)
    expect(result.version).toBe('0.4.2')
    expect(result.published).toBe(true)
    expect(result.tagged).toBe(true)
    expect(result.releaseCreated).toBe(true)
    expect(calls).toContainEqual('git push origin v0.4.2')
    expect(calls.some((c) => c === 'git push origin main')).toBe(false)
    expect(calls.some((c) => c.startsWith('git commit'))).toBe(false)
    expect(calls.some((c) => c.startsWith('npm version'))).toBe(false)
  })

  it('mode=publish repairs a half-release: skips publish, still tags + releases', async () => {
    const dir = makePkgDir('@test/pkg', '0.4.2')
    mockFlow({
      'npm view': ok('0.4.2'),
      'git ls-remote': fail('not found'),
      'gh release view': fail('not found'),
      'gh release create': ok(),
    })

    const result = await publishExecutor({ packagePath: dir, mode: 'publish' })
    expect(result.success).toBe(true)
    expect(result.published).toBe(false)
    expect(result.tagged).toBe(true)
    expect(result.releaseCreated).toBe(true)
  })

  it('mode=publish refuses a missing/invalid committed version', async () => {
    const dir = makePkgDir('@test/pkg', 'invalid')
    mockFlow()
    await expect(publishExecutor({ packagePath: dir, mode: 'publish' })).rejects.toThrow(
      'requires a committed semver version',
    )
  })

  it('mode=publish rejects a dirty working tree', async () => {
    const dir = makePkgDir('@test/pkg', '0.4.2')
    const calls = mockFlow({ 'git status': ok(' M packages/cli/package.json') })
    await expect(publishExecutor({ packagePath: dir, mode: 'publish' })).rejects.toThrow(
      'Working tree is dirty',
    )
    // The guard checks all non-ignored changes — an uncommitted source file
    // must not ship unpublished. Artifacts belong in .gitignore.
    expect(calls).toContainEqual('git status --porcelain')
  })

  it('treats npm prerelease beta.10 as ahead of local beta.2 (semver, not lexical)', async () => {
    const dir = makePkgDir('@test/pkg', '1.0.0-beta.2')
    mockFlow({ 'npm view': ok('1.0.0-beta.10'), 'git ls-remote': fail('not found') })

    const result = await publishExecutor({ packagePath: dir, version: 'patch' })
    expect(result.version).toBe('1.0.0-beta.10')
  })

  it('graduates a prerelease to stable on patch bump (1.0.0-beta.2 → 1.0.0)', async () => {
    const dir = makePkgDir('@test/pkg', '1.0.0-beta.2')
    mockFlow({ 'npm view': fail('not published'), 'git ls-remote': fail('not found') })

    const result = await publishExecutor({ packagePath: dir, version: 'patch' })
    expect(result.version).toBe('1.0.0')
  })

  it('stages a package-local package-lock.json in the bump commit', async () => {
    const dir = makePkgDir('@test/pkg', '0.4.1')
    writeFileSync(join(dir, 'package-lock.json'), '{}')
    const calls = mockFlow({
      'npm view': ok('0.4.1'),
      ...NO_REMOTE,
      'gh pr create': ok('https://github.com/x/y/pull/1'),
    })

    await publishExecutor({ packagePath: dir, version: 'patch', mode: 'bump' })
    expect(calls).toContainEqual(`git add ${dir}/package-lock.json`)
  })

  it('mode=bump cuts the release branch from origin/<branch>, not current HEAD', async () => {
    const dir = makePkgDir('@test/pkg', '0.4.1')
    const calls = mockFlow({
      'npm view': ok('0.4.1'),
      ...NO_REMOTE,
      'gh pr create': ok('https://github.com/x/y/pull/1'),
    })

    await publishExecutor({ packagePath: dir, version: 'patch', mode: 'bump' })
    expect(calls).toContainEqual('git fetch origin main')
    expect(calls).toContainEqual('git checkout -B release/v0.4.2 origin/main')
  })

  it('mode=full stamps the version even when npm is ahead (repair)', async () => {
    const dir = makePkgDir('@test/pkg', '0.4.1')
    const calls = mockFlow({
      'npm view': ok('0.4.2'),
      'git ls-remote': fail('not found'),
      'git diff --cached': fail('diff'),
    })

    const result = await publishExecutor({ packagePath: dir, version: 'patch' })
    expect(result.success).toBe(true)
    expect(result.version).toBe('0.4.2')
    expect(result.published).toBe(false)
    expect(calls).toContainEqual(expect.stringContaining('npm version 0.4.2'))
    expect(calls.some((c) => c.startsWith('git commit'))).toBe(true)
  })

  it('mode=full pushes the branch before publishing and tags last', async () => {
    const dir = makePkgDir('@test/pkg', '0.4.1')
    const calls = mockFlow({ 'npm view': ok('0.4.1'), ...NO_REMOTE })

    await publishExecutor({ packagePath: dir, version: 'patch' })
    const pushIdx = calls.indexOf('git push origin main'),
      publishIdx = calls.findIndex((c) => c.startsWith('npm publish')),
      tagIdx = calls.indexOf('git tag v0.4.2')
    expect(pushIdx).toBeGreaterThanOrEqual(0)
    expect(publishIdx).toBeGreaterThan(pushIdx)
    expect(tagIdx).toBeGreaterThan(publishIdx)
  })
})
