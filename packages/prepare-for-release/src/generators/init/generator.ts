import { type GeneratorCallback, type Tree, joinPathFragments } from '@nx/devkit'

export interface NxPrepareForReleaseInitOptions {
  projectName?: string
  pluginPath?: string
}

const DEFAULT_PROJECT_NAME = 'tools'
const DEFAULT_PLUGIN_PATH = '@nx-devkit/prepare-for-release'

function readJson(tree: Tree, path: string): Record<string, unknown> | null {
  if (!tree.exists(path)) {
    return null
  }
  try {
    return JSON.parse(tree.read(path, 'utf8') ?? '{}') as Record<string, unknown>
  } catch {
    return null
  }
}

function writeJson(tree: Tree, path: string, value: unknown): void {
  tree.write(path, `${JSON.stringify(value, null, 2)}\n`)
}

function ensureToolsProject(tree: Tree, projectName: string, pluginPath: string): void {
  const projectJsonPath = joinPathFragments(projectName, 'project.json')

  if (tree.exists(projectJsonPath)) {
    const existing = readJson(tree, projectJsonPath)
    if (existing) {
      const targets = (existing.targets ?? {}) as Record<string, Record<string, unknown>>
      if (!targets['prepare-for-release']) {
        targets['prepare-for-release'] = {
          executor: `${pluginPath}:publish-placeholder`,
          options: {},
        }
        existing.targets = targets
        writeJson(tree, projectJsonPath, existing)
      }
    }
    return
  }

  const project = {
    $schema: '../../node_modules/nx/schemas/project-schema.json',
    name: projectName,
    sourceRoot: `${projectName}`,
    targets: {
      'prepare-for-release': {
        executor: `${pluginPath}:publish-placeholder`,
        options: {},
      },
    },
  }

  writeJson(tree, projectJsonPath, project)
  tree.write(joinPathFragments(projectName, '.gitkeep'), '')
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
  options: NxPrepareForReleaseInitOptions = {},
): Promise<GeneratorCallback> {
  const projectName = options.projectName ?? DEFAULT_PROJECT_NAME
  const pluginPath = options.pluginPath ?? DEFAULT_PLUGIN_PATH

  registerPlugin(tree, pluginPath)
  ensureToolsProject(tree, projectName, pluginPath)

  const checklist = [
    '1. Install the plugin in the consuming workspace:',
    '   bun add -D @nx-devkit/prepare-for-release',
    '2. Run the bootstrap target to publish 0.0.0 placeholders:',
    `   nx run ${projectName}:prepare-for-release`,
    '3. For each published placeholder, run the corresponding `npm trust github` command printed by the executor (requires MFA).',
    '4. Wire OIDC trusted publishing in .github/workflows/release.yml (see the template shipped with this plugin).',
    '5. From then on, releases are automated via `nx release`.',
  ]
  for (const line of checklist) {
    console.log(line)
  }

  return () => {
    /* No-op */
  }
}

export default initGenerator
