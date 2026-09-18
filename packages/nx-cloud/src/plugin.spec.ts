import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createNodesV2 } from './plugin.ts'

function makeWorkspace(): string {
  return mkdtempSync(join(tmpdir(), 'nx-cloud-plugin-'))
}

function firstProjects(result: unknown): Record<string, { targets?: Record<string, unknown> }> {
  const entries = result as (readonly [
    string,
    { projects: Record<string, { targets?: Record<string, unknown> }> },
  ])[]
  return entries[0]![1].projects
}

describe('createNodesV2', () => {
  let workspace: string

  it('watches the nx.json glob', () => {
    expect(createNodesV2[0]).toBe('nx.json')
  })

  beforeEach(() => {
    workspace = makeWorkspace()
  })
  afterEach(() => {
    rmSync(workspace, { force: true, recursive: true })
  })

  it('infers an nx-cloud-rotate target on the root project', () => {
    writeFileSync(join(workspace, 'nx.json'), JSON.stringify({}))

    const result = createNodesV2[1](
      ['nx.json'],
      {},
      {
        nxJsonConfiguration: {},
        workspaceRoot: workspace,
      },
    )

    const projects = firstProjects(result)

    expect(Object.keys(projects)).toEqual(['.'])
    expect(projects['.']?.targets).toEqual({
      'nx-cloud-rotate': {
        cache: false,
        executor: '@nx-devkit/nx-cloud:rotate',
        options: {},
      },
    })
  })

  it('respects a custom targetName plugin option', () => {
    writeFileSync(join(workspace, 'nx.json'), JSON.stringify({}))

    const result = createNodesV2[1](
      ['nx.json'],
      { targetName: 'cloud:rotate' },
      {
        nxJsonConfiguration: {},
        workspaceRoot: workspace,
      },
    )

    const projects = firstProjects(result)

    expect(projects['.']?.targets).toEqual({
      'cloud:rotate': {
        cache: false,
        executor: '@nx-devkit/nx-cloud:rotate',
        options: {},
      },
    })
  })

  it('ignores nx.json files outside the workspace root', () => {
    const nestedDir = join(workspace, 'packages/lib')
    mkdirSync(nestedDir, { recursive: true })
    writeFileSync(join(nestedDir, 'nx.json'), JSON.stringify({}))

    const result = createNodesV2[1](
      ['packages/lib/nx.json'],
      {},
      {
        nxJsonConfiguration: {},
        workspaceRoot: workspace,
      },
    )

    expect(result).toEqual([])
  })

  it('ignores an nx.json path escaping the workspace root', () => {
    const result = createNodesV2[1](
      ['../nx.json'],
      {},
      {
        nxJsonConfiguration: {},
        workspaceRoot: workspace,
      },
    )

    expect(result).toEqual([])
  })
})
