import { createHash } from 'node:crypto'
import type { CreateNodesV2, ProjectConfiguration, TargetConfiguration } from '@nx/devkit'
import { shouldSkipPath } from '@nx-devkit/internal'

export interface NxDevkitSkillspectorOptions {
  /** Target name for the scan target. Default: "scan". */
  scanTargetName?: string
  /** Disable LLM-based analysis. Default: true. */
  noLlm?: boolean
  /** Emit GitHub annotations. Default: true. */
  annotations?: boolean
  /** Fail the target on HIGH/CRITICAL findings. Default: true. */
  failOnError?: boolean
  /** Binary to invoke for skillspector. Default: "skillspector". */
  skillspectorBin?: string
  /** SARIF output path prefix. When set, `.sarif` is replaced with `-${projectName}.sarif`. */
  sarif?: string
  /** Baseline file path for suppressing known findings. */
  baseline?: string
}

const SKILL_MD_GLOB = '**/SKILL.md'

/**
 * Compute injective project name: `${slug}-${hash12}` where slug is the
 * projectRoot with `/` replaced by `-`, and hash12 is the first 12 hex chars
 * of sha256(projectRoot). Same algorithm as @nx-devkit/skill.
 */
function computeProjectName(projectRoot: string): string {
  const slug = projectRoot.replace(/\//g, '-')
  const hash = createHash('sha256').update(projectRoot).digest('hex').slice(0, 12)
  return `${slug}-${hash}`
}

/**
 * Derive per-skill SARIF path: replace `.sarif` suffix with `-${projectName}.sarif`.
 */
function deriveSarifPath(sarifPrefix: string, projectName: string): string {
  if (sarifPrefix.endsWith('.sarif')) {
    return `${sarifPrefix.slice(0, -'.sarif'.length)}-${projectName}.sarif`
  }
  return `${sarifPrefix}-${projectName}.sarif`
}

function inferScanTarget(
  projectRoot: string,
  projectName: string,
  opts: NxDevkitSkillspectorOptions,
): TargetConfiguration {
  const noLlm = opts.noLlm ?? true
  const annotations = opts.annotations ?? true
  const failOnError = opts.failOnError ?? true
  const skillspectorBin = opts.skillspectorBin ?? 'skillspector'
  const sarifPath = opts.sarif ? deriveSarifPath(opts.sarif, projectName) : undefined

  const cache = !annotations && noLlm

  const inputs: string[] = ['{projectRoot}/**/*']
  if (opts.baseline) {
    inputs.push(opts.baseline)
  }
  inputs.push('^production')

  const outputs: string[] | undefined = !annotations
    ? [sarifPath ?? `{projectRoot}/scan-${projectName}.sarif`, `findings-${projectName}.json`]
    : undefined

  const options: Record<string, unknown> = {
    path: projectRoot,
    noLlm,
    annotations,
    failOnError,
    skillspectorBin,
  }
  if (sarifPath) {
    options.sarif = sarifPath
  }
  if (opts.baseline) {
    options.baseline = opts.baseline
  }

  return {
    executor: '@nx-devkit/skillspector:scan',
    cache,
    ...(outputs ? { outputs } : {}),
    inputs,
    options,
  }
}

export const createNodesV2: CreateNodesV2<NxDevkitSkillspectorOptions> = [
  SKILL_MD_GLOB,
  async (configFiles, opts = {}, context) => {
    const results: Array<readonly [string, { projects: Record<string, ProjectConfiguration> }]> = []

    for (const configFile of configFiles) {
      const normalized = configFile.replace(/\\/g, '/')
      const projectRoot = normalized.includes('/')
        ? normalized.slice(0, normalized.lastIndexOf('/'))
        : ''

      if (shouldSkipPath(projectRoot, context.workspaceRoot)) continue

      const projectName = computeProjectName(projectRoot)
      const targetName = opts.scanTargetName ?? 'scan'

      const project: ProjectConfiguration = {
        root: projectRoot,
        targets: {
          [targetName]: inferScanTarget(projectRoot, projectName, opts),
        },
      }

      results.push([
        configFile,
        {
          projects: {
            [projectName]: project,
          },
        },
      ])
    }

    return results
  },
]

export default createNodesV2

export const __testing = {
  computeProjectName,
  deriveSarifPath,
  inferScanTarget,
  SKILL_MD_GLOB,
}
