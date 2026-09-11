import { createHash } from 'node:crypto'
import { vol } from 'memfs'
import type { CreateNodesContextV2 } from 'nx/src/devkit-exports'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNodesV2 } from './plugin.ts'

vi.mock('fs', async () => {
  const memfs = await import('memfs')
  return {
    ...memfs.fs,
    default: memfs.fs,
  }
})

vi.mock('fs/promises', async () => {
  const memfs = await import('memfs')
  return {
    ...memfs.fs.promises,
    default: memfs.fs.promises,
  }
})

function makeContext(): CreateNodesContextV2 {
  return {
    workspaceRoot: '/workspace',
    nxJsonConfiguration: {},
    turboConfig: undefined,
    projectGraph: { nodes: {}, dependencies: {} },
  } as unknown as CreateNodesContextV2
}

function expectedProjectName(projectRoot: string): string {
  const slug = projectRoot.replace(/\//g, '-')
  const hash = createHash('sha256').update(projectRoot).digest('hex').slice(0, 12)
  return `${slug}-${hash}`
}

describe('@nx-devkit/skill createNodesV2', () => {
  beforeEach(() => {
    vol.reset()
    vol.fromJSON(
      {
        '/workspace/skills/code-review/act/SKILL.md': '# Code Review Skill',
        '/workspace/skills/a-b/SKILL.md': '# Skill a-b',
        '/workspace/skills/a/b/SKILL.md': '# Skill a/b',
        '/workspace/SKILL.md': '# Root skill',
        '/workspace/node_modules/some-pkg/SKILL.md': '# node_modules skill',
        '/workspace/package.json': '{}',
      },
      '/',
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses **/SKILL.md as the trigger pattern', () => {
    const [pattern] = createNodesV2
    expect(pattern).toBe('**/SKILL.md')
  })

  it('infers a project for skills/code-review/act/SKILL.md with injective name', async () => {
    const [, fn] = createNodesV2
    const results = await fn(['skills/code-review/act/SKILL.md'], {}, makeContext())

    expect(results).toHaveLength(1)
    const [configFile, project] = results[0]!
    expect(configFile).toBe('skills/code-review/act/SKILL.md')

    const projectRoot = 'skills/code-review/act'
    const expectedName = expectedProjectName(projectRoot)
    const projects = project.projects
    expect(projects).toHaveProperty(expectedName)
  })

  it('skips workspace root SKILL.md', async () => {
    const [, fn] = createNodesV2
    const results = await fn(['SKILL.md'], {}, makeContext())
    expect(results).toHaveLength(0)
  })

  it('skips node_modules SKILL.md', async () => {
    const [, fn] = createNodesV2
    const results = await fn(['node_modules/some-pkg/SKILL.md'], {}, makeContext())
    expect(results).toHaveLength(0)
  })

  it('produces distinct hash suffixes for skills/a-b and skills/a/b', async () => {
    const [, fn] = createNodesV2
    const results = await fn(['skills/a-b/SKILL.md', 'skills/a/b/SKILL.md'], {}, makeContext())

    expect(results).toHaveLength(2)
    const names = results.flatMap((r) => Object.keys(r[1].projects!))
    const name1 = expectedProjectName('skills/a-b')
    const name2 = expectedProjectName('skills/a/b')
    expect(names).toContain(name1)
    expect(names).toContain(name2)
    expect(name1).not.toBe(name2)
  })

  it('infers all 5 targets: build, lint, validate, os-check, size-check', async () => {
    const [, fn] = createNodesV2
    const results = await fn(['skills/code-review/act/SKILL.md'], {}, makeContext())
    const projectRoot = 'skills/code-review/act'
    const expectedName = expectedProjectName(projectRoot)
    const targets = results[0]![1].projects![expectedName]!.targets!

    expect(targets).toHaveProperty('build')
    expect(targets).toHaveProperty('lint')
    expect(targets).toHaveProperty('validate')
    expect(targets).toHaveProperty('os-check')
    expect(targets).toHaveProperty('size-check')
  })

  it('build target uses @nx-devkit/skill:build executor with cache, outputs, options', async () => {
    const [, fn] = createNodesV2
    const results = await fn(['skills/code-review/act/SKILL.md'], {}, makeContext())
    const projectRoot = 'skills/code-review/act'
    const expectedName = expectedProjectName(projectRoot)
    const build = results[0]![1].projects![expectedName]!.targets!.build!

    expect(build.executor).toBe('@nx-devkit/skill:build')
    expect(build.cache).toBe(true)
    expect(build.outputs).toEqual([`{workspaceRoot}/.build/skills/${expectedName}`])
    expect(build.options).toEqual({
      target: 'skills-sh',
      outDir: `.build/skills/${expectedName}`,
      path: projectRoot,
    })
  })

  it('build inputs include skill files and ^production', async () => {
    const [, fn] = createNodesV2
    const results = await fn(['skills/code-review/act/SKILL.md'], {}, makeContext())
    const projectRoot = 'skills/code-review/act'
    const expectedName = expectedProjectName(projectRoot)
    const build = results[0]![1].projects![expectedName]!.targets!.build!

    expect(build.inputs).toEqual(
      expect.arrayContaining([
        `{projectRoot}/SKILL.md`,
        `{projectRoot}/**/*.md`,
        `{projectRoot}/scripts/**/*`,
        `{projectRoot}/references/**/*`,
        `{projectRoot}/assets/**/*`,
        `{projectRoot}/agents/**/*`,
        '^production',
      ]),
    )
  })

  it('lint target uses nx:run-commands with markdownlint-cli2', async () => {
    const [, fn] = createNodesV2
    const results = await fn(['skills/code-review/act/SKILL.md'], {}, makeContext())
    const projectRoot = 'skills/code-review/act'
    const expectedName = expectedProjectName(projectRoot)
    const lint = results[0]![1].projects![expectedName]!.targets!.lint!

    expect(lint.executor).toBe('nx:run-commands')
    expect(lint.cache).toBe(true)
    expect(lint.options!.command).toBe(
      `markdownlint-cli2 '{projectRoot}/**/*.md' --config .markdownlint.json`,
    )
    expect(lint.options!.cwd).toBe('{workspaceRoot}')
    expect(lint.inputs).toEqual(['{projectRoot}/**/*.md', '{workspaceRoot}/.markdownlint.json'])
  })

  it('validate target uses nx:run-commands with validate-skill.ts', async () => {
    const [, fn] = createNodesV2
    const results = await fn(['skills/code-review/act/SKILL.md'], {}, makeContext())
    const projectRoot = 'skills/code-review/act'
    const expectedName = expectedProjectName(projectRoot)
    const validate = results[0]![1].projects![expectedName]!.targets!.validate!

    expect(validate.executor).toBe('nx:run-commands')
    expect(validate.cache).toBe(true)
    expect(validate.options!.command).toBe(
      `tsx scripts/validate-skill.ts --skill {projectRoot}`,
    )
    expect(validate.options!.cwd).toBe('{workspaceRoot}')
    expect(validate.inputs).toEqual(['{projectRoot}/SKILL.md', '{projectRoot}/agents/openai.yaml'])
  })

  it('os-check target uses nx:run-commands with check-os-independence.ts', async () => {
    const [, fn] = createNodesV2
    const results = await fn(['skills/code-review/act/SKILL.md'], {}, makeContext())
    const projectRoot = 'skills/code-review/act'
    const expectedName = expectedProjectName(projectRoot)
    const osCheck = results[0]![1].projects![expectedName]!.targets!['os-check']!

    expect(osCheck.executor).toBe('nx:run-commands')
    expect(osCheck.cache).toBe(true)
    expect(osCheck.options!.command).toBe(
      `tsx scripts/check-os-independence.ts --skill {projectRoot}`,
    )
    expect(osCheck.options!.cwd).toBe('{workspaceRoot}')
    expect(osCheck.inputs).toEqual(['{projectRoot}/**/*'])
  })

  it('size-check target uses nx:run-commands with check-skill-size.ts', async () => {
    const [, fn] = createNodesV2
    const results = await fn(['skills/code-review/act/SKILL.md'], {}, makeContext())
    const projectRoot = 'skills/code-review/act'
    const expectedName = expectedProjectName(projectRoot)
    const sizeCheck = results[0]![1].projects![expectedName]!.targets!['size-check']!

    expect(sizeCheck.executor).toBe('nx:run-commands')
    expect(sizeCheck.cache).toBe(true)
    expect(sizeCheck.options!.command).toBe(
      `tsx scripts/check-skill-size.ts --skill {projectRoot}`,
    )
    expect(sizeCheck.options!.cwd).toBe('{workspaceRoot}')
    expect(sizeCheck.inputs).toEqual(['{projectRoot}/**/*'])
  })

  it('supports custom target names via options', async () => {
    const [, fn] = createNodesV2
    const results = await fn(
      ['skills/code-review/act/SKILL.md'],
      {
        buildTargetName: 'compile',
        lintTargetName: 'md-lint',
        validateTargetName: 'check',
        osCheckTargetName: 'os',
        sizeCheckTargetName: 'size',
      },
      makeContext(),
    )
    const projectRoot = 'skills/code-review/act'
    const expectedName = expectedProjectName(projectRoot)
    const targets = results[0]![1].projects![expectedName]!.targets!

    expect(targets).toHaveProperty('compile')
    expect(targets).toHaveProperty('md-lint')
    expect(targets).toHaveProperty('check')
    expect(targets).toHaveProperty('os')
    expect(targets).toHaveProperty('size')
    expect(targets).not.toHaveProperty('build')
    expect(targets).not.toHaveProperty('lint')
  })

  it('appends skillInputs to build target inputs', async () => {
    const [, fn] = createNodesV2
    const results = await fn(
      ['skills/code-review/act/SKILL.md'],
      { skillInputs: ['{projectRoot}/custom/**/*'] },
      makeContext(),
    )
    const projectRoot = 'skills/code-review/act'
    const expectedName = expectedProjectName(projectRoot)
    const build = results[0]![1].projects![expectedName]!.targets!.build!

    expect(build.inputs).toEqual(expect.arrayContaining(['{projectRoot}/custom/**/*']))
  })

  it('skips project when duplicate target names are provided', async () => {
    const [, fn] = createNodesV2
    const results = await fn(
      ['skills/foo/SKILL.md'],
      { buildTargetName: 'lint', lintTargetName: 'lint' },
      makeContext(),
    )
    expect(results).toHaveLength(0)
  })

  it('skips project when a target name is empty', async () => {
    const [, fn] = createNodesV2
    const results = await fn(
      ['skills/foo/SKILL.md'],
      { buildTargetName: '', lintTargetName: 'lint' },
      makeContext(),
    )
    expect(results).toHaveLength(0)
  })
})
