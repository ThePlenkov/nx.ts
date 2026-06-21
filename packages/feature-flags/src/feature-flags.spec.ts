import { describe, expect, it } from 'vitest'
import {
  percentageBucket,
  isFeatureEnabled,
  validatePercentage,
  loadFeatureFlags,
  type FeatureFlagDefinition,
} from './feature-flags'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('percentageBucket', () => {
  it('returns a number between 0 and 99', () => {
    for (let i = 0; i < 100; i++) {
      const bucket = percentageBucket(`project-${i}`, 'test-flag')
      expect(bucket).toBeGreaterThanOrEqual(0)
      expect(bucket).toBeLessThan(100)
    }
  })

  it('is deterministic - same input always produces same output', () => {
    const bucket1 = percentageBucket('my-project', 'my-flag')
    const bucket2 = percentageBucket('my-project', 'my-flag')
    expect(bucket1).toBe(bucket2)
  })

  it('different projects get different buckets', () => {
    const buckets = new Set<number>()
    for (let i = 0; i < 50; i++) {
      buckets.add(percentageBucket(`project-${i}`, 'test-flag'))
    }
    expect(buckets.size).toBeGreaterThan(10)
  })

  it('different flags produce different distributions', () => {
    const bucketsA = new Set<number>()
    const bucketsB = new Set<number>()
    for (let i = 0; i < 50; i++) {
      bucketsA.add(percentageBucket(`project-${i}`, 'flag-a'))
      bucketsB.add(percentageBucket(`project-${i}`, 'flag-b'))
    }
    expect(bucketsA).not.toEqual(bucketsB)
  })
})

describe('validatePercentage', () => {
  it('accepts valid percentages', () => {
    expect(validatePercentage(0)).toBe(true)
    expect(validatePercentage(50)).toBe(true)
    expect(validatePercentage(100)).toBe(true)
  })

  it('rejects invalid values', () => {
    expect(validatePercentage(-1)).toBe(false)
    expect(validatePercentage(101)).toBe(false)
    expect(validatePercentage(NaN)).toBe(false)
    expect(validatePercentage(Infinity)).toBe(false)
    expect(validatePercentage('50')).toBe(false)
    expect(validatePercentage(null)).toBe(false)
  })
})

describe('loadFeatureFlags', () => {
  let tmp: string

  it('returns empty flags when file does not exist', () => {
    const result = loadFeatureFlags('/nonexistent/path/.feature-flags.json')
    expect(result).toEqual({ flags: {} })
  })

  it('parses valid feature flags file', () => {
    tmp = mkdtempSync(join(tmpdir(), 'ff-test-'))
    const flagPath = join(tmp, '.feature-flags.json')
    writeFileSync(
      flagPath,
      JSON.stringify({
        flags: {
          'test-flag': { percentage: 50 },
        },
      }),
    )
    const result = loadFeatureFlags(flagPath)
    expect(result.flags['test-flag'].percentage).toBe(50)
    rmSync(tmp, { recursive: true, force: true })
  })

  it('handles invalid JSON gracefully', () => {
    tmp = mkdtempSync(join(tmpdir(), 'ff-test-'))
    const flagPath = join(tmp, '.feature-flags.json')
    writeFileSync(flagPath, '{ invalid json')
    const result = loadFeatureFlags(flagPath)
    expect(result).toEqual({ flags: {} })
    rmSync(tmp, { recursive: true, force: true })
  })

  it('handles invalid format gracefully', () => {
    tmp = mkdtempSync(join(tmpdir(), 'ff-test-'))
    const flagPath = join(tmp, '.feature-flags.json')
    writeFileSync(flagPath, JSON.stringify({ notFlags: true }))
    const result = loadFeatureFlags(flagPath)
    expect(result).toEqual({ flags: {} })
    rmSync(tmp, { recursive: true, force: true })
  })

  it('clamps invalid percentages', () => {
    tmp = mkdtempSync(join(tmpdir(), 'ff-test-'))
    const flagPath = join(tmp, '.feature-flags.json')
    writeFileSync(
      flagPath,
      JSON.stringify({
        flags: {
          'bad-flag': { percentage: 150 },
        },
      }),
    )
    const result = loadFeatureFlags(flagPath)
    expect(result.flags['bad-flag'].percentage).toBe(100)
    rmSync(tmp, { recursive: true, force: true })
  })
})

describe('isFeatureEnabled', () => {
  it('returns true when percentage is 100', () => {
    const def: FeatureFlagDefinition = { percentage: 100 }
    expect(isFeatureEnabled('any-project', 'flag', def)).toBe(true)
  })

  it('returns false when percentage is 0', () => {
    const def: FeatureFlagDefinition = { percentage: 0 }
    expect(isFeatureEnabled('any-project', 'flag', def)).toBe(false)
  })

  it('applies include globs correctly', () => {
    const def: FeatureFlagDefinition = {
      percentage: 100,
      include: ['packages/*'],
    }
    expect(isFeatureEnabled('packages/core', 'flag', def)).toBe(true)
    expect(isFeatureEnabled('apps/web', 'flag', def)).toBe(false)
  })

  it('applies exclude globs correctly', () => {
    const def: FeatureFlagDefinition = {
      percentage: 100,
      exclude: ['packages/legacy'],
    }
    expect(isFeatureEnabled('packages/core', 'flag', def)).toBe(true)
    expect(isFeatureEnabled('packages/legacy', 'flag', def)).toBe(false)
  })

  it('handles ** glob patterns', () => {
    const def: FeatureFlagDefinition = {
      percentage: 100,
      include: ['packages/**/utils'],
    }
    expect(isFeatureEnabled('packages/core/utils', 'flag', def)).toBe(true)
    expect(isFeatureEnabled('packages/deep/nested/utils', 'flag', def)).toBe(true)
    expect(isFeatureEnabled('packages/core/other', 'flag', def)).toBe(false)
  })

  it('overrides take precedence over percentage', () => {
    const def: FeatureFlagDefinition = {
      percentage: 0,
      overrides: { 'special-project': true, 'blocked-project': false },
    }
    expect(isFeatureEnabled('special-project', 'flag', def)).toBe(true)
    expect(isFeatureEnabled('blocked-project', 'flag', def)).toBe(false)
    expect(isFeatureEnabled('normal-project', 'flag', def)).toBe(false)
  })

  it('overrides take precedence over include/exclude', () => {
    const def: FeatureFlagDefinition = {
      percentage: 100,
      include: ['packages/*'],
      overrides: { 'apps/web': true },
    }
    expect(isFeatureEnabled('apps/web', 'flag', def)).toBe(true)
    expect(isFeatureEnabled('packages/core', 'flag', def)).toBe(true)
    expect(isFeatureEnabled('other/path', 'flag', def)).toBe(false)
  })
})
