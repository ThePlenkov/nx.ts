import { beforeEach, describe, expect, it, vi } from 'vitest'

const execFileCalls: { command: string; args: string[] }[] = []
let fsExists: (path: string) => boolean = () => false

vi.mock('node:child_process', () => ({
  execFileSync: (command: string, args: string[]) => {
    execFileCalls.push({ args, command })
  },
}))

vi.mock('node:fs', () => ({
  existsSync: (path: string) => fsExists(path),
}))

const { main } = await import('../src/bin/init.js')

function installs(): string[][] {
  return execFileCalls
    .filter((c) => c.args.includes('install') || c.args.includes('add'))
    .map((c) => [c.command, ...c.args])
}

describe('init bin', () => {
  beforeEach(() => {
    execFileCalls.length = 0
    fsExists = () => false
    process.argv = ['node', 'init.mjs', 'init']
  })

  it('installs the plugin itself when absent from node_modules', async () => {
    // nx is present; @nx-devkit/typescript is not
    fsExists = (p) => p.includes('nx/package.json') && !p.includes('@nx-devkit')
    main()
    const install = installs()[0]
    expect(install).toBeDefined()
    expect(install).toContain('@nx-devkit/typescript')
  })

  it('installs nx, devkit, and the plugin when nx is absent', async () => {
    fsExists = () => false
    main()
    const all = installs().flat()
    expect(all).toContain('nx')
    expect(all).toContain('@nx/devkit')
    expect(all).toContain('@nx-devkit/typescript')
  })

  it('does not reinstall the plugin when already present', async () => {
    fsExists = () => true
    main()
    expect(installs()).toHaveLength(0)
  })

  it('uses bun add when bun.lock exists', async () => {
    fsExists = (p) => p.endsWith('bun.lock')
    main()
    const install = installs().find((c) => c[0] === 'bun')
    expect(install).toBeDefined()
    expect(install).toContain('@nx-devkit/typescript')
  })
})
