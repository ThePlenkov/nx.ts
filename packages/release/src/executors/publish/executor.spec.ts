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

function ok(stdout = ''): { status: number | null; stdout: string; stderr: string } {
  return spawnResult(0, stdout)
}

function fail(stderr = ''): { status: number | null; stdout: string; stderr: string } {
  return spawnResult(1, '', stderr)
}

function makePkgDir(name: string, version: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'nx-release-test-'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version }))
  return dir
}

describe('publishExecutor', () => {
  beforeEach(() => {
    mockSpawn.mockReset()
  })

  it('computes next patch version from npm latest', async () => {
    const dir = makePkgDir('@test/pkg', '0.4.1')
    mockSpawn.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'npm' && args[0] === 'view') return ok('0.4.1')
      if (cmd === 'npm' && args[0] === 'version') return ok('0.4.2')
      if (cmd === 'git' && args[0] === 'ls-remote') return fail('not found')
      if (cmd === 'git' && args[0] === 'config') return ok()
      if (cmd === 'git' && args[0] === 'add') return ok()
      if (cmd === 'git' && args[0] === 'diff') return fail('diff') // non-empty diff
      if (cmd === 'git' && args[0] === 'commit') return ok()
      if (cmd === 'git' && args[0] === 'tag') return ok()
      if (cmd === 'git' && args[0] === 'fetch') return ok()
      if (cmd === 'git' && args[0] === 'rebase') return ok()
      if (cmd === 'git' && args[0] === 'push') return ok()
      if (cmd === 'npm' && args[0] === 'publish') return ok()
      if (cmd === 'gh' && args[0] === 'release') return ok()
      return ok()
    })

    const result = await publishExecutor({ packagePath: dir, version: 'patch' })
    expect(result.success).toBe(true)
    expect(result.version).toBe('0.4.2')
    expect(result.published).toBe(true)
    expect(result.tagged).toBe(true)
  })

  it('skips when already published, tagged, and released', async () => {
    const dir = makePkgDir('@test/pkg', '0.4.2')
    mockSpawn.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'npm' && args[0] === 'view') return ok('0.4.2')
      if (cmd === 'git' && args[0] === 'ls-remote') return ok('v0.4.2')
      if (cmd === 'gh' && args[0] === 'release' && args[1] === 'view') return ok()
      return ok()
    })

    const result = await publishExecutor({ packagePath: dir, version: '0.4.2' })
    expect(result.success).toBe(true)
    expect(result.skipped).toContain('already published, tagged, and released')
  })

  it('does release repair when npm+tag exist but no GitHub Release', async () => {
    const dir = makePkgDir('@test/pkg', '0.4.2')
    mockSpawn.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'npm' && args[0] === 'view') return ok('0.4.2')
      if (cmd === 'git' && args[0] === 'ls-remote') return ok('v0.4.2')
      if (cmd === 'gh' && args[0] === 'release' && args[1] === 'view') return fail('not found')
      if (cmd === 'gh' && args[0] === 'release' && args[1] === 'create') return ok()
      return ok()
    })

    const result = await publishExecutor({ packagePath: dir, version: '0.4.2' })
    expect(result.success).toBe(true)
    expect(result.releaseCreated).toBe(true)
    expect(result.published).toBe(false)
    expect(result.tagged).toBe(false)
  })

  it('dry run does nothing', async () => {
    const dir = makePkgDir('@test/pkg', '0.4.1')
    mockSpawn.mockImplementation(() => ok())

    const result = await publishExecutor({ packagePath: dir, version: 'patch', dryRun: true })
    expect(result.success).toBe(true)
    expect(result.skipped).toContain('dry run')
  })

  it('accepts explicit version', async () => {
    const dir = makePkgDir('@test/pkg', '0.4.1')
    mockSpawn.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'npm' && args[0] === 'view') return fail('not found')
      if (cmd === 'git' && args[0] === 'ls-remote') return fail('not found')
      if (cmd === 'npm' && args[0] === 'version') return ok('1.0.0')
      if (cmd === 'npm' && args[0] === 'publish') return ok()
      if (cmd === 'git' && args[0] === 'config') return ok()
      if (cmd === 'git' && args[0] === 'add') return ok()
      if (cmd === 'git' && args[0] === 'diff') return fail('diff')
      if (cmd === 'git' && args[0] === 'commit') return ok()
      if (cmd === 'git' && args[0] === 'tag') return ok()
      if (cmd === 'git' && args[0] === 'fetch') return ok()
      if (cmd === 'git' && args[0] === 'rebase') return ok()
      if (cmd === 'git' && args[0] === 'push') return ok()
      if (cmd === 'gh' && args[0] === 'release') return ok()
      return ok()
    })

    const result = await publishExecutor({ packagePath: dir, version: '1.0.0' })
    expect(result.success).toBe(true)
    expect(result.version).toBe('1.0.0')
  })

  it('mode=bump creates a release branch + PR, never publishes or tags', async () => {
    const dir = makePkgDir('@test/pkg', '0.4.1'),
      calls: string[][] = []
    mockSpawn.mockImplementation((cmd: string, args: string[]) => {
      calls.push([cmd, ...args])
      if (cmd === 'npm' && args[0] === 'view') return ok('0.4.1')
      if (cmd === 'git' && args[0] === 'ls-remote' && args.includes('--heads'))
        return fail('no branch')
      if (cmd === 'git' && args[0] === 'ls-remote' && args.includes('--tags')) return fail('no tag')
      if (cmd === 'git' && args[0] === 'diff') return fail('diff') // Non-empty staged diff
      if (cmd === 'gh' && args[0] === 'pr' && args[1] === 'create')
        return ok('https://github.com/x/y/pull/1')
      return ok()
    })

    const result = await publishExecutor({ packagePath: dir, version: 'patch', mode: 'bump' })
    expect(result.success).toBe(true)
    expect(result.version).toBe('0.4.2')
    expect(result.published).toBe(false)
    expect(result.tagged).toBe(false)
    expect(result.prCreated).toBe(true)
    const joined = calls.map((c) => c.join(' '))
    expect(joined).toContainEqual(expect.stringContaining('checkout -B release/v0.4.2'))
    expect(joined).toContainEqual(expect.stringContaining('push origin release/v0.4.2'))
    expect(joined.some((c) => c.startsWith('npm publish'))).toBe(false)
    expect(joined.some((c) => c.startsWith('git tag'))).toBe(false)
  })

  it('mode=bump skips when the release branch already exists remotely', async () => {
    const dir = makePkgDir('@test/pkg', '0.4.1')
    mockSpawn.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'npm' && args[0] === 'view') return ok('0.4.1')
      if (cmd === 'git' && args[0] === 'ls-remote' && args.includes('--heads'))
        return ok('refs/heads/release/v0.4.2')
      if (cmd === 'git' && args[0] === 'ls-remote' && args.includes('--tags')) return fail('no tag')
      return ok()
    })

    const result = await publishExecutor({ packagePath: dir, version: 'patch', mode: 'bump' })
    expect(result.success).toBe(true)
    expect(result.prCreated).toBe(false)
    expect(result.skipped).toContain('release branch already exists')
  })

  it('mode=publish uses package.json version and never pushes the branch', async () => {
    const dir = makePkgDir('@test/pkg', '0.4.2'),
      calls: string[][] = []
    mockSpawn.mockImplementation((cmd: string, args: string[]) => {
      calls.push([cmd, ...args])
      if (cmd === 'npm' && args[0] === 'view') return ok('0.4.1')
      if (cmd === 'git' && args[0] === 'ls-remote') return fail('not found')
      if (cmd === 'npm' && args[0] === 'publish') return ok()
      if (cmd === 'git' && args[0] === 'tag') return ok()
      if (cmd === 'git' && args[0] === 'push') return ok()
      if (cmd === 'gh' && args[0] === 'release') return ok()
      return ok()
    })

    const result = await publishExecutor({ packagePath: dir, mode: 'publish' })
    expect(result.success).toBe(true)
    expect(result.version).toBe('0.4.2')
    expect(result.published).toBe(true)
    expect(result.tagged).toBe(true)
    expect(result.releaseCreated).toBe(true)
    const joined = calls.map((c) => c.join(' '))
    expect(joined).toContainEqual('git push origin v0.4.2')
    expect(joined.some((c) => c === 'git push origin main')).toBe(false)
    expect(joined.some((c) => c.startsWith('git commit'))).toBe(false)
    expect(joined.some((c) => c.startsWith('npm version'))).toBe(false)
  })

  it('mode=publish repairs a half-release: skips publish, still tags + releases', async () => {
    const dir = makePkgDir('@test/pkg', '0.4.2')
    mockSpawn.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'npm' && args[0] === 'view') return ok('0.4.2')
      if (cmd === 'git' && args[0] === 'ls-remote') return fail('not found')
      if (cmd === 'git' && args[0] === 'tag') return ok()
      if (cmd === 'git' && args[0] === 'push') return ok()
      if (cmd === 'gh' && args[0] === 'release' && args[1] === 'view') return fail('not found')
      if (cmd === 'gh' && args[0] === 'release' && args[1] === 'create') return ok()
      return ok()
    })

    const result = await publishExecutor({ packagePath: dir, mode: 'publish' })
    expect(result.success).toBe(true)
    expect(result.published).toBe(false)
    expect(result.tagged).toBe(true)
    expect(result.releaseCreated).toBe(true)
  })

  it('mode=publish refuses a missing/invalid committed version', async () => {
    const dir = makePkgDir('@test/pkg', 'invalid')
    mockSpawn.mockImplementation(() => ok())
    await expect(publishExecutor({ packagePath: dir, mode: 'publish' })).rejects.toThrow(
      'requires a committed semver version',
    )
  })
})
