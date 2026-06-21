import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createNodesV2 } from './plugin.js'

let tmp: string

const ctx = {
  workspaceRoot: '',
  nxJsonConfiguration: {},
} as unknown as Parameters<(typeof createNodesV2)[1]>[2]

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'oxlint-plugin-'))
  ;(ctx as { workspaceRoot: string }).workspaceRoot = tmp
})

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

function callWith(file: string) {
  const fileName = file.split(sep).pop()!
  const result = createNodesV2[1]([file], { configFile: fileName }, ctx)
  return result
}

function makeProject(name: string, configName: string, body = '{}') {
  const projectRoot = join(tmp, 'packages', name)
  mkdirSync(join(projectRoot, 'src'), { recursive: true })
  writeFileSync(join(projectRoot, configName), body)
  writeFileSync(join(projectRoot, 'package.json'), `{"name":"${name}"}`)
  writeFileSync(join(projectRoot, 'src', 'index.ts'), 'export const x = 1;\n')
}

function firstProject(result: ReturnType<(typeof createNodesV2)[1]>): {
  projectRoot: string
  project: {
    targets: Record<
      string,
      {
        executor: string
        options: { command: string; cwd: string }
        cache: boolean
        inputs: string[]
      }
    >
  }
} {
  const arr = result as Array<
    readonly [
      string,
      {
        projects: Record<
          string,
          {
            targets: Record<
              string,
              {
                executor: string
                options: { command: string; cwd: string }
                cache: boolean
                inputs: string[]
              }
            >
          }
        >
      },
    ]
  >
  const first = arr[0]!
  const projectRoot = Object.keys(first[1].projects)[0]!
  return { projectRoot, project: first[1].projects[projectRoot]! }
}

describe('@nx-devkit/oxlint createNodesV2', () => {
  it('infers lint target when .oxlintrc.json is present in a project', () => {
    makeProject('foo', '.oxlintrc.json')
    const result = callWith(join(tmp, 'packages', 'foo', '.oxlintrc.json'))
    expect(result).toBeDefined()
    const { projectRoot, project } = firstProject(result)
    expect(projectRoot).toBe(join('packages', 'foo'))
    expect(project.targets['lint']).toBeDefined()
  })

  it.each([
    '.oxlintrc.json',
    '.oxlintrc.yaml',
    '.oxlintrc.yml',
    '.oxlintrc.js',
    '.oxlintrc.mjs',
    '.oxlintrc.cjs',
    '.oxlintrc.cts',
    '.oxlintrc.mts',
  ])('infers lint target for %s', (cfg) => {
    const project = cfg.replace(/\W/g, '')
    makeProject(project, cfg, '{"rules":{}}')
    const result = callWith(join(tmp, 'packages', project, cfg))
    expect(result, `expected hit for ${cfg}`).toBeDefined()
    const { project: proj } = firstProject(result)
    expect(proj.targets['lint']).toBeDefined()
  })

  it('skips the workspace root', () => {
    writeFileSync(join(tmp, '.oxlintrc.json'), '{}')
    const result = callWith(join(tmp, '.oxlintrc.json'))
    expect(result).toEqual([])
  })

  it('configures lint target with nx:run-commands executor, npx oxlint ., cwd projectRoot, cache true', () => {
    makeProject('barlint', '.oxlintrc.json')
    const result = callWith(join(tmp, 'packages', 'barlint', '.oxlintrc.json'))
    const { projectRoot, project } = firstProject(result)
    const lint = project.targets['lint']!
    expect(lint.executor).toBe('nx:run-commands')
    expect(lint.options.command).toBe('npx oxlint .')
    expect(lint.options.cwd).toBe(projectRoot)
    expect(lint.cache).toBe(true)
  })

  it('lint inputs include src/**/*, .oxlintrc.*, package.json', () => {
    makeProject('bazinputs', '.oxlintrc.json')
    const result = callWith(join(tmp, 'packages', 'bazinputs', '.oxlintrc.json'))
    const { project } = firstProject(result)
    const inputs = project.targets['lint']!.inputs
    expect(inputs).toEqual(
      expect.arrayContaining([
        '{projectRoot}/src/**/*',
        '{projectRoot}/.oxlintrc.*',
        '{projectRoot}/package.json',
      ]),
    )
  })
})
