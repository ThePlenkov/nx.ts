import { createNodesV2 } from './plugin.js'
import type { CreateNodesContextV2 } from 'nx/src/project-graph/plugins/public-api'

function makeContext(workspaceRoot: string): CreateNodesContextV2 {
  return {
    nxJsonConfiguration: {},
    workspaceRoot,
  } as unknown as CreateNodesContextV2
}

describe('@nx-devkit/biome createNodesV2', () => {
  it('returns empty array when no biome config files are matched', () => {
    const result = createNodesV2[1]([], {}, makeContext('/workspace'))
    expect(result).toEqual([])
  })

  it('infers format, format-check, and lint targets for a biome.json project', () => {
    const workspaceRoot = '/workspace'
    const configFile = 'packages/lib/biome.json'
    const result = createNodesV2[1]([configFile], {}, makeContext(workspaceRoot))

    expect(result).toHaveLength(1)
    const [file, project] = result[0]!
    expect(file).toBe(configFile)
    expect(project.projects).toBeDefined()

    const projectRoot = 'packages/lib'
    const targets = project.projects?.[projectRoot]?.targets
    expect(targets).toBeDefined()

    expect(targets!.format).toBeDefined()
    expect(targets!['format-check']).toBeDefined()
    expect(targets!.lint).toBeDefined()
  })

  it('format target writes files, is uncached, and runs in projectRoot', () => {
    const result = createNodesV2[1](['apps/demo/biome.json'], {}, makeContext('/workspace'))
    const targets = result[0]![1].projects?.['apps/demo']?.targets
    const format = targets!.format!
    expect(format.executor).toBe('nx:run-commands')
    expect((format.options as { command: string }).command).toBe('npx biome format --write .')
    expect((format.options as { cwd: string }).cwd).toBe('apps/demo')
    expect(format.cache).toBe(false)
  })

  it('format-check target is read-only and cacheable', () => {
    const result = createNodesV2[1](['apps/demo/biome.json'], {}, makeContext('/workspace'))
    const targets = result[0]![1].projects?.['apps/demo']?.targets
    const check = targets!['format-check']!
    expect(check.executor).toBe('nx:run-commands')
    expect((check.options as { command: string }).command).toBe('npx biome format .')
    expect((check.options as { cwd: string }).cwd).toBe('apps/demo')
    expect(check.cache).toBe(true)
  })

  it('lint target runs biome lint and is cacheable', () => {
    const result = createNodesV2[1](['apps/demo/biome.json'], {}, makeContext('/workspace'))
    const targets = result[0]![1].projects?.['apps/demo']?.targets
    const lint = targets!.lint!
    expect(lint.executor).toBe('nx:run-commands')
    expect((lint.options as { command: string }).command).toBe('npx biome lint .')
    expect((lint.options as { cwd: string }).cwd).toBe('apps/demo')
    expect(lint.cache).toBe(true)
  })

  it('inputs include biome config file and src/**/*', () => {
    const result = createNodesV2[1](['apps/demo/biome.json'], {}, makeContext('/workspace'))
    const targets = result[0]![1].projects?.['apps/demo']?.targets
    const formatInputs = targets!.format!.inputs as string[]
    expect(formatInputs).toContain('{projectRoot}/biome.json')
    expect(formatInputs).toContain('{projectRoot}/src/**/*')
  })

  it('handles biome.jsonc (json with comments) the same as biome.json', () => {
    const result = createNodesV2[1](['apps/demo/biome.jsonc'], {}, makeContext('/workspace'))
    expect(result).toHaveLength(1)
    const targets = result[0]![1].projects?.['apps/demo']?.targets
    expect(targets!.format).toBeDefined()
    expect(targets!.lint).toBeDefined()
  })

  it('skips workspace root (biome.json at workspace root)', () => {
    const result = createNodesV2[1](['biome.json'], {}, makeContext('/workspace'))
    expect(result).toEqual([])
  })

  it('exports the createNodesV2 tuple with the correct glob pattern', () => {
    expect(createNodesV2[0]).toBe('**/biome.json')
    expect(createNodesV2[0]).toMatch(/biome\.json/)
  })

  it('plugin name is exposed for nx registration', async () => {
    const mod = await import('./plugin.js')
    expect(typeof mod.createNodesV2).toBe('object')
  })
})
