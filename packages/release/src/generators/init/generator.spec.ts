import { describe, it, expect, beforeEach } from 'vitest'
import type { Tree } from '@nx/devkit'
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
    const dir = path.split('/').slice(0, -1).join('/')
    if (dir && !this.exists(dir)) {
      // mkdir -p
      const parts = dir.split('/')
      let cur = ''
      for (const part of parts) {
        cur = cur ? `${cur}/${part}` : part
        if (!this.exists(cur)) this.files.set(`${cur}/`, '')
      }
    }
    this.files.set(path, content)
  }
}

function createTree(): MemTree {
  return new MemTree()
}

describe('initGenerator', () => {
  beforeEach(() => {
    // noop
  })

  it('creates tools project with release target', async () => {
    const tree = createTree()
    tree.write('package.json', JSON.stringify({ name: '@test/monorepo' }))
    tree.write('nx.json', JSON.stringify({}))

    await initGenerator(tree as unknown as Tree, { packagePath: 'packages/cli' })

    expect(tree.exists('tools/project.json')).toBe(true)
    const projectJson = JSON.parse(tree.read('tools/project.json') ?? '{}')
    expect(projectJson.targets.release.executor).toBe('@nx-devkit/release:publish')
    expect(projectJson.targets.release.options.packagePath).toBe('packages/cli')
  })

  it('registers the plugin in nx.json', async () => {
    const tree = createTree()
    tree.write('package.json', JSON.stringify({ name: '@test/monorepo' }))
    tree.write('nx.json', JSON.stringify({}))

    await initGenerator(tree as unknown as Tree, {})

    const nxJson = JSON.parse(tree.read('nx.json') ?? '{}')
    const plugins = nxJson.plugins as Array<{ plugin: string }>
    expect(plugins.some((p) => p.plugin === '@nx-devkit/release')).toBe(true)
  })

  it('creates .github/workflows/release.yml', async () => {
    const tree = createTree()
    tree.write('package.json', JSON.stringify({ name: '@test/monorepo' }))
    tree.write('nx.json', JSON.stringify({}))

    await initGenerator(tree as unknown as Tree, { projectName: 'tools' })

    expect(tree.exists('.github/workflows/release.yml')).toBe(true)
    const workflow = tree.read('.github/workflows/release.yml') ?? ''
    expect(workflow).toContain('name: Release')
    expect(workflow).toContain('workflow_dispatch')
    expect(workflow).toContain('npx nx run tools:release')
    expect(workflow).toContain('contents: write')
    expect(workflow).toContain('id-token: write')
  })

  it('does not overwrite existing release.yml', async () => {
    const tree = createTree()
    tree.write('package.json', JSON.stringify({ name: '@test/monorepo' }))
    tree.write('nx.json', JSON.stringify({}))
    tree.write('.github/workflows/release.yml', 'custom workflow')

    await initGenerator(tree as unknown as Tree, {})

    const workflow = tree.read('.github/workflows/release.yml') ?? ''
    expect(workflow).toBe('custom workflow')
  })

  it('uses custom package name and path', async () => {
    const tree = createTree()
    tree.write('package.json', JSON.stringify({ name: '@test/monorepo' }))
    tree.write('nx.json', JSON.stringify({}))

    await initGenerator(tree as unknown as Tree, {
      packageName: '@my/custom-pkg',
      packagePath: 'apps/cli',
    })

    const projectJson = JSON.parse(tree.read('tools/project.json') ?? '{}')
    expect(projectJson.targets.release.options.packageName).toBe('@my/custom-pkg')
    expect(projectJson.targets.release.options.packagePath).toBe('apps/cli')
  })
})
