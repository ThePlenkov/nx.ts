import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { CreateNodesContextV2 } from 'nx/src/devkit-exports'
import { plugin } from './plugin.js'

let tmp: string

function makeContext(workspaceRoot: string): CreateNodesContextV2 {
  return {
    nxJsonConfiguration: {},
    workspaceRoot,
  } as unknown as CreateNodesContextV2
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'feature-flags-plugin-'))
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('@nx-devkit/feature-flags plugin', () => {
  it('exports createNodesV2 with correct glob pattern', () => {
    expect(plugin.createNodesV2[0]).toBe('**/.feature-flags.json')
  })

  it('returns empty array when no flags are defined', () => {
    writeFileSync(join(tmp, '.feature-flags.json'), JSON.stringify({ flags: {} }))
    const [pattern, fn] = plugin.createNodesV2!
    const result = fn(['.feature-flags.json'], {}, makeContext(tmp))
    expect(result).toEqual([])
  })

  it('returns empty array when .feature-flags.json does not exist', () => {
    const [pattern, fn] = plugin.createNodesV2!
    const result = fn(['.feature-flags.json'], {}, makeContext(tmp))
    expect(result).toEqual([])
  })

  it('resolves flags and attaches to project metadata', () => {
    writeFileSync(
      join(tmp, '.feature-flags.json'),
      JSON.stringify({
        flags: {
          'test-flag': { percentage: 100 },
        },
      }),
    )

    const [pattern, fn] = plugin.createNodesV2!
    const result = fn(['.feature-flags.json'], {}, makeContext(tmp))

    expect(result).toHaveLength(1)
    const [configFile, projectConfig] = result[0]!
    expect(configFile).toBe('.feature-flags.json')

    const projects = (projectConfig as { projects: Record<string, unknown> }).projects
    expect(projects).toHaveProperty('.')

    const rootProject = projects['.'] as {
      metadata: { featureFlags: Record<string, boolean> }
    }
    expect(rootProject.metadata.featureFlags).toEqual({
      'test-flag': true,
    })
  })

  it('handles multiple flags', () => {
    writeFileSync(
      join(tmp, '.feature-flags.json'),
      JSON.stringify({
        flags: {
          'flag-a': { percentage: 100 },
          'flag-b': { percentage: 0 },
        },
      }),
    )

    const [pattern, fn] = plugin.createNodesV2!
    const result = fn(['.feature-flags.json'], {}, makeContext(tmp))

    const rootProject = (
      result[0]![1] as {
        projects: Record<string, { metadata: { featureFlags: Record<string, boolean> } }>
      }
    ).projects['.']
    expect(rootProject.metadata.featureFlags).toEqual({
      'flag-a': true,
      'flag-b': false,
    })
  })

  it('extracts project root from nested config path', () => {
    writeFileSync(
      join(tmp, '.feature-flags.json'),
      JSON.stringify({
        flags: {
          'test-flag': { percentage: 100 },
        },
      }),
    )

    const [pattern, fn] = plugin.createNodesV2!
    const result = fn(['packages/my-lib/.feature-flags.json'], {}, makeContext(tmp))

    const projects = (result[0]![1] as { projects: Record<string, unknown> }).projects
    expect(projects).toHaveProperty('packages/my-lib')
  })
})
