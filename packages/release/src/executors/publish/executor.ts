import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

export interface NxReleasePublishOptions {
  /** npm package name to publish. Default: derived from package.json `name`. */
  packageName?: string
  /** Path to the package directory containing package.json. Default: project root. */
  packagePath?: string
  /** Version to release (x.y.z, or patch|minor|major vs npm latest). Default: "patch". */
  version?: string
  /** If true, do not publish, tag, push, or create a release. Default: false. */
  dryRun?: boolean
  /** npm registry URL. Default: https://registry.npmjs.org/. */
  registry?: string
  /** Branch to push the bump commit to. Default: "main". */
  branch?: string
  /** If true, create a GitHub Release with auto-generated changelog. Default: true. */
  generateNotes?: boolean
  /** If true, publish with --provenance (npm OIDC). Default: true. */
  provenance?: boolean
}

export interface PublishResult {
  success: boolean
  version: string
  published: boolean
  tagged: boolean
  releaseCreated: boolean
  skipped: string[]
}

const DEFAULT_REGISTRY = 'https://registry.npmjs.org/'
const DEFAULT_BRANCH = 'main'
const SEMVER_RE = /^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$/
const NPM_TIMEOUT_MS = 120_000

interface ResolvedOptions {
  packageName: string
  packagePath: string
  version: string
  dryRun: boolean
  registry: string
  branch: string
  generateNotes: boolean
  provenance: boolean
}

function readPackageJson(packagePath: string): { name: string; version: string } {
  const pkgPath = `${packagePath}/package.json`
  if (!existsSync(pkgPath)) {
    throw new Error(`No package.json found at ${pkgPath}`)
  }
  const raw = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { name?: string; version?: string }
  if (!raw.name) {
    throw new Error(`package.json at ${pkgPath} has no "name" field`)
  }
  return { name: raw.name, version: raw.version ?? '0.0.0' }
}

function runSync(
  cmd: string,
  args: string[],
  opts: { cwd?: string; timeout?: number } = {},
): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync(cmd, args, {
    cwd: opts.cwd,
    timeout: opts.timeout ?? NPM_TIMEOUT_MS,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  if (result.signal === 'SIGTERM') {
    throw new Error(`Command timed out: ${cmd} ${args.join(' ')}`)
  }
  if (result.error) {
    throw new Error(`Command failed to spawn: ${cmd} ${args.join(' ')} — ${result.error.message}`)
  }
  return {
    ok: result.status === 0,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  }
}

function runSyncOrThrow(
  cmd: string,
  args: string[],
  opts: { cwd?: string; timeout?: number } = {},
): { stdout: string; stderr: string } {
  const result = runSync(cmd, args, opts)
  if (!result.ok) {
    throw new Error(`${cmd} ${args.join(' ')} failed: ${result.stderr}`)
  }
  return { stdout: result.stdout, stderr: result.stderr }
}

function npmViewVersion(packageName: string, registry: string): string | null {
  const result = runSync('npm', ['view', packageName, 'version', '--registry', registry])
  return result.ok && result.stdout ? result.stdout : null
}

function gitRemoteTagExists(tag: string): boolean {
  return runSync('git', ['ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/${tag}`]).ok
}

function ghReleaseExists(tag: string): boolean {
  return runSync('gh', ['release', 'view', tag]).ok
}

function computeNextVersion(
  requested: string,
  packageName: string,
  localVersion: string,
  registry: string,
): string {
  if (SEMVER_RE.test(requested)) {
    return requested
  }
  if (!['patch', 'minor', 'major'].includes(requested)) {
    throw new Error(`Invalid version: ${requested}. Use x.y.z or patch|minor|major.`)
  }
  const npmVersion = npmViewVersion(packageName, registry)
  if (npmVersion) {
    // npm ahead of local → reuse npm version (previous run published but didn't sync)
    const cmp = compareSemver(npmVersion, localVersion)
    if (cmp > 0) {
      return npmVersion
    }
  }
  const base =
    npmVersion && compareSemver(npmVersion, localVersion) >= 0 ? npmVersion : localVersion
  return bumpSemver(base, requested)
}

function compareSemver(a: string, b: string): number {
  const [aMain, aPre] = a.split('-', 2)
  const [bMain, bPre] = b.split('-', 2)
  const pa = aMain.split('.').map(Number)
  const pb = bMain.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da > db) return 1
    if (da < db) return -1
  }
  // Prerelease: a version with prerelease is lower than one without
  if (aPre && !bPre) return -1
  if (!aPre && bPre) return 1
  if (aPre && bPre) return aPre < bPre ? -1 : aPre > bPre ? 1 : 0
  return 0
}

function bumpSemver(base: string, kind: 'patch' | 'minor' | 'major'): string {
  const [maj, min, pat] = base.split('.').map(Number)
  if (kind === 'major') return `${(maj ?? 0) + 1}.0.0`
  if (kind === 'minor') return `${maj ?? 0}.${(min ?? 0) + 1}.0`
  return `${maj ?? 0}.${min ?? 0}.${(pat ?? 0) + 1}`
}

export async function publishExecutor(
  options: NxReleasePublishOptions = {},
): Promise<PublishResult> {
  const packagePath = options.packagePath ?? '.'
  const pkg = readPackageJson(packagePath)
  const resolved: ResolvedOptions = {
    packageName: options.packageName ?? pkg.name,
    packagePath,
    version: options.version ?? 'patch',
    dryRun: options.dryRun ?? false,
    registry: options.registry ?? DEFAULT_REGISTRY,
    branch: options.branch ?? DEFAULT_BRANCH,
    generateNotes: options.generateNotes ?? true,
    provenance: options.provenance ?? true,
  }

  const result: PublishResult = {
    success: false,
    version: '',
    published: false,
    tagged: false,
    releaseCreated: false,
    skipped: [],
  }

  // 1. Compute next version
  const nextVersion = computeNextVersion(
    resolved.version,
    resolved.packageName,
    pkg.version,
    resolved.registry,
  )
  result.version = nextVersion
  const tag = `v${nextVersion}`

  // 2. Check if already published
  const npmVersion = npmViewVersion(resolved.packageName, resolved.registry)
  const alreadyPublished = npmVersion === nextVersion
  const alreadyTagged = gitRemoteTagExists(tag)
  const alreadyReleased = alreadyTagged && ghReleaseExists(tag)

  if (alreadyPublished && alreadyTagged && alreadyReleased) {
    result.success = true
    result.skipped.push('already published, tagged, and released')
    return result
  }

  if (resolved.dryRun) {
    result.success = false
    result.skipped.push('dry run')
    return result
  }

  // 3. Stamp package.json version (skip if already published — no need to restamp)
  if (!alreadyPublished) {
    runSyncOrThrow(
      'npm',
      ['version', nextVersion, '--no-git-tag-version', '--allow-same-version'],
      { cwd: resolved.packagePath },
    )
  }

  // 4. Publish to npm (if not already published)
  if (!alreadyPublished) {
    const publishArgs = ['publish', '--access', 'public']
    if (resolved.provenance) publishArgs.push('--provenance')
    publishArgs.push('--registry', resolved.registry)
    const publishResult = runSync('npm', publishArgs, {
      cwd: resolved.packagePath,
      timeout: 180_000,
    })
    if (!publishResult.ok) {
      throw new Error(`npm publish failed: ${publishResult.stderr}`)
    }
    result.published = true
  } else {
    result.skipped.push('already published')
  }

  // 5. Commit bump + tag (if not already tagged)
  if (!alreadyTagged) {
    runSyncOrThrow('git', ['config', 'user.name', 'github-actions[bot]'])
    runSyncOrThrow('git', [
      'config',
      'user.email',
      '41898282+github-actions[bot]@users.noreply.github.com',
    ])
    runSyncOrThrow('git', ['add', `${resolved.packagePath}/package.json`])
    if (existsSync('package-lock.json')) {
      runSyncOrThrow('git', ['add', 'package-lock.json'])
    }
    const commitResult = runSync('git', ['diff', '--cached', '--quiet'])
    if (!commitResult.ok) {
      runSyncOrThrow('git', ['commit', '-m', `chore: release ${nextVersion}`])
    }
    runSyncOrThrow('git', ['tag', tag])
    result.tagged = true
  } else {
    result.skipped.push('already tagged')
  }

  // 6. Push to branch + tag (if not already tagged)
  if (!alreadyTagged) {
    runSyncOrThrow('git', ['fetch', 'origin', resolved.branch])
    const rebaseResult = runSync('git', ['rebase', `origin/${resolved.branch}`])
    if (!rebaseResult.ok) {
      throw new Error(`Rebase failed: ${rebaseResult.stderr}`)
    }
    const pushResult = runSync('git', ['push', 'origin', resolved.branch])
    if (!pushResult.ok) {
      throw new Error(`Push to ${resolved.branch} failed: ${pushResult.stderr}`)
    }
    const tagPushResult = runSync('git', ['push', 'origin', tag])
    if (!tagPushResult.ok) {
      throw new Error(`Tag push failed: ${tagPushResult.stderr}`)
    }
  }

  // 7. Create GitHub Release (if not already released)
  if (resolved.generateNotes && !alreadyReleased) {
    const releaseArgs = [
      'release',
      'create',
      tag,
      '--title',
      tag,
      '--generate-notes',
      '--target',
      resolved.branch,
    ]
    const releaseResult = runSync('gh', releaseArgs)
    if (!releaseResult.ok) {
      // Release creation failure is non-fatal — publish + tag succeeded
      result.skipped.push(`release creation failed: ${releaseResult.stderr}`)
    } else {
      result.releaseCreated = true
    }
  }

  result.success = true
  return result
}

export default publishExecutor
