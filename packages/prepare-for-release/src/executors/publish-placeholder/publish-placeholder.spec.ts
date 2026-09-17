import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state: {
  calls: { command: string; args: string[]; options?: unknown }[]
  responses: Map<string, { status: number; stdout: string; stderr: string }>
} = {
  calls: [],
  responses: new Map(),
}

vi.mock('node:child_process', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    spawnSync: (command: string, args: string[] = [], options?: unknown) => {
      state.calls.push({ args, command, options })
      const key = `${command} ${args.join(' ')}`
      for (const [pattern, response] of state.responses.entries()) {
        if (key.includes(pattern)) {
          return response
        }
      }
      return { status: 0, stderr: '', stdout: '' }
    },
    spawn: (command: string, args: string[] = [], options?: unknown) => {
      state.calls.push({ args, command, options })
      const key = `${command} ${args.join(' ')}`
      let status = 0
      let stderr = ''
      for (const [pattern, response] of state.responses.entries()) {
        if (key.includes(pattern)) {
          status = response.status
          stderr = response.stderr
          break
        }
      }
      const child = new EventEmitter() as EventEmitter & {
        stderr: EventEmitter
        kill: () => void
      }
      child.stderr = new EventEmitter()
      child.kill = () => {}
      queueMicrotask(() => {
        if (stderr) child.stderr.emit('data', Buffer.from(stderr))
        child.emit('close', status)
      })
      return child
    },
  }
})

const { publishPlaceholderExecutor } = await import('./executor.ts')

import type { NxPrepareForReleaseOptions } from './executor.ts'

function makeWorkspace(): string {
  return mkdtempSync(join(tmpdir(), 'nx-prepare-for-release-'))
}

function makePackage(root: string, name: string, version = '0.0.0'): string {
  const pkgRoot = join(root, 'packages', name.replace('@nx-devkit/', ''))
  mkdirSync(pkgRoot, { recursive: true })
  writeFileSync(
    join(pkgRoot, 'package.json'),
    JSON.stringify({ license: 'MIT', name, version }, null, 2),
  )
  writeFileSync(join(pkgRoot, 'index.js'), 'module.exports = {}\n')
  return pkgRoot
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
}

describe('publishPlaceholderExecutor', () => {
  let workspace: string
  let originalCwd: string
  let originalTrustRepo: string | undefined

  beforeEach(() => {
    workspace = makeWorkspace()
    originalCwd = process.cwd()
    originalTrustRepo = process.env.NPM_TRUST_REPO
    process.env.NPM_TRUST_REPO = 'nx-devkit/nx.ts'
    process.chdir(workspace)
    state.calls.length = 0
    state.responses.clear()
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(workspace, { force: true, recursive: true })
    if (originalTrustRepo === undefined) {
      delete process.env.NPM_TRUST_REPO
    } else {
      process.env.NPM_TRUST_REPO = originalTrustRepo
    }
  })

  it('publishes a placeholder tarball when package is not yet on the registry', async () => {
    const pkgRoot = makePackage(workspace, '@nx-devkit/prepare-for-release', '0.0.0')
    const pkgJsonPath = join(pkgRoot, 'package.json')
    const originalBytes = readFileSync(pkgJsonPath)

    state.responses.set('npm view', { status: 1, stderr: 'E404', stdout: '' })
    state.responses.set('npm pack', {
      status: 0,
      stderr: '',
      stdout: join(workspace, 'nx-devkit-prepare-for-release-0.0.0.tgz'),
    })
    state.responses.set('npm publish', {
      status: 0,
      stderr: '',
      stdout: '+ @nx-devkit/prepare-for-release@0.0.0',
    })
    writeFileSync(join(workspace, 'nx-devkit-prepare-for-release-0.0.0.tgz'), 'fake-tarball-bytes')

    const options: NxPrepareForReleaseOptions = { dryRun: false }
    const result = await publishPlaceholderExecutor(options, { root: workspace })

    expect(result.published).toEqual(['@nx-devkit/prepare-for-release'])
    expect(result.skipped).toEqual([])

    const viewCall = state.calls.find((c) => c.args[0] === 'view')
    expect(viewCall).toBeDefined()
    expect(viewCall?.args).toContain('@nx-devkit/prepare-for-release')
    expect(viewCall?.args).toContain('version')

    const publishCall = state.calls.find((c) => c.args[0] === 'publish')
    expect(publishCall).toBeDefined()
    expect(publishCall?.args[1]).toMatch(/\.tgz/)
    expect(publishCall?.args).toContain('--access')
    expect(publishCall?.args).toContain('public')
    expect(publishCall?.args).toContain('--tag')
    expect(publishCall?.args).toContain('placeholder')

    const afterBytes = readFileSync(pkgJsonPath)
    expect(Buffer.compare(originalBytes, afterBytes)).toBe(0)

    const afterParsed = readJson(pkgJsonPath)
    expect(afterParsed.version).toBe('0.0.0')
    expect(afterParsed.publishConfig).toBeUndefined()
  })

  it('uses stdio: inherit for npm publish so OTP/MFA prompts reach the terminal', async () => {
    makePackage(workspace, '@nx-devkit/prepare-for-release', '0.0.0')
    state.responses.set('npm view', { status: 1, stderr: 'E404', stdout: '' })
    state.responses.set('npm pack', {
      status: 0,
      stderr: '',
      stdout: join(workspace, 'nx-devkit-prepare-for-release-0.0.0.tgz'),
    })
    state.responses.set('npm publish', {
      status: 0,
      stderr: '',
      stdout: '+ @nx-devkit/prepare-for-release@0.0.0',
    })
    writeFileSync(join(workspace, 'nx-devkit-prepare-for-release-0.0.0.tgz'), 'fake-tarball-bytes')

    await publishPlaceholderExecutor({ dryRun: false }, { root: workspace })

    const publishCall = state.calls.find((c) => c.args[0] === 'publish')
    expect(publishCall).toBeDefined()
    expect(publishCall?.options).toMatchObject({ stdio: 'inherit' })
  })

  it('skips a package that is already published on the registry', async () => {
    makePackage(workspace, '@nx-devkit/prepare-for-release', '0.0.0')
    state.responses.set('npm view', { status: 0, stderr: '', stdout: '0.5.0' })

    const result = await publishPlaceholderExecutor({}, { root: workspace })

    expect(result.published).toEqual([])
    expect(result.skipped).toEqual(['@nx-devkit/prepare-for-release'])

    const publishCall = state.calls.find((c) => c.args[0] === 'publish')
    expect(publishCall).toBeUndefined()
    const packCall = state.calls.find((c) => c.args[0] === 'pack')
    expect(packCall).toBeUndefined()
  })

  it('emits trust commands so the user can run `npm trust github` against each placeholder', async () => {
    makePackage(workspace, '@nx-devkit/prepare-for-release', '0.0.0')
    state.responses.set('npm view', { status: 1, stderr: 'E404', stdout: '' })
    state.responses.set('npm pack', {
      status: 0,
      stderr: '',
      stdout: join(workspace, 'nx-devkit-prepare-for-release-0.0.0.tgz'),
    })
    state.responses.set('npm publish', { status: 0, stderr: '', stdout: 'ok' })
    writeFileSync(join(workspace, 'nx-devkit-prepare-for-release-0.0.0.tgz'), 'fake-tarball-bytes')

    const result = await publishPlaceholderExecutor({}, { root: workspace })

    expect(result.trustCommands.length).toBeGreaterThanOrEqual(1)
    expect(result.trustCommands[0]).toContain('npm trust github')
    expect(result.trustCommands[0]).toContain('--file release.yml')
    expect(result.trustCommands[0]).toContain('--repo nx-devkit/nx.ts')
    expect(result.trustCommands[0]).toContain('--allow-publish')
  })

  it('trust: true runs npm trust github for each published package', async () => {
    makePackage(workspace, '@nx-devkit/prepare-for-release', '0.0.0')
    state.responses.set('npm view', { status: 1, stderr: 'E404', stdout: '' })
    state.responses.set('npm pack', {
      status: 0,
      stderr: '',
      stdout: join(workspace, 'nx-devkit-prepare-for-release-0.0.0.tgz'),
    })
    state.responses.set('npm publish', { status: 0, stderr: '', stdout: 'ok' })
    state.responses.set('npm trust', { status: 0, stderr: '', stdout: '' })
    writeFileSync(join(workspace, 'nx-devkit-prepare-for-release-0.0.0.tgz'), 'fake-tarball-bytes')

    const result = await publishPlaceholderExecutor({ trust: true }, { root: workspace })

    expect(result.success).toBe(true)
    const trustCall = state.calls.find((c) => c.args[0] === 'trust')
    expect(trustCall).toBeDefined()
    expect(trustCall?.args).toContain('@nx-devkit/prepare-for-release')
    expect(trustCall?.args).toContain('--file')
    expect(trustCall?.args).toContain('release.yml')
    expect(trustCall?.args).toContain('--repo')
    expect(trustCall?.args).toContain('nx-devkit/nx.ts')
    expect(trustCall?.args).toContain('--allow-publish')
    expect(trustCall?.options).toMatchObject({ stdio: ['inherit', 'inherit', 'pipe'] })
  })

  it('trust: true tees piped stderr to the terminal so MFA prompts stay visible', async () => {
    makePackage(workspace, '@nx-devkit/prepare-for-release', '0.0.0')
    state.responses.set('npm view', { status: 1, stderr: 'E404', stdout: '' })
    state.responses.set('npm pack', {
      status: 0,
      stderr: '',
      stdout: join(workspace, 'nx-devkit-prepare-for-release-0.0.0.tgz'),
    })
    state.responses.set('npm publish', { status: 0, stderr: '', stdout: 'ok' })
    state.responses.set('npm trust', { status: 0, stderr: 'Enter OTP:', stdout: '' })
    writeFileSync(join(workspace, 'nx-devkit-prepare-for-release-0.0.0.tgz'), 'fake-tarball-bytes')

    const writes: string[] = []
    const originalWrite = process.stderr.write.bind(process.stderr)
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(((
      chunk: unknown,
      ...rest: unknown[]
    ) => {
      writes.push(String(chunk))
      return originalWrite(chunk as never, ...(rest as never[]))
    }) as typeof process.stderr.write)

    try {
      const result = await publishPlaceholderExecutor({ trust: true }, { root: workspace })
      expect(result.success).toBe(true)
      expect(writes.join('')).toContain('Enter OTP:')
    } finally {
      spy.mockRestore()
    }
  })

  it('trust: true does not run npm trust github in dryRun mode', async () => {
    makePackage(workspace, '@nx-devkit/prepare-for-release', '0.0.0')
    state.responses.set('npm view', { status: 1, stderr: 'E404', stdout: '' })

    const result = await publishPlaceholderExecutor(
      { trust: true, dryRun: true },
      { root: workspace },
    )

    expect(result.published).toEqual(['@nx-devkit/prepare-for-release'])
    const trustCall = state.calls.find((c) => c.args[0] === 'trust')
    expect(trustCall).toBeUndefined()
  })

  it('trust: true runs npm trust github for already-published (skipped) packages too', async () => {
    makePackage(workspace, '@nx-devkit/prepare-for-release', '0.0.0')
    state.responses.set('npm view', { status: 0, stderr: '', stdout: '0.0.0' })
    state.responses.set('npm trust', { status: 0, stderr: '', stdout: '' })

    const result = await publishPlaceholderExecutor({ trust: true }, { root: workspace })

    expect(result.skipped).toEqual(['@nx-devkit/prepare-for-release'])
    expect(result.success).toBe(true)
    const trustCall = state.calls.find((c) => c.args[0] === 'trust')
    expect(trustCall).toBeDefined()
    expect(trustCall?.args).toContain('@nx-devkit/prepare-for-release')
    expect(trustCall?.args).toContain('--repo')
    expect(trustCall?.args).toContain('nx-devkit/nx.ts')
    expect(trustCall?.args).toContain('--allow-publish')
  })

  it('dryRun: true does not call npm publish or npm pack', async () => {
    makePackage(workspace, '@nx-devkit/prepare-for-release', '0.0.0')
    state.responses.set('npm view', { status: 1, stderr: 'E404', stdout: '' })

    const result = await publishPlaceholderExecutor({ dryRun: true }, { root: workspace })

    expect(result.published).toEqual(['@nx-devkit/prepare-for-release'])
    const publishCall = state.calls.find((c) => c.args[0] === 'publish')
    expect(publishCall).toBeUndefined()
    const packCall = state.calls.find((c) => c.args[0] === 'pack')
    expect(packCall).toBeUndefined()
  })

  it('honors a custom placeholderVersion and placeholderTag', async () => {
    const pkgRoot = makePackage(workspace, '@nx-devkit/prepare-for-release', '1.2.3')
    const originalBytes = readFileSync(join(pkgRoot, 'package.json'))
    state.responses.set('npm view', { status: 1, stderr: 'E404', stdout: '' })
    state.responses.set('npm pack', {
      status: 0,
      stderr: '',
      stdout: join(workspace, 'nx-devkit-prepare-for-release-1.2.3.tgz'),
    })
    state.responses.set('npm publish', { status: 0, stderr: '', stdout: 'ok' })
    writeFileSync(join(workspace, 'nx-devkit-prepare-for-release-1.2.3.tgz'), 'fake-tarball-bytes')

    const result = await publishPlaceholderExecutor(
      { placeholderTag: 'alpha', placeholderVersion: '0.0.1' },
      { root: workspace },
    )

    expect(result.published).toEqual(['@nx-devkit/prepare-for-release'])
    const publishCall = state.calls.find((c) => c.args[0] === 'publish')
    expect(publishCall).toBeDefined()
    expect(publishCall?.args).toContain('--tag')
    expect(publishCall?.args).toContain('alpha')
    const afterBytes = readFileSync(join(pkgRoot, 'package.json'))
    expect(Buffer.compare(originalBytes, afterBytes)).toBe(0)
  })

  it('uses a custom trustRepo option when provided', async () => {
    makePackage(workspace, '@nx-devkit/prepare-for-release', '0.0.0')
    state.responses.set('npm view', { status: 1, stderr: 'E404', stdout: '' })
    state.responses.set('npm pack', {
      status: 0,
      stderr: '',
      stdout: join(workspace, 'nx-devkit-prepare-for-release-0.0.0.tgz'),
    })
    state.responses.set('npm publish', { status: 0, stderr: '', stdout: 'ok' })
    writeFileSync(join(workspace, 'nx-devkit-prepare-for-release-0.0.0.tgz'), 'fake')

    const result = await publishPlaceholderExecutor(
      { trustRepo: 'my-org/my-repo' },
      { root: workspace },
    )

    expect(result.trustCommands[0]).toContain('--repo my-org/my-repo')
    expect(result.trustCommands[0]).not.toContain('ThePlenkov/nx.ts')
    expect(result.trustCommands[0]).not.toContain('nx-devkit/nx.ts')
  })

  it('rejects an invalid trustRepo slug', async () => {
    makePackage(workspace, '@nx-devkit/prepare-for-release', '0.0.0')
    state.responses.set('npm view', { status: 1, stderr: 'E404', stdout: '' })

    await expect(
      publishPlaceholderExecutor({ trustRepo: 'not a slug' }, { root: workspace }),
    ).rejects.toThrow(/Invalid trustRepo/)
  })

  it('skips a package.json that contains invalid JSON', async () => {
    const pkgRoot = makePackage(workspace, '@nx-devkit/prepare-for-release', '0.0.0')
    writeFileSync(join(pkgRoot, 'package.json'), '{ this is not valid json')

    const result = await publishPlaceholderExecutor({}, { root: workspace })

    expect(result.published).toEqual([])
    expect(result.skipped).toEqual([])
  })

  it('treats a 404 from `npm view` as not-published (does not republish)', async () => {
    makePackage(workspace, '@nx-devkit/prepare-for-release', '0.0.0')
    state.responses.set('npm view', {
      status: 1,
      stderr:
        'npm ERR! code E404\nnpm ERR! 404 Not Found - GET https://registry.npmjs.org/@nx-devkit/prepare-for-release',
      stdout: '',
    })

    const result = await publishPlaceholderExecutor({ dryRun: true }, { root: workspace })

    expect(result.published).toEqual(['@nx-devkit/prepare-for-release'])
    expect(result.skipped).toEqual([])
  })

  it('throws when `npm view` fails with a non-404 error (does not silently republish)', async () => {
    makePackage(workspace, '@nx-devkit/prepare-for-release', '0.0.0')
    state.responses.set('npm view', {
      status: 1,
      stderr: 'npm ERR! code EAI_AGAIN\nnpm ERR! getaddrinfo EAI_AGAIN registry.npmjs.org',
      stdout: '',
    })

    await expect(publishPlaceholderExecutor({ dryRun: true }, { root: workspace })).rejects.toThrow(
      /npm view failed for @nx-devkit\/prepare-for-release/,
    )
  })
})
