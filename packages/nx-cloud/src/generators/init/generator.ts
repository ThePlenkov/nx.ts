import type { GeneratorCallback, Tree } from '@nx/devkit'
import { applyEdits, modify } from 'jsonc-parser'
import { detectIndent, parseJsonObject } from '../../jsonc.ts'

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
  return parseJsonObject(text, path)
}

function registerPlugin(tree: Tree, pluginPath: string): void {
  const text = tree.exists('nx.json') ? tree.read('nx.json', 'utf8') : null
  const nxJson = text == null ? {} : parseJsonObject(text, 'nx.json')
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

  const entry = { options: {}, plugin: pluginPath }
  if (text == null) {
    tree.write('nx.json', `${JSON.stringify({ plugins: [entry] }, null, 2)}\n`)
    return
  }
  const formattingOptions = detectIndent(text)
  const updated = applyEdits(
    text,
    modify(
      text,
      Array.isArray(nxJson.plugins) ? ['plugins', plugins.length] : ['plugins'],
      Array.isArray(nxJson.plugins) ? entry : [entry],
      { formattingOptions, isArrayInsertion: true },
    ),
  )
  tree.write('nx.json', updated)
}

function resolveRootProjectName(tree: Tree): string | undefined {
  // Nx names the root project from project.json, then nx.json, then package.json.
  for (const path of ['project.json', 'nx.json', 'package.json']) {
    const name = readJson(tree, path)?.name
    if (typeof name === 'string' && name) {
      return name
    }
  }
  return undefined
}

export async function initGenerator(
  tree: Tree,
  options: NxCloudInitOptions = {},
): Promise<GeneratorCallback> {
  const pluginPath = options.pluginPath ?? DEFAULT_PLUGIN_PATH
  const projectName = resolveRootProjectName(tree) ?? '{root-project}'

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
