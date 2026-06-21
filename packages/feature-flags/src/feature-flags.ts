import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export interface FeatureFlagDefinition {
  percentage: number
  include?: string[]
  exclude?: string[]
  overrides?: Record<string, boolean>
}

export interface FeatureFlagsConfig {
  flags: Record<string, FeatureFlagDefinition>
}

export function percentageBucket(projectName: string, flagName: string): number {
  const hash = createHash('sha256').update(`${flagName}:${projectName}`).digest('hex')
  return parseInt(hash.substring(0, 8), 16) % 100
}

export function isFeatureEnabled(
  projectName: string,
  flagName: string,
  definition: FeatureFlagDefinition,
): boolean {
  if (definition.overrides?.[projectName] !== undefined) {
    return definition.overrides[projectName]
  }

  if (definition.include?.length) {
    const matches = definition.include.some((g) => minimatch(projectName, g))
    if (!matches) return false
  }

  if (definition.exclude?.length) {
    const excluded = definition.exclude.some((g) => minimatch(projectName, g))
    if (excluded) return false
  }

  const bucket = percentageBucket(projectName, flagName)
  return bucket < definition.percentage
}

export function loadFeatureFlags(workspaceRoot: string): FeatureFlagsConfig {
  const flagPath = join(workspaceRoot, '.feature-flags.json')
  if (!existsSync(flagPath)) {
    return { flags: {} }
  }
  return JSON.parse(readFileSync(flagPath, 'utf-8'))
}

function minimatch(str: string, pattern: string): boolean {
  const regex = patternToRegex(pattern)
  return regex.test(str)
}

function patternToRegex(pattern: string): RegExp {
  let regexStr = pattern.replace(/\./g, '\\.').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')
  regexStr = `^${regexStr}$`
  return new RegExp(regexStr)
}
