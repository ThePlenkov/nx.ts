import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { applyEdits, modify, parse, type ParseError, printParseErrorCode } from 'jsonc-parser'

export interface NxCloudRotateOptions {
  /** Name sent to create-org-and-workspace. Default: root package.json `name`. */
  workspaceName?: string
  /** Nx Cloud instance URL. Default: NX_CLOUD_API/NRWL_API env or https://cloud.nx.app. */
  cloudUrl?: string
  /** InstallationSource tag sent with the request. Default: "nx-devkit-nx-cloud". */
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
  const raw = option ?? process.env.NX_CLOUD_API ?? process.env.NRWL_API ?? DEFAULT_CLOUD_URL
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error(`Invalid cloudUrl "${raw}": expected an absolute URL.`)
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`Invalid cloudUrl "${raw}": only https:// URLs are allowed.`)
  }
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`
}

function readTextFile(path: string): string {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is join(context.root, ...) under the trusted Nx workspace root
    return readFileSync(path, 'utf8')
  } catch (error) {
    throw new Error(`Cannot read ${path}: ${(error as Error).message}`, { cause: error })
  }
}

function parseJsonObject(text: string, path: string): Record<string, unknown> {
  const errors: ParseError[] = []
  const data = parse(text, errors, { allowTrailingComma: true }) as unknown
  if (errors.length > 0) {
    const { error, offset } = errors[0]!
    throw new Error(`Cannot parse ${path}: ${printParseErrorCode(error)} at offset ${offset}`)
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error(`Cannot parse ${path}: expected a JSON object`)
  }
  return data as Record<string, unknown>
}

function readJson(path: string): Record<string, unknown> {
  return parseJsonObject(readTextFile(path), path)
}

function detectFormatting(text: string): {
  formattingOptions: { eol: string; insertSpaces: boolean; tabSize: number }
  getInsertionIndex: (properties: string[]) => number
} {
  const match = /\n([ \t]+)"/.exec(text)
  const indent = match?.[1] ?? '  '
  return {
    formattingOptions: {
      eol: text.includes('\r\n') ? '\r\n' : '\n',
      insertSpaces: !indent.startsWith('\t'),
      tabSize: indent.startsWith('\t') ? 1 : indent.length,
    },
    // Anchor inserts after "$schema" (or first): that sibling is a scalar,
    // So reserializing it does not expand compact arrays/objects elsewhere.
    getInsertionIndex: (properties: string[]) => properties.indexOf('$schema') + 1,
  }
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
      { cwd: root, encoding: 'utf8', timeout: 30_000 },
    )
    if (result.status === 0) {
      const oldest = result.stdout
        .split('\n')
        .map((line) => line.trim())
        .findLast(Boolean)
      if (oldest) {
        return new Date(oldest).toISOString()
      }
    }
  } catch {
    // Not a git repo — fall through to current time.
  }
  return new Date().toISOString()
}

const CLOUD_API_PATHS = [
  '/nx-cloud/v2/create-org-and-workspace',
  '/nx-cloud/create-org-and-workspace',
] as const

interface OrgRequest {
  /** Validated https:// origin — anchors the endpoint allowlist below. */
  cloudUrl: string
  url: string
  payload: { installationSource: string; nxInitDate: string; workspaceName: string }
}

async function postOrgAndWorkspace({
  cloudUrl,
  url,
  payload,
}: OrgRequest): Promise<{ status: number; data: Record<string, unknown> }> {
  const approvedEndpoints = CLOUD_API_PATHS.map((path) => `${cloudUrl}${path}`)
  let response: Response
  if (approvedEndpoints.includes(url)) {
    try {
      response = await fetch(url, {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      })
    } catch (error) {
      throw new Error(`Nx Cloud request to ${url} failed: ${(error as Error).message}`, {
        cause: error,
      })
    }
  } else {
    throw new Error(`Refusing to POST to unapproved Nx Cloud endpoint: ${url}`)
  }
  const parsed = (await response.json().catch(() => ({}))) as unknown
  const data =
    typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
  return { data, status: response.status }
}

function maskBinding(value: string): string {
  return value.length <= 4 ? '***' : `${value.slice(0, 4)}…`
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
  const { data, status } = await postOrgAndWorkspace({
    cloudUrl: resolved.cloudUrl,
    url: `${resolved.cloudUrl}${CLOUD_API_PATHS[0]}`,
    payload: {
      installationSource: resolved.installationSource,
      nxInitDate,
      workspaceName: resolved.workspaceName,
    },
  })
  if (status === 404) {
    return null
  }
  assertNoApiError(status, data)
  if (typeof data.nxCloudId !== 'string' || !data.nxCloudId) {
    throw new Error(`Malformed response from ${resolved.cloudUrl}: missing nxCloudId.`)
  }
  if (typeof data.url !== 'string' || !data.url) {
    throw new Error(`Malformed response from ${resolved.cloudUrl}: missing url.`)
  }
  return { nxCloudId: data.nxCloudId, url: data.url }
}

async function createNxCloudWorkspaceV1(
  resolved: ResolvedOptions,
  nxInitDate: string,
): Promise<{ token: string; url: string }> {
  const { data, status } = await postOrgAndWorkspace({
    cloudUrl: resolved.cloudUrl,
    url: `${resolved.cloudUrl}${CLOUD_API_PATHS[1]}`,
    payload: {
      installationSource: resolved.installationSource,
      nxInitDate,
      workspaceName: resolved.workspaceName,
    },
  })
  assertNoApiError(status, data)
  if (typeof data.token !== 'string' || !data.token) {
    throw new Error(`Malformed response from ${resolved.cloudUrl}: missing token.`)
  }
  if (typeof data.url !== 'string' || !data.url) {
    throw new Error(`Malformed response from ${resolved.cloudUrl}: missing url.`)
  }
  return { token: data.token, url: data.url }
}

export async function rotateExecutor(
  options: NxCloudRotateOptions,
  context: { root: string },
): Promise<RotateResult> {
  const resolved = resolveOptions(options, context.root)
  const nxJsonPath = join(context.root, 'nx.json')
  const nxJsonText = readTextFile(nxJsonPath)
  const nxJson = parseJsonObject(nxJsonText, nxJsonPath)
  const binding = nxJson.nxCloudId ?? nxJson.nxCloudAccessToken
  let previousBinding: string | undefined
  if (typeof binding === 'string') {
    previousBinding = binding
  } else if (binding != null) {
    previousBinding = String(binding)
  }

  const nxInitDate = getNxInitDate(context.root)

  const v2 = await createNxCloudWorkspaceV2(resolved, nxInitDate)
  const v1 = v2 === null ? await createNxCloudWorkspaceV1(resolved, nxInitDate) : null

  const url = v2?.url ?? v1?.url

  if (!resolved.dryRun) {
    const formatting = detectFormatting(nxJsonText)
    let updated = nxJsonText
    const set = (key: string, value: unknown) => {
      updated = applyEdits(updated, modify(updated, [key], value, formatting))
    }
    if (resolved.cloudUrl !== DEFAULT_CLOUD_URL) {
      set('nxCloudUrl', resolved.cloudUrl)
    } else {
      set('nxCloudUrl', undefined)
    }
    if (v2) {
      set('nxCloudId', v2.nxCloudId)
      set('nxCloudAccessToken', undefined)
    } else if (v1) {
      set('nxCloudAccessToken', v1.token)
      set('nxCloudId', undefined)
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- nxJsonPath is join(context.root, 'nx.json') under the trusted Nx workspace root
    writeFileSync(nxJsonPath, updated, 'utf8')
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
    console.log(`Previous binding: ${maskBinding(previousBinding)}`)
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
    ...(previousBinding ? { previousBinding: maskBinding(previousBinding) } : {}),
  }
}

export default rotateExecutor
