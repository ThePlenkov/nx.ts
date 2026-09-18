import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state: {
  fetchCalls: { url: string; init: { method?: string; body?: string } | undefined }[]
  fetchResponse:
    | { status: number; body: unknown }
    | ((url: string) => { status: number; body: unknown })
  spawnCalls: { command: string; args: string[]; options: { cwd?: string } | undefined }[]
  spawnResponse: { status: number; stdout: string; stderr: string }
} = {
  fetchCalls: [],
  fetchResponse: { status: 200, body: {} },
  spawnCalls: [],
  spawnResponse: { status: 0, stdout: '', stderr: '' },
}

vi.mock('node:child_process', () => ({
  spawnSync: (command: string, args: string[] = [], options?: { cwd?: string }) => {
    state.spawnCalls.push({ args, command, options })
    return state.spawnResponse
  },
}))

const fetchMock = async (
  url: string | URL | Request,
  init?: { method?: string; body?: string },
) => {
  state.fetchCalls.push({ init, url: String(url) })
  const res =
    typeof state.fetchResponse === 'function'
      ? state.fetchResponse(String(url))
      : state.fetchResponse
  return {
    status: res.status,
    json: async () => res.body,
  } as Response
}
const originalFetch = globalThis.fetch
globalThis.fetch = fetchMock as typeof fetch

afterAll(() => {
  globalThis.fetch = originalFetch
})

const { rotateExecutor } = await import('./executor.ts')

function makeWorkspace(nxJson: Record<string, unknown> = {}, packageName = 'my-workspace'): string {
  const root = mkdtempSync(join(tmpdir(), 'nx-cloud-rotate-'))
  writeFileSync(join(root, 'nx.json'), `${JSON.stringify(nxJson, null, 2)}\n`)
  mkdirSync(join(root, 'packages'), { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: packageName }))
  return root
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
}

describe('rotateExecutor', () => {
  let workspace: string
  let savedEnv: Record<string, string | undefined>

  beforeEach(() => {
    workspace = makeWorkspace()
    state.fetchCalls.length = 0
    state.spawnCalls.length = 0
    state.fetchResponse = {
      status: 200,
      body: { nxCloudId: 'ws_new123', url: 'https://cloud.nx.app/connect/ws_new123' },
    }
    state.spawnResponse = { status: 0, stdout: '2026-01-01T00:00:00+00:00\n', stderr: '' }
    savedEnv = {
      NX_CLOUD_API: process.env.NX_CLOUD_API,
      NRWL_API: process.env.NRWL_API,
    }
    delete process.env.NX_CLOUD_API
    delete process.env.NRWL_API
  })

  afterEach(() => {
    rmSync(workspace, { force: true, recursive: true })
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('POSTs to v2 create-org-and-workspace and writes nxCloudId into nx.json', async () => {
    const result = await rotateExecutor({}, { root: workspace })

    expect(result.success).toBe(true)
    expect(result.nxCloudId).toBe('ws_new123')
    expect(result.url).toBe('https://cloud.nx.app/connect/ws_new123')

    expect(state.fetchCalls).toHaveLength(1)
    const call = state.fetchCalls[0]
    expect(call?.url).toBe('https://cloud.nx.app/nx-cloud/v2/create-org-and-workspace')
    expect(call?.init?.method).toBe('POST')
    const body = JSON.parse(call?.init?.body ?? '{}')
    expect(body.workspaceName).toBe('my-workspace')
    expect(body.installationSource).toBe('nx-devkit-nx-cloud')
    expect(body.nxInitDate).toBe('2026-01-01T00:00:00.000Z')

    const nxJson = readJson(join(workspace, 'nx.json'))
    expect(nxJson.nxCloudId).toBe('ws_new123')
    expect(nxJson.nxCloudAccessToken).toBeUndefined()
  })

  it('probes nxInitDate from `git log -- nx.json`', async () => {
    await rotateExecutor({}, { root: workspace })

    const gitCall = state.spawnCalls.find((c) => c.command === 'git')
    expect(gitCall).toBeDefined()
    expect(gitCall?.args).toEqual([
      'log',
      '--diff-filter=A',
      '--follow',
      '--format=%aI',
      '--',
      'nx.json',
    ])
    expect(gitCall?.options?.cwd).toBe(workspace)
  })

  it('removes a stale nxCloudAccessToken when rebinding to nxCloudId', async () => {
    rmSync(workspace, { force: true, recursive: true })
    workspace = makeWorkspace({ nxCloudAccessToken: 'old-token-123' })

    const result = await rotateExecutor({}, { root: workspace })

    expect(result.previousBinding).toBe('old-…')
    const nxJson = readJson(join(workspace, 'nx.json'))
    expect(nxJson.nxCloudId).toBe('ws_new123')
    expect(nxJson.nxCloudAccessToken).toBeUndefined()
  })

  it('reports the previous nxCloudId binding', async () => {
    rmSync(workspace, { force: true, recursive: true })
    workspace = makeWorkspace({ nxCloudId: 'ws_old999' })

    const result = await rotateExecutor({}, { root: workspace })

    expect(result.previousBinding).toBe('ws_o…')
    expect(readJson(join(workspace, 'nx.json')).nxCloudId).toBe('ws_new123')
  })

  it('falls back to v1 endpoint on HTTP 404 and writes nxCloudAccessToken', async () => {
    state.fetchResponse = (url: string) =>
      url.includes('/v2/')
        ? { status: 404, body: { message: 'not found' } }
        : { status: 200, body: { token: 'v1-token-abc', url: 'https://cloud.nx.app/connect/v1' } }

    const result = await rotateExecutor({}, { root: workspace })

    expect(result.success).toBe(true)
    expect(state.fetchCalls).toHaveLength(2)
    expect(state.fetchCalls[1]?.url).toBe('https://cloud.nx.app/nx-cloud/create-org-and-workspace')
    const nxJson = readJson(join(workspace, 'nx.json'))
    expect(nxJson.nxCloudAccessToken).toBe('v1-token-abc')
    expect(nxJson.nxCloudId).toBeUndefined()
  })

  it('dryRun calls the API but leaves nx.json untouched', async () => {
    rmSync(workspace, { force: true, recursive: true })
    workspace = makeWorkspace({ nxCloudAccessToken: 'keep-me' })
    const before = readFileSync(join(workspace, 'nx.json'), 'utf8')

    const result = await rotateExecutor({ dryRun: true }, { root: workspace })

    expect(result.success).toBe(true)
    expect(result.nxCloudId).toBe('ws_new123')
    expect(state.fetchCalls).toHaveLength(1)
    expect(readFileSync(join(workspace, 'nx.json'), 'utf8')).toBe(before)
  })

  it('honors workspaceName, cloudUrl and installationSource options', async () => {
    await rotateExecutor(
      {
        cloudUrl: 'https://nx-cloud.example.com',
        installationSource: 'custom',
        workspaceName: 'other-ws',
      },
      { root: workspace },
    )

    const call = state.fetchCalls[0]
    expect(call?.url).toBe('https://nx-cloud.example.com/nx-cloud/v2/create-org-and-workspace')
    const body = JSON.parse(call?.init?.body ?? '{}')
    expect(body.workspaceName).toBe('other-ws')
    expect(body.installationSource).toBe('custom')
  })

  it('uses NX_CLOUD_API env as cloudUrl and writes nxCloudUrl into nx.json', async () => {
    process.env.NX_CLOUD_API = 'https://onprem.example.com'

    await rotateExecutor({}, { root: workspace })

    expect(state.fetchCalls[0]?.url).toBe(
      'https://onprem.example.com/nx-cloud/v2/create-org-and-workspace',
    )
    const nxJson = readJson(join(workspace, 'nx.json'))
    expect(nxJson.nxCloudUrl).toBe('https://onprem.example.com')
  })

  it('throws when the API responds with a non-404 error', async () => {
    state.fetchResponse = { status: 500, body: { message: 'boom' } }

    await expect(rotateExecutor({}, { root: workspace })).rejects.toThrow(/boom|500/)
  })

  it('throws when the API returns an error message in a 200 body', async () => {
    state.fetchResponse = { status: 200, body: { message: 'rate limited' } }

    await expect(rotateExecutor({}, { root: workspace })).rejects.toThrow(/rate limited/)
  })

  it('falls back to current time when git log fails', async () => {
    state.spawnResponse = { status: 1, stdout: '', stderr: 'not a git repo' }

    await rotateExecutor({}, { root: workspace })

    const body = JSON.parse(state.fetchCalls[0]?.init?.body ?? '{}')
    expect(() => new Date(body.nxInitDate)).not.toThrow()
    expect(Number.isNaN(Date.parse(body.nxInitDate))).toBe(false)
  })

  it('rejects a non-URL cloudUrl', async () => {
    await expect(rotateExecutor({ cloudUrl: 'not-a-url' }, { root: workspace })).rejects.toThrow(
      /absolute URL/,
    )
    expect(state.fetchCalls).toHaveLength(0)
  })

  it('rejects a non-https cloudUrl', async () => {
    await expect(
      rotateExecutor({ cloudUrl: 'http://nx-cloud.example.com' }, { root: workspace }),
    ).rejects.toThrow(/https/)
    expect(state.fetchCalls).toHaveLength(0)
  })

  it('keeps a configured cloudUrl path prefix', async () => {
    await rotateExecutor({ cloudUrl: 'https://proxy.example.com/nx/' }, { root: workspace })

    expect(state.fetchCalls[0]?.url).toBe(
      'https://proxy.example.com/nx/nx-cloud/v2/create-org-and-workspace',
    )
  })

  it('throws on a malformed v2 body (missing nxCloudId)', async () => {
    state.fetchResponse = { status: 200, body: { url: 'https://cloud.nx.app/connect/x' } }

    await expect(rotateExecutor({}, { root: workspace })).rejects.toThrow(/nxCloudId/)
  })

  it('throws on a null v2 body', async () => {
    state.fetchResponse = { status: 200, body: null }

    await expect(rotateExecutor({}, { root: workspace })).rejects.toThrow(/nxCloudId/)
  })

  it('throws on a malformed v1 body (missing token)', async () => {
    state.fetchResponse = (url: string) =>
      url.includes('/v2/')
        ? { status: 404, body: {} }
        : { status: 200, body: { url: 'https://cloud.nx.app/connect/x' } }

    await expect(rotateExecutor({}, { root: workspace })).rejects.toThrow(/token/)
  })

  it('falls back to v1 when v2 returns 404 with a message body', async () => {
    state.fetchResponse = (url: string) =>
      url.includes('/v2/')
        ? { status: 404, body: { message: 'unknown route' } }
        : { status: 200, body: { token: 'v1-tok', url: 'https://cloud.nx.app/connect/v1' } }

    const result = await rotateExecutor({}, { root: workspace })

    expect(result.success).toBe(true)
    expect(state.fetchCalls[1]?.url).toBe('https://cloud.nx.app/nx-cloud/create-org-and-workspace')
  })

  it('masks a short previous binding fully', async () => {
    rmSync(workspace, { force: true, recursive: true })
    workspace = makeWorkspace({ nxCloudId: 'ab' })

    const result = await rotateExecutor({}, { root: workspace })

    expect(result.previousBinding).toBe('***')
  })

  it('preserves nx.json formatting on write (minimal diff)', async () => {
    rmSync(workspace, { force: true, recursive: true })
    const root = mkdtempSync(join(tmpdir(), 'nx-cloud-rotate-'))
    writeFileSync(
      join(root, 'nx.json'),
      '{\n  "$schema": "./node_modules/nx/schemas/nx-schema.json",\n  "nxCloudId": "ws_old",\n  "plugins": [\n    {\n      "plugin": "@nx/vitest",\n      "exclude": ["**/*"]\n    }\n  ]\n}\n',
    )
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'my-workspace' }))
    workspace = root

    await rotateExecutor({}, { root: workspace })

    const text = readFileSync(join(workspace, 'nx.json'), 'utf8')
    expect(text).toBe(
      '{\n  "$schema": "./node_modules/nx/schemas/nx-schema.json",\n  "nxCloudId": "ws_new123",\n  "plugins": [\n    {\n      "plugin": "@nx/vitest",\n      "exclude": ["**/*"]\n    }\n  ]\n}\n',
    )
  })

  it('keeps comments in nx.json when inserting a new binding', async () => {
    rmSync(workspace, { force: true, recursive: true })
    const root = mkdtempSync(join(tmpdir(), 'nx-cloud-rotate-'))
    writeFileSync(
      join(root, 'nx.json'),
      '{\n  // workspace config\n  "defaultBase": "main",\n  "a": ["x"]\n}\n',
    )
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'my-workspace' }))
    workspace = root

    await rotateExecutor({}, { root: workspace })

    expect(readFileSync(join(workspace, 'nx.json'), 'utf8')).toBe(
      '{\n  "nxCloudId": "ws_new123",\n  // workspace config\n  "defaultBase": "main",\n  "a": ["x"]\n}\n',
    )
  })

  it('detects indent past a leading block comment', async () => {
    rmSync(workspace, { force: true, recursive: true })
    const root = mkdtempSync(join(tmpdir(), 'nx-cloud-rotate-'))
    writeFileSync(
      join(root, 'nx.json'),
      '{\n  /*\n   * Nx workspace\n   */\n  "defaultBase": "main"\n}\n',
    )
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'my-workspace' }))
    workspace = root

    await rotateExecutor({}, { root: workspace })

    expect(readFileSync(join(workspace, 'nx.json'), 'utf8')).toBe(
      '{\n  "nxCloudId": "ws_new123",\n  /*\n   * Nx workspace\n   */\n  "defaultBase": "main"\n}\n',
    )
  })

  it('inserts with CRLF line endings when the file uses them', async () => {
    rmSync(workspace, { force: true, recursive: true })
    const root = mkdtempSync(join(tmpdir(), 'nx-cloud-rotate-'))
    writeFileSync(
      join(root, 'nx.json'),
      '{\r\n  "$schema": "x",\r\n  "defaultBase": "main"\r\n}\r\n',
    )
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'my-workspace' }))
    workspace = root

    await rotateExecutor({}, { root: workspace })

    expect(readFileSync(join(workspace, 'nx.json'), 'utf8')).toBe(
      '{\r\n  "$schema": "x",\r\n  "nxCloudId": "ws_new123",\r\n  "defaultBase": "main"\r\n}\r\n',
    )
  })
})
