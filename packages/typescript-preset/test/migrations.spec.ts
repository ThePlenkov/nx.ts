import { describe, expect, it } from 'vitest'
import {
  addProjectConfiguration,
  readProjectConfiguration,
  type ProjectConfiguration,
  type Tree,
} from '@nx/devkit'
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing'
import replaceTypecheckExecutor from '../src/migrations/update-1-0-0/replace-typecheck-executor.js'
import replaceBuildExecutor from '../src/migrations/update-1-0-0/replace-build-executor.js'

function addProject(
  tree: Tree,
  name: string,
  root: string,
  targets: ProjectConfiguration['targets'],
): void {
  addProjectConfiguration(tree, name, {
    name,
    root,
    projectType: 'library',
    targets,
  })
}

function runCommands(command: string, extra: Record<string, unknown> = {}) {
  return {
    executor: 'nx:run-commands',
    options: { command, ...extra },
  }
}

describe('replaceTypecheckExecutor', () => {
  it('migrates a typecheck run-commands target with explicit project-root cwd', () => {
    const tree = createTreeWithEmptyWorkspace()
    addProject(tree, 'lib', 'packages/lib', {
      typecheck: runCommands('tsgo --build tsconfig.json', { cwd: '{projectRoot}' }),
    })

    replaceTypecheckExecutor(tree)

    const target = readProjectConfiguration(tree, 'lib').targets?.typecheck
    expect(target?.executor).toBe('@nx-devkit/typescript:typecheck')
    expect(target?.options).toEqual({ tsgo: true, configFile: 'tsconfig.json', clean: false })
  })

  it('migrates a single-entry commands array form', () => {
    const tree = createTreeWithEmptyWorkspace()
    addProject(tree, 'lib', 'packages/lib', {
      typecheck: {
        executor: 'nx:run-commands',
        options: { commands: [{ command: 'tsc --build tsconfig.json' }], cwd: 'packages/lib' },
      },
    })

    replaceTypecheckExecutor(tree)

    const target = readProjectConfiguration(tree, 'lib').targets?.typecheck
    expect(target?.executor).toBe('@nx-devkit/typescript:typecheck')
    expect(target?.options).toEqual({ tsgo: false, configFile: 'tsconfig.json', clean: false })
  })

  it('skips multi-command targets the executor cannot represent', () => {
    const tree = createTreeWithEmptyWorkspace()
    addProject(tree, 'lib', 'packages/lib', {
      typecheck: {
        executor: 'nx:run-commands',
        options: {
          commands: [{ command: 'tsc --build tsconfig.json' }, { command: 'echo done' }],
          cwd: '{projectRoot}',
        },
      },
    })

    replaceTypecheckExecutor(tree)

    expect(readProjectConfiguration(tree, 'lib').targets?.typecheck.executor).toBe(
      'nx:run-commands',
    )
  })

  it('skips targets with unset cwd on nested projects (was workspace root)', () => {
    const tree = createTreeWithEmptyWorkspace()
    addProject(tree, 'lib', 'packages/lib', {
      typecheck: runCommands('tsc --build tsconfig.json'),
    })

    replaceTypecheckExecutor(tree)

    expect(readProjectConfiguration(tree, 'lib').targets?.typecheck.executor).toBe(
      'nx:run-commands',
    )
  })

  it('skips targets whose cwd differs from the project root', () => {
    const tree = createTreeWithEmptyWorkspace()
    addProject(tree, 'lib', 'packages/lib', {
      typecheck: runCommands('tsc --build tsconfig.json', { cwd: 'packages/other' }),
    })

    replaceTypecheckExecutor(tree)

    expect(readProjectConfiguration(tree, 'lib').targets?.typecheck.executor).toBe(
      'nx:run-commands',
    )
  })

  it('migrates a workspace-root project with unset cwd', () => {
    const tree = createTreeWithEmptyWorkspace()
    addProject(tree, 'root', '.', {
      typecheck: runCommands('tsc --build tsconfig.json'),
    })

    replaceTypecheckExecutor(tree)

    expect(readProjectConfiguration(tree, 'root').targets?.typecheck.executor).toBe(
      '@nx-devkit/typescript:typecheck',
    )
  })

  it('maps --clean to the clean option', () => {
    const tree = createTreeWithEmptyWorkspace()
    addProject(tree, 'lib', 'packages/lib', {
      typecheck: runCommands('tsc --build --clean tsconfig.build.json', { cwd: '{projectRoot}' }),
    })

    replaceTypecheckExecutor(tree)

    expect(readProjectConfiguration(tree, 'lib').targets?.typecheck.options).toEqual({
      tsgo: false,
      configFile: 'tsconfig.build.json',
      clean: true,
    })
  })

  it('skips shell composition', () => {
    const tree = createTreeWithEmptyWorkspace()
    addProject(tree, 'lib', 'packages/lib', {
      typecheck: runCommands('tsc --build tsconfig.json && echo ok', { cwd: '{projectRoot}' }),
    })

    replaceTypecheckExecutor(tree)

    expect(readProjectConfiguration(tree, 'lib').targets?.typecheck.executor).toBe(
      'nx:run-commands',
    )
  })

  it.each([
    'tsc --build $CONFIG.json',
    'tsc --build *.json',
    'tsc --build `echo tsconfig.json`',
    'tsc --build "tsconfig.json"',
    'tsc --build -foo.json',
    'tsc --build /abs/tsconfig.json',
  ])('skips non-literal config token: %s', (command) => {
    const tree = createTreeWithEmptyWorkspace()
    addProject(tree, 'lib', 'packages/lib', {
      typecheck: runCommands(command, { cwd: '{projectRoot}' }),
    })

    replaceTypecheckExecutor(tree)

    expect(readProjectConfiguration(tree, 'lib').targets?.typecheck.executor).toBe(
      'nx:run-commands',
    )
  })
})

describe('replaceBuildExecutor', () => {
  it('migrates a plain tsdown build target', () => {
    const tree = createTreeWithEmptyWorkspace()
    addProject(tree, 'lib', 'packages/lib', {
      build: runCommands('tsdown', { cwd: '{projectRoot}' }),
    })

    replaceBuildExecutor(tree)

    const target = readProjectConfiguration(tree, 'lib').targets?.build
    expect(target?.executor).toBe('@nx-devkit/typescript:build')
    expect(target?.options).toEqual({})
  })

  it('migrates tsdown --watch and disables cache', () => {
    const tree = createTreeWithEmptyWorkspace()
    addProject(tree, 'lib', 'packages/lib', {
      build: { ...runCommands('tsdown --watch', { cwd: '{projectRoot}' }), cache: true },
    })

    replaceBuildExecutor(tree)

    const target = readProjectConfiguration(tree, 'lib').targets?.build
    expect(target?.executor).toBe('@nx-devkit/typescript:build')
    expect(target?.options).toEqual({ watch: true })
    expect(target?.cache).toBe(false)
  })

  it('migrates a build:watch target to the build executor with watch', () => {
    const tree = createTreeWithEmptyWorkspace()
    addProject(tree, 'lib', 'packages/lib', {
      'build:watch': runCommands('tsdown', { cwd: '{projectRoot}' }),
    })

    replaceBuildExecutor(tree)

    const target = readProjectConfiguration(tree, 'lib').targets?.['build:watch']
    expect(target?.executor).toBe('@nx-devkit/typescript:build')
    expect(target?.options).toEqual({ watch: true })
    expect(target?.cache).toBe(false)
  })

  it('skips build targets with unset cwd on nested projects', () => {
    const tree = createTreeWithEmptyWorkspace()
    addProject(tree, 'lib', 'packages/lib', {
      build: runCommands('tsdown'),
    })

    replaceBuildExecutor(tree)

    expect(readProjectConfiguration(tree, 'lib').targets?.build.executor).toBe('nx:run-commands')
  })

  it('skips unrecognized tsdown invocations', () => {
    const tree = createTreeWithEmptyWorkspace()
    addProject(tree, 'lib', 'packages/lib', {
      build: runCommands('tsdown --config custom.ts', { cwd: '{projectRoot}' }),
    })

    replaceBuildExecutor(tree)

    expect(readProjectConfiguration(tree, 'lib').targets?.build.executor).toBe('nx:run-commands')
  })
})
