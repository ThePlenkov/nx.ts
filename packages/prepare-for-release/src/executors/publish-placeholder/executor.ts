import { existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { glob } from 'tinyglobby'

export interface NxPrepareForReleaseOptions {
  /** Package scopes to check. Default: derived from packages/* names in the workspace. */
  scope?: string[]
  /** Npm dist-tag applied to the placeholder publish. Default: "placeholder". */
  placeholderTag?: string
  /** Version written into the temporary placeholder package.json. Default: "0.0.0". */
  placeholderVersion?: string
  /** Npm registry URL. Default: https://registry.npmjs.org/. */
  registry?: string
  /** If true, do not actually publish or pack; just report what would happen. Default: false. */
  dryRun?: boolean
  /** If true, run `npm trust github` for all packages including already-published (requires MFA). Default: false. */
  trust?: boolean
  /**
   * `owner/repo` slug used to build the `npm trust github` command.
   * Falls back to `NPM_TRUST_REPO` env var, then `GITHUB_REPOSITORY` env var.
   * Throws if none are set.
   */
  trustRepo?: string
}

export interface PublishPlaceholderResult {
  success: boolean
  published: string[]
  skipped: string[]
  trustCommands: string[]
}

const DEFAULT_REGISTRY = 'https://registry.npmjs.org/'
const DEFAULT_TAG = 'placeholder'
const DEFAULT_VERSION = '0.0.0'
const TRUST_REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const NPM_SUBPROCESS_TIMEOUT_MS = 120_000

interface ResolvedOptions {
  registry: string
  placeholderTag: string
  placeholderVersion: string
  dryRun: boolean
  trust: boolean
  trustRepo: string
  scope: string[] | undefined
}

function resolveOptions(options: NxPrepareForReleaseOptions): ResolvedOptions {
  return {
    dryRun: options.dryRun ?? false,
    placeholderTag: options.placeholderTag ?? DEFAULT_TAG,
    placeholderVersion: options.placeholderVersion ?? DEFAULT_VERSION,
    registry: options.registry ?? DEFAULT_REGISTRY,
    scope: options.scope,
    trust: options.trust ?? false,
    trustRepo: resolveTrustRepo(options.trustRepo),
  }
}

function resolveNpmCommand(): string {
  return 'npm'
}

function resolveTrustRepo(option: string | undefined): string {
  const raw =
    option ?? process.env.NPM_TRUST_REPO ?? process.env.GITHUB_REPOSITORY ?? 'nx-devkit/nx.ts'
  if (!TRUST_REPO_RE.test(raw)) {
    throw new Error(
      `Invalid trustRepo "${raw}": expected "owner/repo" slug (e.g. nx-devkit/nx.ts). ` +
        `Override via options.trustRepo or NPM_TRUST_REPO env var.`,
    )
  }
  return raw
}

function detectPackageManager(): 'npm' {
  return 'npm'
}

function viewArgs(pkgName: string, registry: string): string[] {
  return ['view', pkgName, 'version', '--registry', registry, '--json']
}

function packArgs(packDestination: string): string[] {
  return ['pack', '--pack-destination', packDestination]
}

function publishArgs(tarball: string, registry: string, tag: string): string[] {
  return ['publish', tarball, '--access', 'public', '--tag', tag, '--registry', registry]
}

function spawnWithTimeout(
  command: string,
  args: string[],
  options: { cwd?: string; encoding: BufferEncoding; stdio?: 'pipe' | 'inherit' },
): ReturnType<typeof spawnSync> {
  return spawnSync(command, args, {
    ...options,
    timeout: NPM_SUBPROCESS_TIMEOUT_MS,
  })
}

async function readPackageJson(pkgRoot: string): Promise<Record<string, unknown>> {
  const raw = await readFile(join(pkgRoot, 'package.json'), 'utf8')
  return JSON.parse(raw) as Record<string, unknown>
}

function readPackageJsonSafe(pkgJsonPath: string): Record<string, unknown> | null {
  let fileContent: string
  try {
    fileContent = readFileSync(pkgJsonPath, 'utf8')
  } catch (error) {
    // Filesystem errors (EACCES, ENOENT on the dir itself) bubble up so the
    // Executor fails loudly rather than silently dropping the workspace.
    if (error instanceof SyntaxError) {
      console.warn(`Skipping ${pkgJsonPath}: invalid JSON (${error.message})`)
      return null
    }
    throw error
  }
  try {
    return JSON.parse(fileContent) as Record<string, unknown>
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.warn(`Skipping ${pkgJsonPath}: invalid JSON (${error.message})`)
      return null
    }
    throw error
  }
}

function matchesScope(name: string, scope: string[] | undefined): boolean {
  if (!scope || scope.length === 0) {
    return true
  }
  return scope.some((s) => name.startsWith(s))
}

function isNotFoundStderr(stderr: string): boolean {
  return /\b(E404|404|not\s*found|ENOTFOUND_NOT_PUBLISHED)\b/i.test(stderr)
}

async function buildPlaceholderTarball(
  pkgRoot: string,
  pkgName: string,
  placeholderVersion: string,
  registry: string,
): Promise<{ tarballPath: string; tempDir: string }> {
  const tempDir = await mkdtemp(join(tmpdir(), 'nx-prepare-placeholder-'))
  const stagedPkgRoot = join(tempDir, pkgName)

  try {
    await mkdir(stagedPkgRoot, { recursive: true })

    const original = await readPackageJson(pkgRoot)
    // Minimal metadata-only placeholder. Do NOT spread `original`: lifecycle
    // Scripts (prepare/prepack/prepublishOnly) from the source package would
    // Run during `npm pack` and crash because the staged dir has no sources
    // Or node_modules.
    const placeholder = {
      author: original.author,
      bugs: original.bugs,
      description: `Placeholder for ${pkgName} published by @nx-devkit/prepare-for-release.`,
      homepage: original.homepage,
      license: typeof original.license === 'string' ? original.license : 'MIT',
      name: pkgName,
      publishConfig: {
        access: 'public',
        registry,
      },
      repository: original.repository,
      type: typeof original.type === 'string' ? original.type : undefined,
      version: placeholderVersion,
    }

    const placeholderJson = JSON.stringify(placeholder, null, 2)
    await writeFile(join(stagedPkgRoot, 'package.json'), placeholderJson, 'utf8')

    const npmCmd = resolveNpmCommand()
    const packResult = spawnWithTimeout(npmCmd, packArgs(tempDir), {
      cwd: stagedPkgRoot,
      encoding: 'utf8',
    })

    if (packResult.status !== 0) {
      throw new Error(
        `npm pack failed for ${pkgName} (exit ${packResult.status}): ${packResult.stderr ?? ''}`,
      )
    }

    const stdout = (packResult.stdout ?? '').toString().trim()
    const tarballName = stdout.split('\n').pop()?.trim()
    if (!tarballName) {
      throw new Error(`npm pack produced no tarball name for ${pkgName}`)
    }

    return { tarballPath: join(tempDir, tarballName), tempDir }
  } catch (error) {
    // Best-effort cleanup on any failure so the OS tempdir does not fill up
    // When `npm pack` errors out.
    await rm(tempDir, { force: true, recursive: true }).catch(() => undefined)
    throw error
  }
}

function isPublished(pkgName: string, registry: string): boolean {
  const npmCmd = resolveNpmCommand()
  const result = spawnWithTimeout(npmCmd, viewArgs(pkgName, registry), {
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    const stderr = (result.stderr ?? '').toString()
    if (isNotFoundStderr(stderr)) {
      return false
    }
    // Any other npm-view failure (network, auth, registry error) is a hard
    // Error so the executor fails loudly instead of silently republishing.
    throw new Error(
      `npm view failed for ${pkgName} (exit ${result.status}): ${stderr || '<no stderr>'}`,
    )
  }
  const stdout = (result.stdout ?? '').toString().trim()
  if (!stdout) {
    return false
  }
  try {
    const parsed = JSON.parse(stdout) as unknown
    if (typeof parsed === 'string') {
      return parsed.length > 0
    }
    if (parsed && typeof parsed === 'object' && 'version' in (parsed as Record<string, unknown>)) {
      return Boolean((parsed as { version?: unknown }).version)
    }
  } catch {
    return stdout.length > 0
  }
  return false
}

function trustCommandFor(pkgName: string, trustRepo: string, registry?: string): string {
  const base = `npm trust github ${pkgName} --file release.yml --repo ${trustRepo} --allow-publish --yes`
  return registry && registry !== DEFAULT_REGISTRY ? `${base} --registry ${registry}` : base
}

function trustArgs(pkgName: string, trustRepo: string, registry?: string): string[] {
  const args = [
    'trust',
    'github',
    pkgName,
    '--file',
    'release.yml',
    '--repo',
    trustRepo,
    '--allow-publish',
    '--yes',
  ]
  if (registry && registry !== DEFAULT_REGISTRY) {
    args.push('--registry', registry)
  }
  return args
}

function runTrustFor(pkgName: string, trustRepo: string, registry?: string): void {
  const npmCmd = resolveNpmCommand()
  const result = spawnWithTimeout(npmCmd, trustArgs(pkgName, trustRepo, registry), {
    encoding: 'utf8',
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    throw new Error(`npm trust github failed for ${pkgName} (exit ${result.status})`)
  }
  console.log(`  ✓ ${pkgName}`)
}

async function publishOnePackage(
  pkgRoot: string,
  name: string,
  resolved: ResolvedOptions,
): Promise<void> {
  const { tarballPath, tempDir } = await buildPlaceholderTarball(
    pkgRoot,
    name,
    resolved.placeholderVersion,
    resolved.registry,
  )
  try {
    const npmCmd = resolveNpmCommand()
    const publishResult = spawnWithTimeout(
      npmCmd,
      publishArgs(tarballPath, resolved.registry, resolved.placeholderTag),
      { encoding: 'utf8', stdio: 'inherit' },
    )
    if (publishResult.status !== 0) {
      throw new Error(`npm publish failed for ${name} (exit ${publishResult.status})`)
    }
  } finally {
    await rm(tempDir, { force: true, recursive: true }).catch(() => undefined)
  }
}

type PackageOutcome = 'published' | 'skipped' | 'ignored'

interface PackageAccumulators {
  published: string[]
  skipped: string[]
  trustCommands: string[]
}

async function processPackage(
  pkgJsonPath: string,
  resolved: ResolvedOptions,
  acc: PackageAccumulators,
): Promise<PackageOutcome> {
  const parsed = readPackageJsonSafe(pkgJsonPath)
  if (!parsed) {
    return 'ignored'
  }
  const name = typeof parsed.name === 'string' ? parsed.name : null
  if (!name) {
    return 'ignored'
  }
  if (!matchesScope(name, resolved.scope)) {
    return 'ignored'
  }

  if (isPublished(name, resolved.registry)) {
    acc.skipped.push(name)
    return 'skipped'
  }

  if (resolved.dryRun) {
    acc.published.push(name)
    acc.trustCommands.push(trustCommandFor(name, resolved.trustRepo, resolved.registry))
    return 'published'
  }

  const pkgRoot = dirname(pkgJsonPath)
  await publishOnePackage(pkgRoot, name, resolved)
  acc.published.push(name)
  acc.trustCommands.push(trustCommandFor(name, resolved.trustRepo, resolved.registry))
  return 'published'
}

export async function publishPlaceholderExecutor(
  options: NxPrepareForReleaseOptions,
  context: { root: string },
): Promise<PublishPlaceholderResult> {
  const resolved = resolveOptions(options)
  detectPackageManager()

  const pkgDirs = await glob(['packages/*/package.json'], {
    absolute: true,
    cwd: context.root,
    onlyFiles: true,
  })

  const acc: PackageAccumulators = { published: [], skipped: [], trustCommands: [] }
  for (const pkgJsonPath of pkgDirs) {
    await processPackage(pkgJsonPath, resolved, acc)
  }

  if (existsSync(join(context.root, 'scripts/trust-github.sh'))) {
    // Trust commands are also captured in scripts/trust-github.sh when present.
  }

  if (acc.published.length > 0) {
    console.log(`\nPublished: ${acc.published.join(', ')}`)
  }
  if (acc.skipped.length > 0) {
    console.log(`Skipped:   ${acc.skipped.join(', ')}`)
  }
  if (acc.trustCommands.length > 0 || (resolved.trust && acc.skipped.length > 0)) {
    if (resolved.trust && !resolved.dryRun) {
      const trustTargets = [...acc.published, ...acc.skipped]
      console.log(
        `\nConfiguring GitHub OIDC trusted publishing for ${trustTargets.length} package(s) (requires MFA)...\n`,
      )
      for (const pkgName of trustTargets) {
        try {
          runTrustFor(pkgName, resolved.trustRepo, resolved.registry)
        } catch (error) {
          if (error instanceof Error && /already.*trust|conflict|exists/i.test(error.message)) {
            console.log(`  ⊙ ${pkgName} (trust already configured)`)
            continue
          }
          throw error
        }
      }
    } else {
      console.log('\nRun these locally (requires MFA) to enable GitHub OIDC trusted publishing:\n')
      for (const cmd of acc.trustCommands) {
        console.log(`  ${cmd}`)
      }
      for (const pkgName of acc.skipped) {
        console.log(`  ${trustCommandFor(pkgName, resolved.trustRepo, resolved.registry)}`)
      }
    }
  }

  return { success: true, ...acc }
}

export default publishPlaceholderExecutor
