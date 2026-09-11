import { describe, expect, it, vi } from 'vitest'
import type { Tree } from '@nx/devkit'
import { initGenerator } from '../src/generators/init/generator.js'

function createTree(files: Record<string, string> = {}): {
  tree: Tree
  files: Map<string, string>
} {
  const fileMap = new Map<string, string>(Object.entries(files))

  const tree: Tree = {
    exists: (path: string) => fileMap.has(path),
    read: (path: string) => fileMap.get(path) ?? null,
    write: (path: string, content: string) => {
      fileMap.set(path, content)
    },
    delete: (path: string) => {
      fileMap.delete(path)
    },
    listChanges: () => [],
    rename: () => {},
    root: '/workspace',
    children: (path: string): string[] => {
      const prefix = path === '' || path === '.' ? '' : `${path}/`
      const children = new Set<string>()
      for (const filePath of fileMap.keys()) {
        if (filePath.startsWith(prefix)) {
          const rest = filePath.slice(prefix.length)
          const firstSlash = rest.indexOf('/')
          if (firstSlash === -1) {
            children.add(rest)
          } else {
            children.add(rest.slice(0, firstSlash))
          }
        }
      }
      return Array.from(children)
    },
  }

  return { tree, files: fileMap }
}

function readJson(files: Map<string, string>, path: string): Record<string, unknown> {
  return JSON.parse(files.get(path) ?? '{}') as Record<string, unknown>
}

describe('initGenerator', () => {
  describe('nx.json creation', () => {
    it('creates nx.json if it does not exist', async () => {
      const { tree, files } = createTree({})

      await initGenerator(tree, {})

      expect(files.has('nx.json')).toBe(true)
      const nxJson = readJson(files, 'nx.json')
      expect(nxJson.plugins).toBeDefined()
    })

    it('preserves existing nx.json and only updates plugins', async () => {
      const { tree, files } = createTree({
        'nx.json': JSON.stringify({
          $schema: './node_modules/nx/schemas/nx-schema.json',
          version: 2,
          targetDefaults: { build: { cache: true } },
          plugins: [],
        }),
      })

      await initGenerator(tree, {})

      const nxJson = readJson(files, 'nx.json')
      expect(nxJson.version).toBe(2)
      expect(nxJson.targetDefaults).toEqual({ build: { cache: true } })
      expect(nxJson.$schema).toBe('./node_modules/nx/schemas/nx-schema.json')
    })

    it('throws on malformed nx.json instead of overwriting', async () => {
      const { tree } = createTree({
        'nx.json': '{ invalid json !!!',
      })

      await expect(initGenerator(tree, {})).rejects.toThrow(/Failed to parse nx\.json/)
    })
  })

  describe('plugin registration', () => {
    it('registers @nx-devkit/typescript as the sole plugin', async () => {
      const { tree, files } = createTree({
        'nx.json': JSON.stringify({ plugins: [] }),
      })

      await initGenerator(tree, {})

      const nxJson = readJson(files, 'nx.json')
      const plugins = nxJson.plugins as unknown[]
      expect(plugins).toHaveLength(1)
      const entry = plugins[0] as { plugin: string }
      expect(entry.plugin).toBe('@nx-devkit/typescript')
    })

    it('removes existing @nx-devkit/* standalone plugin entries (string form)', async () => {
      const { tree, files } = createTree({
        'nx.json': JSON.stringify({
          plugins: [
            '@nx-devkit/tsdown',
            '@nx-devkit/oxlint',
            '@nx-devkit/biome',
            '@nx-devkit/typescript',
          ],
        }),
      })

      await initGenerator(tree, {})

      const nxJson = readJson(files, 'nx.json')
      const plugins = nxJson.plugins as unknown[]
      expect(plugins).toHaveLength(1)
      const entry = plugins[0] as { plugin: string }
      expect(entry.plugin).toBe('@nx-devkit/typescript')
    })

    it('removes existing @nx-devkit/* standalone plugin entries (object form)', async () => {
      const { tree, files } = createTree({
        'nx.json': JSON.stringify({
          plugins: [
            { plugin: '@nx-devkit/tsdown' },
            { plugin: '@nx-devkit/oxlint', options: {} },
            '@nx-devkit/biome',
          ],
        }),
      })

      await initGenerator(tree, {})

      const nxJson = readJson(files, 'nx.json')
      const plugins = nxJson.plugins as unknown[]
      expect(plugins).toHaveLength(1)
      const entry = plugins[0] as { plugin: string }
      expect(entry.plugin).toBe('@nx-devkit/typescript')
    })

    it('preserves non-nx-devkit plugins', async () => {
      const { tree, files } = createTree({
        'nx.json': JSON.stringify({
          plugins: ['@nx/vite', '@nx-devkit/oxlint', '@my-org/custom-plugin'],
        }),
      })

      await initGenerator(tree, {})

      const nxJson = readJson(files, 'nx.json')
      const plugins = nxJson.plugins as unknown[]
      const pluginNames = plugins.map((p) =>
        typeof p === 'string' ? p : (p as { plugin: string }).plugin,
      )
      expect(pluginNames).toContain('@nx/vite')
      expect(pluginNames).toContain('@my-org/custom-plugin')
      expect(pluginNames).toContain('@nx-devkit/typescript')
      expect(pluginNames).not.toContain('@nx-devkit/oxlint')
    })

    it('is idempotent — running twice does not duplicate the entry', async () => {
      const { tree, files } = createTree({
        'nx.json': JSON.stringify({ plugins: [] }),
      })

      await initGenerator(tree, {})
      // Second run on the same tree
      await initGenerator(tree, {})

      const nxJson = readJson(files, 'nx.json')
      const plugins = nxJson.plugins as unknown[]
      expect(plugins).toHaveLength(1)
    })

    it('respects custom pluginPath', async () => {
      const { tree, files } = createTree({
        'nx.json': JSON.stringify({ plugins: [] }),
      })

      await initGenerator(tree, { pluginPath: './packages/typescript-preset/src/plugin.ts' })

      const nxJson = readJson(files, 'nx.json')
      const plugins = nxJson.plugins as unknown[]
      const entry = plugins[0] as { plugin: string }
      expect(entry.plugin).toBe('./packages/typescript-preset/src/plugin.ts')
    })
  })

  describe('config detection', () => {
    it('detects tsconfig.json and reports typecheck target', async () => {
      const { tree } = createTree({
        'nx.json': JSON.stringify({ plugins: [] }),
        'tsconfig.json': JSON.stringify({ compilerOptions: {} }),
        'package.json': JSON.stringify({ name: 'test', version: '0.0.0' }),
      })

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await initGenerator(tree, {})

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n')
      expect(output).toContain('typecheck')
      consoleSpy.mockRestore()
    })

    it('detects vitest.config.ts and reports test targets', async () => {
      const { tree } = createTree({
        'nx.json': JSON.stringify({ plugins: [] }),
        'vitest.config.ts': 'export default {}',
        'package.json': JSON.stringify({ name: 'test', version: '0.0.0' }),
      })

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await initGenerator(tree, {})

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n')
      expect(output).toContain('test')
      consoleSpy.mockRestore()
    })

    it('detects .oxlintrc.json and reports lint target', async () => {
      const { tree } = createTree({
        'nx.json': JSON.stringify({ plugins: [] }),
        '.oxlintrc.json': JSON.stringify({ plugins: ['oxc'] }),
        'package.json': JSON.stringify({ name: 'test', version: '0.0.0' }),
      })

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await initGenerator(tree, {})

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n')
      expect(output).toContain('lint')
      consoleSpy.mockRestore()
    })

    it('detects biome.json and reports format targets', async () => {
      const { tree } = createTree({
        'nx.json': JSON.stringify({ plugins: [] }),
        'biome.json': JSON.stringify({ linter: { enabled: true } }),
        'package.json': JSON.stringify({ name: 'test', version: '0.0.0' }),
      })

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await initGenerator(tree, {})

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n')
      expect(output).toContain('format')
      consoleSpy.mockRestore()
    })

    it('detects tsdown.config.ts and reports build target', async () => {
      const { tree } = createTree({
        'nx.json': JSON.stringify({ plugins: [] }),
        'tsdown.config.ts': 'export default {}',
        'package.json': JSON.stringify({ name: 'test', version: '0.0.0' }),
      })

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await initGenerator(tree, {})

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n')
      expect(output).toContain('build')
      consoleSpy.mockRestore()
    })

    it('detects nested project config files', async () => {
      const { tree } = createTree({
        'nx.json': JSON.stringify({ plugins: [] }),
        'package.json': JSON.stringify({ name: 'test', version: '0.0.0' }),
        'packages/my-pkg/package.json': JSON.stringify({ name: '@test/my-pkg', version: '0.0.0' }),
        'packages/my-pkg/tsconfig.json': JSON.stringify({ compilerOptions: {} }),
        'packages/my-pkg/tsdown.config.ts': 'export default {}',
        'packages/my-pkg/.oxlintrc.json': JSON.stringify({ plugins: ['oxc'] }),
      })

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await initGenerator(tree, {})

      const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n')
      expect(output).toContain('packages/my-pkg')
      consoleSpy.mockRestore()
    })
  })

  describe('dependency installation', () => {
    it('adds missing peer deps to package.json based on detected configs', async () => {
      const { tree, files } = createTree({
        'nx.json': JSON.stringify({ plugins: [] }),
        'package.json': JSON.stringify({
          name: 'test',
          version: '0.0.0',
          devDependencies: {},
        }),
        'tsconfig.json': JSON.stringify({ compilerOptions: {} }),
        'tsdown.config.ts': 'export default {}',
        '.oxlintrc.json': JSON.stringify({}),
        'biome.json': JSON.stringify({}),
        'vitest.config.ts': 'export default {}',
      })

      await initGenerator(tree, {})

      const pkg = readJson(files, 'package.json')
      const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>
      expect(devDeps.tsdown).toBeDefined()
      expect(devDeps.oxlint).toBeDefined()
      expect(devDeps['@biomejs/biome']).toBeDefined()
      expect(devDeps.vitest).toBeDefined()
    })

    it('does not add deps for tools whose config files are absent', async () => {
      const { tree, files } = createTree({
        'nx.json': JSON.stringify({ plugins: [] }),
        'package.json': JSON.stringify({
          name: 'test',
          version: '0.0.0',
          devDependencies: {},
        }),
        'tsconfig.json': JSON.stringify({ compilerOptions: {} }),
      })

      await initGenerator(tree, {})

      const pkg = readJson(files, 'package.json')
      const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>
      expect(devDeps.tsdown).toBeUndefined()
      expect(devDeps.oxlint).toBeUndefined()
      expect(devDeps['@biomejs/biome']).toBeUndefined()
      expect(devDeps.vitest).toBeUndefined()
    })

    it('does not duplicate deps that are already installed', async () => {
      const { tree, files } = createTree({
        'nx.json': JSON.stringify({ plugins: [] }),
        'package.json': JSON.stringify({
          name: 'test',
          version: '0.0.0',
          devDependencies: { tsdown: '^0.22.3', vitest: '^4.1.9' },
        }),
        'tsdown.config.ts': 'export default {}',
        'vitest.config.ts': 'export default {}',
      })

      await initGenerator(tree, {})

      const pkg = readJson(files, 'package.json')
      const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>
      expect(devDeps.tsdown).toBe('^0.22.3')
      expect(devDeps.vitest).toBe('^4.1.9')
    })
  })

  describe('package.json creation', () => {
    it('creates a minimal package.json if none exists', async () => {
      const { tree, files } = createTree({
        'nx.json': JSON.stringify({ plugins: [] }),
      })

      await initGenerator(tree, {})

      expect(files.has('package.json')).toBe(true)
      const pkg = readJson(files, 'package.json')
      expect(pkg.name).toBeDefined()
      expect(pkg.version).toBeDefined()
    })
  })
})
