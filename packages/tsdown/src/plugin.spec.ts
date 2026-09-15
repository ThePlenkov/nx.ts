import { logger } from '@nx/devkit'
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

describe('@nx-devkit/tsdown createNodesV2', () => {
  beforeEach(() => {
    vol.reset()
    vol.fromJSON(
      {
        '/workspace/project-a/tsdown.config.ts': 'export default {}',
        '/workspace/project-a/src/index.ts': 'export const a = 1',
        '/workspace/project-a/tsconfig.lib.json': '{}',
        '/workspace/project-a/package.json': '{}',
        '/workspace/project-b/tsdown.config.ts': 'export default {}',
        '/workspace/project-b/src/index.ts': 'export const b = 2',
        '/workspace/project-b/tsconfig.lib.json': '{}',
        '/workspace/project-b/package.json': '{}',
        '/workspace/tsdown.config.ts': 'export default {}',
        '/workspace/package.json': '{}',
      },
      '/',
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.NX_VERBOSE_LOGGING
    process.argv = process.argv.filter((a) => a !== '--verbose')
  })

  it('infers a build target for a project with tsdown.config.ts', async () => {
    const [pattern, fn] = createNodesV2
    expect(pattern).toBe('**/tsdown.config.ts')

    const results = await fn(['project-a/tsdown.config.ts'], {}, makeContext())

    expect(results).toHaveLength(1)
    const [configFile, project] = results[0]!
    expect(configFile).toBe('project-a/tsdown.config.ts')
    const projects = project.projects
    expect(projects).toHaveProperty('project-a')
    const targets = projects!['project-a']!.targets!
    expect(targets).toHaveProperty('build')
  })

  it('build target uses nx:run-commands with cwd, outputs, cache, dependsOn', async () => {
    const [, fn] = createNodesV2
    const results = await fn(['project-a/tsdown.config.ts'], {}, makeContext())
    const build = results[0]![1].projects!['project-a']!.targets!.build!

    expect(build.executor).toBe('nx:run-commands')
    expect(build.options).toEqual({
      command: 'tsdown',
      cwd: 'project-a',
    })
    expect(build.outputs).toEqual(['{projectRoot}/dist'])
    expect(build.cache).toBe(true)
    expect(build.dependsOn).toEqual(['^build'])
  })

  it('build inputs include src/**/*.ts, tsdown.config.ts, tsconfig.lib.json, package.json', async () => {
    const [, fn] = createNodesV2
    const results = await fn(['project-a/tsdown.config.ts'], {}, makeContext())
    const inputs = results[0]![1].projects!['project-a']!.targets!.build!.inputs

    expect(inputs).toEqual(
      expect.arrayContaining([
        '{projectRoot}/src/**/*.ts',
        '{projectRoot}/tsdown.config.ts',
        '{projectRoot}/tsconfig.lib.json',
        '{projectRoot}/package.json',
      ]),
    )
  })

  it('skips the workspace root (configFile at ./)', async () => {
    const [, fn] = createNodesV2
    const results = await fn(['tsdown.config.ts'], {}, makeContext())
    expect(results).toHaveLength(0)
  })

  it('infers a build target for each non-root project', async () => {
    const [, fn] = createNodesV2
    const results = await fn(
      ['project-a/tsdown.config.ts', 'project-b/tsdown.config.ts', 'tsdown.config.ts'],
      {},
      makeContext(),
    )
    expect(results).toHaveLength(2)
    const roots = results.flatMap((r) => Object.keys(r[1].projects!))
    expect(roots).toEqual(expect.arrayContaining(['project-a', 'project-b']))
  })

  describe('verbose logging', () => {
    it('logs when --verbose flag is set', async () => {
      const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {})
      process.argv.push('--verbose')

      await createNodesV2[1](['project-a/tsdown.config.ts'], {}, makeContext())
      expect(infoSpy).toHaveBeenCalled()

      infoSpy.mockRestore()
    })

    it('logs when NX_VERBOSE_LOGGING=true', async () => {
      const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {})
      process.env.NX_VERBOSE_LOGGING = 'true'

      await createNodesV2[1](['project-a/tsdown.config.ts'], {}, makeContext())
      expect(infoSpy).toHaveBeenCalled()

      infoSpy.mockRestore()
    })

    it('does not log when neither flag nor env var is set', async () => {
      const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {})
      delete process.env.NX_VERBOSE_LOGGING
      process.argv = process.argv.filter((a) => a !== '--verbose')

      await createNodesV2[1](['project-a/tsdown.config.ts'], {}, makeContext())
      expect(infoSpy).not.toHaveBeenCalled()

      infoSpy.mockRestore()
    })
  })
})
