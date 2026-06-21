import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { logger } from '@nx/devkit'
import { minimatch } from 'minimatch'

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

export function validatePercentage(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
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

export function loadFeatureFlags(flagFilePath: string): FeatureFlagsConfig {
  if (!existsSync(flagFilePath)) {
    return { flags: {} }
  }
  try {
    const content = readFileSync(flagFilePath, 'utf-8')
    const parsed = JSON.parse(content) as unknown
    if (!parsed || typeof parsed !== 'object' || !('flags' in parsed)) {
      logger.warn(`[feature-flags] Invalid .feature-flags.json format at ${flagFilePath}`)
      return { flags: {} }
    }
    const config = parsed as FeatureFlagsConfig
    for (const [name, def] of Object.entries(config.flags)) {
      if (!validatePercentage(def.percentage)) {
        logger.warn(
          `[feature-flags] Invalid percentage for flag "${name}": ${def.percentage}. Clamping to 0-100.`,
        )
        def.percentage = Math.max(0, Math.min(100, def.percentage || 0))
      }
    }
    return config
  } catch (err) {
    logger.warn(`[feature-flags] Failed to parse .feature-flags.json: ${err}`)
    return { flags: {} }
  }
}
