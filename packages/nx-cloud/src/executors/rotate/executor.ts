import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface NxCloudRotateOptions {
  /** Name sent to create-org-and-workspace. Default: root package.json `name`. */
  workspaceName?: string
  /** Nx Cloud instance URL. Default: NX_CLOUD_API/NRWL_API env or https://cloud.nx.app. */
  cloudUrl?: string
  /** installationSource tag sent with the request. Default: "nx-devkit-nx-cloud". */
  installationSource?: string
  /** Call the API but do not rewrite nx.json. Default: false. */
  dryRun?: boolean
}

export interface RotateResult {
  success: boolean
  nxCloudId?: string
  token?: string
  url?: string
  previousBinding?: string
}

const DEFAULT_CLOUD_URL = 'https://cloud.nx.app'
const DEFAULT_INSTALLATION_SOURCE = 'nx-devkit-nx-cloud'

interface ResolvedOptions {
  cloudUrl: string
  dryRun: boolean
  installationSource: string
  workspaceName: string
}

function resolveCloudUrl(option: string | undefined): string {
  return option ?? process.env.NX_CLOUD_API ?? process.env.NRWL_API ?? DEFAULT_CLOUD_URL
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
}

function resolveOptions(options: NxCloudRotateOptions, root: string): ResolvedOptions {
  let packageName = 'my-workspace'
  try {
    const pkg = readJson(join(root, 'package.json'))
    if (typeof pkg.name === 'string') {
      packageName = pkg.name
    }
  } catch {
    // No root package.json — fall back to the default workspace name.
  }
  return {
    cloudUrl: resolveCloudUrl(options.cloudUrl),
    dryRun: options.dryRun ?? false,
    installationSource: options.installationSource ?? DEFAULT_INSTALLATION_SOURCE,
    workspaceName: options.workspaceName ?? packageName,
  }
}

function getNxInitDate(root: string): string {
  try {
    const result = spawnSync(
      'git',
      ['log', '--diff-filter=A', '--follow', '--format=%aI', '--', 'nx.json'],
      { cwd: root, encoding: 'utf8' },
    )
    if (result.status === 0) {
      const oldest = (result.stdout ?? '')
        .toString()
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .pop()
      if (oldest) {
        return new Date(oldest).toISOString()
      }
    }
  } catch {
    // Not a git repo — fall through to current time.
  }
  return new Date().toISOString()
}

async function postOrgAndWorkspace(
  url: string,
  payload: { installationSource: string; nxInitDate: string; workspaceName: string },
): Promise<{ status: number; data: Record<string, unknown> }> {
  const response = await fetch(url, {
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>
  return { data, status: response.status }
}

function assertNoApiError(status: number, data: Record<string, unknown>): void {
  if (typeof data.message === 'string' && data.message) {
    throw new Error(data.message)
  }
  if (status >= 400) {
    throw new Error(`create-org-and-workspace failed (HTTP ${status})`)
  }
}

async function createNxCloudWorkspaceV2(
  resolved: ResolvedOptions,
  nxInitDate: string,
): Promise<{ nxCloudId: string; url: string } | null> {
  const { data, status } = await postOrgAndWorkspace(
    `${resolved.cloudUrl}/nx-cloud/v2/create-org-and-workspace`,
    {
      installationSource: resolved.installationSource,
      nxInitDate,
      workspaceName: resolved.workspaceName,
    },
  )
  if (status === 404) {
    return null
  }
  assertNoApiError(status, data)
  return { nxCloudId: String(data.nxCloudId), url: String(data.url) }
}

async function createNxCloudWorkspaceV1(
  resolved: ResolvedOptions,
  nxInitDate: string,
): Promise<{ token: string; url: string }> {
  const { data, status } = await postOrgAndWorkspace(
    `${resolved.cloudUrl}/nx-cloud/create-org-and-workspace`,
    {
      installationSource: resolved.installationSource,
      nxInitDate,
      workspaceName: resolved.workspaceName,
    },
  )
  assertNoApiError(status, data)
  return { token: String(data.token), url: String(data.url) }
}

export async function rotateExecutor(
  options: NxCloudRotateOptions,
  context: { root: string },
): Promise<RotateResult> {
  const resolved = resolveOptions(options, context.root)
  const nxJsonPath = join(context.root, 'nx.json')
  const nxJson = readJson(nxJsonPath)
  const previousBinding =
    (nxJson.nxCloudId as string | undefined) ?? (nxJson.nxCloudAccessToken as string | undefined)

  const nxInitDate = getNxInitDate(context.root)

  const v2 = await createNxCloudWorkspaceV2(resolved, nxInitDate)
  const v1 = v2 === null ? await createNxCloudWorkspaceV1(resolved, nxInitDate) : null

  const url = v2?.url ?? v1?.url

  if (!resolved.dryRun) {
    const overrideUrl = process.env.NX_CLOUD_API || process.env.NRWL_API
    if (overrideUrl) {
      nxJson.nxCloudUrl = overrideUrl
    }
    if (v2) {
      nxJson.nxCloudId = v2.nxCloudId
      delete nxJson.nxCloudAccessToken
    } else if (v1) {
      nxJson.nxCloudAccessToken = v1.token
      delete nxJson.nxCloudId
    }
    writeFileSync(nxJsonPath, `${JSON.stringify(nxJson, null, 2)}\n`, 'utf8')
  }

  if (v2) {
    console.log(`Created Nx Cloud workspace: ${v2.nxCloudId}`)
  } else if (v1) {
    console.log('Created Nx Cloud workspace (v1 token written to nx.json)')
  }
  if (url) {
    console.log(`Onboarding URL: ${url}`)
  }
  if (previousBinding) {
    console.log(`Previous binding: ${previousBinding}`)
    console.log(
      'Note: Nx Cloud has no public API to delete the old organization — ' +
        'remove it manually at https://cloud.nx.app (organization settings).',
    )
  }
  if (resolved.dryRun) {
    console.log('dryRun: nx.json left unchanged')
  } else {
    console.log('nx.json updated — commit it to point CI at the new organization')
  }

  return {
    success: true,
    ...(v2 ? { nxCloudId: v2.nxCloudId } : {}),
    ...(v1 ? { token: v1.token } : {}),
    ...(url ? { url } : {}),
    ...(previousBinding ? { previousBinding } : {}),
  }
}

export default rotateExecutor
