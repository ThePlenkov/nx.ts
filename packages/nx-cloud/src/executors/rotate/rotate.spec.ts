import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state: {
  fetchCalls: { url: string; init: { method?: string; body?: string } | undefined }[]
  fetchResponse:
    | { status: number; body: unknown }
    | ((url: string) => { status: number; body: unknown })
  spawnCalls: { command: string; args: string[] }[]
  spawnResponse: { status: number; stdout: string; stderr: string }
} = {
  fetchCalls: [],
  fetchResponse: { status: 200, body: {} },
  spawnCalls: [],
  spawnResponse: { status: 0, stdout: '', stderr: '' },
}

vi.mock('node:child_process', () => ({
  spawnSync: (command: string, args: string[] = []) => {
    state.spawnCalls.push({ args, command })
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
globalThis.fetch = fetchMock as typeof fetch

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
    expect(gitCall?.args.join(' ')).toContain('nx.json')
  })

  it('removes a stale nxCloudAccessToken when rebinding to nxCloudId', async () => {
    rmSync(workspace, { force: true, recursive: true })
    workspace = makeWorkspace({ nxCloudAccessToken: 'old-token-123' })

    const result = await rotateExecutor({}, { root: workspace })

    expect(result.previousBinding).toBe('old-token-123')
    const nxJson = readJson(join(workspace, 'nx.json'))
    expect(nxJson.nxCloudId).toBe('ws_new123')
    expect(nxJson.nxCloudAccessToken).toBeUndefined()
  })

  it('reports the previous nxCloudId binding', async () => {
    rmSync(workspace, { force: true, recursive: true })
    workspace = makeWorkspace({ nxCloudId: 'ws_old999' })

    const result = await rotateExecutor({}, { root: workspace })

    expect(result.previousBinding).toBe('ws_old999')
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
})
