/* eslint-disable one-var, capitalized-comments, node/no-sync -- sync executor by design; repo style is enforced by oxlint+biome */
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

/** Release execution mode. Default: "full". */
export type ReleaseMode = 'full' | 'bump' | 'publish'

export interface NxReleasePublishOptions {
  /** npm package name to publish. Default: derived from package.json `name`. */
  packageName?: string
  /** Path to the package directory containing package.json. Default: project root. */
  packagePath?: string
  /** Version to release (x.y.z, or patch|minor|major vs npm latest). Default: "patch". */
  version?: string
  /**
   * Execution mode:
   * - `full` (default): publish → bump commit + tag → push branch + tag → GitHub Release.
   * - `bump`: compute next version, commit it on `release/v<x.y.z>`, push the branch, open a PR. No publish/tag.
   * - `publish`: take the version already in package.json, publish, tag HEAD, push only the tag, create the release. No commit, no branch push.
   */
  mode?: ReleaseMode
  /** If true, do not publish, tag, push, or create a release. Default: false. */
  dryRun?: boolean
  /** npm registry URL. Default: https://registry.npmjs.org/. */
  registry?: string
  /** Branch to push the bump commit to / target the release PR at. Default: "main". */
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
  prCreated: boolean
  skipped: string[]
}

const DEFAULT_REGISTRY = 'https://registry.npmjs.org/'
const DEFAULT_BRANCH = 'main'
const SEMVER_RE = /^\d+\.\d+\.\d+(-[\dA-Za-z.-]+)?$/
const NPM_TIMEOUT_MS = 120_000

interface ResolvedOptions {
  packageName: string
  packagePath: string
  version: string
  mode: ReleaseMode
  dryRun: boolean
  registry: string
  branch: string
  generateNotes: boolean
  provenance: boolean
}

interface ReleaseState {
  alreadyPublished: boolean
  alreadyTagged: boolean
  alreadyReleased: boolean
}

function readPackageJson(packagePath: string): { name: string; version: string } {
  const pkgPath = `${packagePath}/package.json`
  if (!existsSync(pkgPath)) {
    throw new Error(`No package.json found at ${pkgPath}`)
  }
  let text: string
  try {
    text = readFileSync(pkgPath, 'utf-8')
  } catch (error) {
    throw new Error(`Cannot read ${pkgPath}: ${(error as Error).message}`, {
      cause: error,
    })
  }
  let raw: { name?: string; version?: string }
  try {
    raw = JSON.parse(text)
  } catch (error) {
    throw new Error(`Invalid JSON in ${pkgPath}: ${(error as Error).message}`, {
      cause: error,
    })
  }
  if (!raw.name) {
    throw new Error(`package.json at ${pkgPath} has no "name" field`)
  }
  return { name: raw.name, version: raw.version ?? '0.0.0' }
}

function exec(
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

function execOrThrow(
  cmd: string,
  args: string[],
  opts: { cwd?: string; timeout?: number } = {},
): { stdout: string; stderr: string } {
  const result = exec(cmd, args, opts)
  if (!result.ok) {
    throw new Error(`${cmd} ${args.join(' ')} failed: ${result.stderr}`)
  }
  return { stdout: result.stdout, stderr: result.stderr }
}

function npmViewVersion(packageName: string, registry: string): string | null {
  const result = exec('npm', ['view', packageName, 'version', '--registry', registry])
  return result.ok && result.stdout ? result.stdout : null
}

function gitRemoteTagSha(tag: string): string | null {
  const result = exec('git', ['ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/${tag}`])
  if (!result.ok) return null
  const lines = result.stdout.split('\n')
  // Annotated tags may also emit a peeled "<sha>\trefs/tags/<tag>^{}" line —
  // that sha is the commit, which is what tag equality compares against.
  const ref =
    lines.find((l) => l.endsWith(`\trefs/tags/${tag}^{}`)) ??
    lines.find((l) => l.endsWith(`\trefs/tags/${tag}`))
  return ref?.split('\t')[0] || null
}

// Fetch the tag and inspect its commit's package.json — a reusable tag must
// mark a release commit, one carrying this exact version. Covers annotated
// tags (whose ls-remote sha is the tag object) and release commits the branch
// tip has since moved past. ":./" resolves against cwd, so absolute
// packagePath values work too.
function tagCarriesVersion(packagePath: string, tag: string, version: string): boolean {
  const fetched = exec('git', ['fetch', '--depth=1', 'origin', `refs/tags/${tag}`])
  if (!fetched.ok) return false
  const shown = exec('git', ['show', 'FETCH_HEAD:./package.json'], { cwd: packagePath })
  if (!shown.ok) return false
  try {
    return (JSON.parse(shown.stdout) as { version?: string }).version === version
  } catch {
    return false
  }
}

// An existing remote tag on the wrong commit would suppress tag creation and
// attach the GitHub Release to the wrong source — verify the target before
// skipping. Publish mode intends to tag HEAD (the merged release commit), so
// an sha match on HEAD is the fast path; both modes fall back to the content
// check. Bump mode never tags.
function assertTagTarget(
  resolved: ResolvedOptions,
  tag: string,
  remoteTagSha: string,
  nextVersion: string,
): void {
  if (resolved.mode === 'bump') return
  const match =
    resolved.mode === 'full'
      ? tagCarriesVersion(resolved.packagePath, tag, nextVersion)
      : remoteTagSha === execOrThrow('git', ['rev-parse', 'HEAD']).stdout ||
        tagCarriesVersion(resolved.packagePath, tag, nextVersion)
  if (!match) {
    throw new Error(
      `Remote tag ${tag} points at ${remoteTagSha.slice(0, 12)} — refusing to attach the ${nextVersion} release to a stale tag`,
    )
  }
}

function ghReleaseExists(tag: string): boolean {
  return exec('gh', ['release', 'view', tag]).ok
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
  // npm ahead of local → reuse npm version (previous run published but didn't sync)
  if (npmVersion && compareSemver(npmVersion, localVersion) > 0) {
    return npmVersion
  }
  return bumpSemver(localVersion, requested as 'patch' | 'minor' | 'major')
}

function compareSemver(a: string, b: string): number {
  const [aMain = '0', aPre] = a.split('-', 2)
  const [bMain = '0', bPre] = b.split('-', 2)
  const pa = aMain.split('.').map(Number)
  const pb = bMain.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da > db) return 1
    if (da < db) return -1
  }
  // Prerelease: a version with prerelease is lower than one without
  if (aPre === bPre) return 0
  if (!aPre) return 1
  if (!bPre) return -1
  // Numeric-aware compare so beta.10 > beta.2 (semver identifier order)
  return aPre.localeCompare(bPre, 'en', { numeric: true }) < 0 ? -1 : 1
}

function bumpSemver(base: string, kind: 'patch' | 'minor' | 'major'): string {
  if (!SEMVER_RE.test(base)) {
    throw new Error(`Cannot bump invalid version: ${base}`)
  }
  const [main, pre] = base.split('-', 2)
  const [maj, min, pat] = (main ?? '0.0.0').split('.').map(Number)
  if (kind === 'major') return `${(maj ?? 0) + 1}.0.0`
  if (kind === 'minor') return `${maj ?? 0}.${(min ?? 0) + 1}.0`
  // patch on a prerelease graduates it to stable (1.0.0-beta.2 → 1.0.0)
  return `${maj ?? 0}.${min ?? 0}.${(pat ?? 0) + (pre ? 0 : 1)}`
}

function gitConfigBot(): void {
  execOrThrow('git', ['config', 'user.name', 'github-actions[bot]'])
  execOrThrow('git', [
    'config',
    'user.email',
    '41898282+github-actions[bot]@users.noreply.github.com',
  ])
}

function stampVersion(packagePath: string, version: string): void {
  execOrThrow('npm', ['version', version, '--no-git-tag-version', '--allow-same-version'], {
    cwd: packagePath,
  })
}

function commitBumpFiles(packagePath: string, version: string): void {
  execOrThrow('git', ['add', `${packagePath}/package.json`])
  const lockfiles = ['package-lock.json']
  if (packagePath !== '.') lockfiles.push(`${packagePath}/package-lock.json`)
  for (const lockfile of lockfiles) {
    if (existsSync(lockfile)) execOrThrow('git', ['add', lockfile])
  }
  const diffResult = exec('git', ['diff', '--cached', '--quiet'])
  if (!diffResult.ok) {
    execOrThrow('git', ['commit', '-m', `chore: release ${version}`])
  }
}

function assertCleanTree(): void {
  // Any non-ignored untracked file blocks: npm publish ships whatever is on
  // disk, so an uncommitted source file must not slip past. Build artifacts
  // (npm pack .tgz, dist/) belong in the consumer's .gitignore — porcelain
  // never lists ignored files.
  const dirty = exec('git', ['status', '--porcelain'])
  if (dirty.ok && dirty.stdout) {
    throw new Error('Working tree is dirty — commit or stash changes before releasing')
  }
}

function createReleasePr(
  resolved: ResolvedOptions,
  releaseBranch: string,
  nextVersion: string,
  result: PublishResult,
): void {
  const prResult = exec('gh', [
    'pr',
    'create',
    '--title',
    `chore: release v${nextVersion}`,
    '--body',
    `Automated release PR for \`${resolved.packageName}@${nextVersion}\`. Merge to publish to npm and create the \`v${nextVersion}\` release.`,
    '--head',
    releaseBranch,
    '--base',
    resolved.branch,
  ])
  if (prResult.ok) {
    result.prCreated = true
  } else if (prResult.stderr.includes('already exists')) {
    result.skipped.push('release PR already exists')
  } else {
    throw new Error(`gh pr create failed: ${prResult.stderr}`)
  }
}

// Bump mode: cut release/v<x.y.z>, commit the stamp, push the branch, open a PR — no publish/tag
function runBumpMode(
  resolved: ResolvedOptions,
  nextVersion: string,
  result: PublishResult,
): PublishResult {
  const releaseBranch = `release/v${nextVersion}`
  const branchExists = exec('git', [
    'ls-remote',
    '--exit-code',
    '--heads',
    'origin',
    `refs/heads/${releaseBranch}`,
  ]).ok
  if (branchExists) {
    // A previous run may have pushed the branch but died before gh pr create — repair it
    createReleasePr(resolved, releaseBranch, nextVersion, result)
    result.success = true
    if (!result.prCreated) result.skipped.push('release branch already exists')
    return result
  }
  assertCleanTree()
  gitConfigBot()
  execOrThrow('git', ['fetch', 'origin', resolved.branch])
  execOrThrow('git', ['checkout', '-B', releaseBranch, `origin/${resolved.branch}`])
  stampVersion(resolved.packagePath, nextVersion)
  commitBumpFiles(resolved.packagePath, nextVersion)
  execOrThrow('git', ['push', 'origin', releaseBranch])
  createReleasePr(resolved, releaseBranch, nextVersion, result)
  result.success = true
  return result
}

function publishToNpm(
  resolved: ResolvedOptions,
  result: PublishResult,
  alreadyPublished: boolean,
): void {
  if (alreadyPublished) {
    result.skipped.push('already published')
    return
  }
  const publishArgs = ['publish', '--access', 'public']
  if (resolved.provenance) publishArgs.push('--provenance')
  publishArgs.push('--registry', resolved.registry)
  const publishResult = exec('npm', publishArgs, {
    cwd: resolved.packagePath,
    timeout: 180_000,
  })
  if (!publishResult.ok) {
    throw new Error(`npm publish failed: ${publishResult.stderr}`)
  }
  result.published = true
}

// Full mode: commit the bump and land it on origin/<branch> BEFORE publishing —
// the published tarball must match the pushed commit, and the tag is created
// after the rebase so it cannot point at a pre-rebase commit.
function syncFullBranch(resolved: ResolvedOptions, nextVersion: string): void {
  gitConfigBot()
  commitBumpFiles(resolved.packagePath, nextVersion)
  execOrThrow('git', ['fetch', 'origin', resolved.branch])
  const rebaseResult = exec('git', ['rebase', `origin/${resolved.branch}`])
  if (!rebaseResult.ok) {
    throw new Error(`Rebase failed: ${rebaseResult.stderr}`)
  }
  const pushResult = exec('git', ['push', 'origin', resolved.branch])
  if (!pushResult.ok) {
    throw new Error(`Push to ${resolved.branch} failed: ${pushResult.stderr}`)
  }
}

function tagAndPush(tag: string, result: PublishResult): void {
  execOrThrow('git', ['tag', tag])
  result.tagged = true
  const tagPushResult = exec('git', ['push', 'origin', tag])
  if (!tagPushResult.ok) {
    throw new Error(`Tag push failed: ${tagPushResult.stderr}`)
  }
}

function createGithubRelease(resolved: ResolvedOptions, tag: string, result: PublishResult): void {
  const releaseResult = exec('gh', [
    'release',
    'create',
    tag,
    '--title',
    tag,
    '--generate-notes',
    '--target',
    resolved.branch,
  ])
  if (releaseResult.ok) {
    result.releaseCreated = true
  } else {
    // Release creation failure is non-fatal — publish + tag succeeded
    result.skipped.push(`release creation failed: ${releaseResult.stderr}`)
  }
}

function resolveOptions(
  options: NxReleasePublishOptions,
  pkg: { name: string; version: string },
): ResolvedOptions {
  return {
    packageName: options.packageName ?? pkg.name,
    packagePath: options.packagePath ?? '.',
    version: options.version ?? 'patch',
    mode: options.mode ?? 'full',
    dryRun: options.dryRun ?? false,
    registry: options.registry ?? DEFAULT_REGISTRY,
    branch: options.branch ?? DEFAULT_BRANCH,
    generateNotes: options.generateNotes ?? true,
    provenance: options.provenance ?? true,
  }
}

function emptyResult(): PublishResult {
  return {
    success: false,
    version: '',
    published: false,
    tagged: false,
    releaseCreated: false,
    prCreated: false,
    skipped: [],
  }
}

function checkReleaseState(
  resolved: ResolvedOptions,
  tag: string,
  nextVersion: string,
): ReleaseState {
  // Query the exact version — npm latest may have moved past nextVersion
  const alreadyPublished =
    npmViewVersion(`${resolved.packageName}@${nextVersion}`, resolved.registry) === nextVersion
  const remoteTagSha = gitRemoteTagSha(tag)
  if (remoteTagSha) assertTagTarget(resolved, tag, remoteTagSha, nextVersion)
  const alreadyTagged = remoteTagSha !== null
  const alreadyReleased = alreadyTagged && ghReleaseExists(tag)
  return { alreadyPublished, alreadyTagged, alreadyReleased }
}

export async function publishExecutor(
  options: NxReleasePublishOptions = {},
): Promise<PublishResult> {
  const pkg = readPackageJson(options.packagePath ?? '.')
  const resolved = resolveOptions(options, pkg)
  const result = emptyResult()

  if (resolved.mode === 'publish' && (pkg.version === '0.0.0' || !SEMVER_RE.test(pkg.version))) {
    throw new Error(
      `publish mode requires a committed semver version in package.json (got "${pkg.version}")`,
    )
  }

  // Publish mode takes the committed package.json version
  const nextVersion =
    resolved.mode === 'publish'
      ? pkg.version
      : computeNextVersion(resolved.version, resolved.packageName, pkg.version, resolved.registry)
  result.version = nextVersion
  const tag = `v${nextVersion}`

  const { alreadyPublished, alreadyTagged, alreadyReleased } = checkReleaseState(
    resolved,
    tag,
    nextVersion,
  )

  if (alreadyPublished && alreadyTagged && alreadyReleased) {
    result.success = true
    result.skipped.push('already published, tagged, and released')
    return result
  }

  if (resolved.dryRun) {
    result.success = true
    result.skipped.push('dry run')
    return result
  }

  if (resolved.mode === 'bump') {
    return runBumpMode(resolved, nextVersion, result)
  }

  return runPublishPath(resolved, pkg, nextVersion, tag, result, {
    alreadyPublished,
    alreadyTagged,
    alreadyReleased,
  })
}

// Publish/full path: clean tree → stamp (full) → land bump commit (full) →
// publish → tag → GitHub Release
function runPublishPath(
  resolved: ResolvedOptions,
  pkg: { name: string; version: string },
  nextVersion: string,
  tag: string,
  result: PublishResult,
  state: ReleaseState,
): PublishResult {
  // Publish ships the working tree — refuse to publish uncommitted changes
  assertCleanTree()

  // Stamp package.json version (full mode only; publish mode takes it as committed).
  // Also stamp when npm is ahead — repair still needs the bump commit on the branch.
  if (resolved.mode === 'full' && pkg.version !== nextVersion) {
    stampVersion(resolved.packagePath, nextVersion)
  }

  // Full mode lands the bump commit before publishing so npm, branch, and tag
  // all represent the same commit
  if (resolved.mode === 'full' && !state.alreadyTagged) {
    syncFullBranch(resolved, nextVersion)
  }

  publishToNpm(resolved, result, state.alreadyPublished)
  if (!state.alreadyTagged) {
    tagAndPush(tag, result)
  } else {
    result.skipped.push('already tagged')
  }

  if (resolved.generateNotes && !state.alreadyReleased) {
    createGithubRelease(resolved, tag, result)
  }

  result.success = true
  return result
}

export default publishExecutor
