import type { GeneratorCallback, Tree } from '@nx/devkit'

export interface NxTypescriptInitOptions {
  pluginPath?: string
}

const DEFAULT_PLUGIN_PATH = '@nx-devkit/typescript'

function readJson(tree: Tree, path: string): Record<string, unknown> | null {
  if (!tree.exists(path)) {
    return null
  }
  const raw = tree.read(path, 'utf8')
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch (error) {
    throw new Error(`Failed to parse ${path}`, { cause: error })
  }
}

function writeJson(tree: Tree, path: string, value: unknown): void {
  tree.write(path, `${JSON.stringify(value, null, 2)}\n`)
}

function registerPlugin(tree: Tree, pluginPath: string): void {
  const nxJson = readJson(tree, 'nx.json') ?? {}
  const plugins = Array.isArray(nxJson.plugins) ? (nxJson.plugins as unknown[]) : []
  const alreadyRegistered = plugins.some(
    (entry) =>
      (typeof entry === 'string' && entry === pluginPath) ||
      (typeof entry === 'object' &&
        entry !== null &&
        (entry as { plugin?: string }).plugin === pluginPath),
  )
  if (alreadyRegistered) {
    return
  }

  plugins.push({ options: {}, plugin: pluginPath })
  nxJson.plugins = plugins
  writeJson(tree, 'nx.json', nxJson)
}

export async function initGenerator(
  tree: Tree,
  options: NxTypescriptInitOptions = {},
): Promise<GeneratorCallback> {
  const pluginPath = options.pluginPath ?? DEFAULT_PLUGIN_PATH

  registerPlugin(tree, pluginPath)

  const isLocalPath = pluginPath.startsWith('.') || pluginPath.startsWith('/')
  const installStep = isLocalPath
    ? `1. The plugin is registered from a local path: ${pluginPath}`
    : `1. Install the plugin in the consuming workspace:\n   bun add -D ${pluginPath}`

  const checklist = [
    installStep,
    '2. The plugin auto-detects tsconfig.json files and infers:',
    '   - typecheck (tsgo --build)',
    '   - test (vitest or native Node test runner)',
    '   - test:watch (vitest only, when vitest.config.* exists)',
    '   - test:coverage (vitest or native, when coverage:true or vitest config exists)',
    '   - test:tap (native only, when tap:true)',
    '   - lint (oxlint > eslint > biome)',
    '   - format / format-check (biome)',
    '   - build / build:watch (tsdown)',
    '3. No project.json needed — targets are inferred from config files.',
  ]
  for (const line of checklist) {
    console.log(line)
  }

  return () => {
    /* No-op */
  }
}

export default initGenerator
