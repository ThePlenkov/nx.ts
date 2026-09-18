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
})
