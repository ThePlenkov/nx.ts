import type { Tree } from '@nx/devkit'
import { describe, expect, it } from 'vitest'
import { initGenerator } from './generator.ts'

class MemTree {
  private files = new Map<string, string>()

  exists(path: string): boolean {
    return this.files.has(path)
  }

  read(path: string): string | null {
    return this.files.get(path) ?? null
  }

  write(path: string, content: string): void {
    this.files.set(path, content)
  }
}

function createTree(): MemTree {
  const tree = new MemTree()
  tree.write('nx.json', JSON.stringify({}))
  return tree
}

async function captureLogs(run: () => Promise<unknown>): Promise<string[]> {
  const lines: string[] = []
  const original = console.log
  console.log = (msg: unknown) => {
    lines.push(String(msg))
  }
  try {
    await run()
  } finally {
    console.log = original
  }
  return lines
}

describe('initGenerator', () => {
  it('registers @nx-devkit/nx-cloud in nx.json plugins', async () => {
    const tree = createTree()

    await initGenerator(tree as unknown as Tree, {})

    const nxJson = JSON.parse(tree.read('nx.json') ?? '{}')
    const plugins = nxJson.plugins as Array<{ plugin: string }>
    expect(plugins.some((p) => p.plugin === '@nx-devkit/nx-cloud')).toBe(true)
  })

  it('does not duplicate the plugin entry on rerun', async () => {
    const tree = createTree()

    await initGenerator(tree as unknown as Tree, {})
    await initGenerator(tree as unknown as Tree, {})

    const nxJson = JSON.parse(tree.read('nx.json') ?? '{}')
    const plugins = nxJson.plugins as Array<{ plugin: string }>
    expect(plugins.filter((p) => p.plugin === '@nx-devkit/nx-cloud')).toHaveLength(1)
  })

  it('preserves existing plugin entries', async () => {
    const tree = createTree()
    tree.write('nx.json', JSON.stringify({ plugins: ['./packages/tsdown/src/plugin.ts'] }))

    await initGenerator(tree as unknown as Tree, {})

    const nxJson = JSON.parse(tree.read('nx.json') ?? '{}')
    const plugins = nxJson.plugins as unknown[]
    expect(plugins).toContain('./packages/tsdown/src/plugin.ts')
    expect(plugins).toHaveLength(2)
  })

  it('honors a custom pluginPath (e.g. local source registration)', async () => {
    const tree = createTree()

    await initGenerator(tree as unknown as Tree, {
      pluginPath: './packages/nx-cloud/src/plugin.ts',
    })

    const nxJson = JSON.parse(tree.read('nx.json') ?? '{}')
    const plugins = nxJson.plugins as Array<{ plugin: string }>
    expect(plugins.some((p) => p.plugin === './packages/nx-cloud/src/plugin.ts')).toBe(true)
  })

  it('does not duplicate a string-form plugin entry', async () => {
    const tree = createTree()
    tree.write('nx.json', JSON.stringify({ plugins: ['@nx-devkit/nx-cloud'] }))

    await initGenerator(tree as unknown as Tree, {})

    const nxJson = JSON.parse(tree.read('nx.json') ?? '{}')
    const plugins = nxJson.plugins as unknown[]
    expect(plugins).toEqual(['@nx-devkit/nx-cloud'])
  })

  it('creates nx.json when it is missing', async () => {
    const tree = new MemTree()

    await initGenerator(tree as unknown as Tree, {})

    const nxJson = JSON.parse(tree.read('nx.json') ?? '{}')
    const plugins = nxJson.plugins as Array<{ plugin: string }>
    expect(plugins.some((p) => p.plugin === '@nx-devkit/nx-cloud')).toBe(true)
  })

  it('prints the real root project name in the checklist', async () => {
    const tree = createTree()
    tree.write('package.json', JSON.stringify({ name: 'my-workspace' }))
    const lines = await captureLogs(async () => initGenerator(tree as unknown as Tree, {}))

    expect(lines.join('\n')).toContain('my-workspace:nx-cloud-rotate')
  })

  it('prints a custom pluginPath in the checklist', async () => {
    const tree = createTree()

    const lines = await captureLogs(async () =>
      initGenerator(tree as unknown as Tree, {
        pluginPath: './packages/nx-cloud/src/plugin.ts',
      }),
    )

    expect(lines.join('\n')).toContain('./packages/nx-cloud/src/plugin.ts')
  })

  it('prefers nx.json name over package.json name for the root project', async () => {
    const tree = createTree()
    tree.write('nx.json', JSON.stringify({ name: 'ws-name' }))
    tree.write('package.json', JSON.stringify({ name: 'pkg-name' }))

    const lines = await captureLogs(async () => initGenerator(tree as unknown as Tree, {}))

    expect(lines.join('\n')).toContain('ws-name:nx-cloud-rotate')
  })

  it('preserves comments and formatting in nx.json', async () => {
    const tree = new MemTree()
    tree.write('nx.json', '{\n  // keep me\n  "plugins": ["other-plugin"]\n}\n')

    await initGenerator(tree as unknown as Tree, {})

    expect(tree.read('nx.json')).toBe(
      '{\n  // keep me\n  "plugins": [\n    "other-plugin",\n    {\n      "options": {},\n      "plugin": "@nx-devkit/nx-cloud"\n    }\n  ]\n}\n',
    )
  })
})
