import { describe, expect, it } from 'vitest'
import { percentageBucket, isFeatureEnabled, type FeatureFlagDefinition } from './feature-flags'

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
