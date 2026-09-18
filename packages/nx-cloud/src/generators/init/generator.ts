import type { GeneratorCallback, Tree } from '@nx/devkit'

export interface NxCloudInitOptions {
  pluginPath?: string
}

const DEFAULT_PLUGIN_PATH = '@nx-devkit/nx-cloud'

function readJson(tree: Tree, path: string): Record<string, unknown> | null {
  if (!tree.exists(path)) {
    return null
  }
  const text = tree.read(path, 'utf8')
  if (text == null) {
    return null
  }
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch (error) {
    throw new Error(`Cannot parse ${path}: ${(error as Error).message}`, { cause: error })
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
      (Array.isArray(entry) && entry[0] === pluginPath) ||
      (typeof entry === 'object' &&
        entry !== null &&
        !Array.isArray(entry) &&
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
  options: NxCloudInitOptions = {},
): Promise<GeneratorCallback> {
  const pluginPath = options.pluginPath ?? DEFAULT_PLUGIN_PATH
  const rootProject = readJson(tree, 'package.json')?.name
  const projectName =
    typeof rootProject === 'string' && rootProject ? rootProject : '{root-project}'

  registerPlugin(tree, pluginPath)

  const checklist = [
    `1. The plugin is registered (${pluginPath}) — the root project now has an \`nx-cloud-rotate\` target.`,
    '2. Rotate the Nx Cloud organization when the quota is exhausted:',
    `   bunx nx run ${projectName}:nx-cloud-rotate`,
    '3. Commit the updated nx.json — CI then points at the fresh org.',
    '4. Delete the old organization manually at https://cloud.nx.app (no public API exists).',
  ]
  for (const line of checklist) {
    console.log(line)
  }

  return () => {
    /* No-op */
  }
}

export default initGenerator
