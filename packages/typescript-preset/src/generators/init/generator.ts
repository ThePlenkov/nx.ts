import { type GeneratorCallback, type Tree, addDependenciesToPackageJson } from '@nx/devkit'

export interface NxTypescriptInitOptions {
  pluginPath?: string
  /** Skip adding dependencies to package.json. Default: false. */
  skipInstall?: boolean
}

const DEFAULT_PLUGIN_PATH = '@nx-devkit/typescript'
const NX_DEVKIT_SCOPE = '@nx-devkit/'

function readJson(tree: Tree, path: string): Record<string, unknown> | null {
  if (!tree.exists(path)) {
    return null
  }
  const raw = tree.read(path, 'utf8')
  if (raw === null) return null
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch (error) {
    throw new Error(`Failed to parse ${path}`, { cause: error })
  }
}

function writeJson(tree: Tree, path: string, value: unknown): void {
  tree.write(path, `${JSON.stringify(value, null, 2)}\n`)
}

function getPluginName(entry: unknown): string | null {
  if (typeof entry === 'string') return entry
  if (typeof entry === 'object' && entry !== null) {
    const plugin = (entry as { plugin?: string }).plugin
    return typeof plugin === 'string' ? plugin : null
  }
  return null
}

function isNxDevkitStandalone(entry: unknown, presetPath: string): boolean {
  const name = getPluginName(entry)
  if (!name) return false
  if (name === presetPath) return false
  return name.startsWith(NX_DEVKIT_SCOPE)
}

function isPresetEntry(entry: unknown, presetPath: string): boolean {
  return getPluginName(entry) === presetPath
}

function registerPlugin(tree: Tree, pluginPath: string): void {
  const nxJson = readJson(tree, 'nx.json') ?? {}
  const plugins = Array.isArray(nxJson.plugins) ? (nxJson.plugins as unknown[]) : []

  // Remove @nx-devkit/* standalone entries (not the preset — it gets normalized)
  const filtered = plugins.filter((entry) => !isNxDevkitStandalone(entry, pluginPath))

  // Normalize or add the preset in object form
  const presetIndex = filtered.findIndex((entry) => isPresetEntry(entry, pluginPath))
  if (presetIndex >= 0) {
    filtered[presetIndex] = { options: {}, plugin: pluginPath }
  } else {
    filtered.push({ options: {}, plugin: pluginPath })
  }

  nxJson.plugins = filtered
  writeJson(tree, 'nx.json', nxJson)
}

function ensurePackageJson(tree: Tree): void {
  if (!tree.exists('package.json')) {
    writeJson(tree, 'package.json', {
      name: 'workspace',
      version: '0.0.0',
      private: true,
    })
  }
}

// --- Config detection ---

const CONFIG_FILES: Record<string, string[]> = {
  tsconfig: ['tsconfig.json'],
  vitest: [
    'vitest.config.ts',
    'vitest.config.js',
    'vitest.config.mts',
    'vitest.config.mjs',
    'vitest.config.cts',
    'vitest.config.cjs',
  ],
  oxlint: [
    '.oxlintrc.json',
    '.oxlintrc.jsonc',
    '.oxlintrc.yaml',
    '.oxlintrc.yml',
    '.oxlintrc.js',
    '.oxlintrc.mjs',
    '.oxlintrc.cjs',
    '.oxlintrc.ts',
    '.oxlintrc.mts',
    '.oxlintrc.cts',
  ],
  biome: ['biome.json', 'biome.jsonc'],
  tsdown: [
    'tsdown.config.ts',
    'tsdown.config.js',
    'tsdown.config.mts',
    'tsdown.config.mjs',
    'tsdown.config.cts',
    'tsdown.config.cjs',
  ],
}

interface DetectedConfigs {
  tsconfig: boolean
  vitest: boolean
  oxlint: boolean
  biome: boolean
  tsdown: boolean
}

function detectConfigsAtRoot(tree: Tree): DetectedConfigs {
  const result: DetectedConfigs = {
    tsconfig: false,
    vitest: false,
    oxlint: false,
    biome: false,
    tsdown: false,
  }
  for (const [key, files] of Object.entries(CONFIG_FILES)) {
    result[key as keyof DetectedConfigs] = files.some((f) => tree.exists(f))
  }
  return result
}

function detectConfigsAtProjectRoot(tree: Tree, projectRoot: string): DetectedConfigs {
  const result: DetectedConfigs = {
    tsconfig: false,
    vitest: false,
    oxlint: false,
    biome: false,
    tsdown: false,
  }
  const prefix = projectRoot.endsWith('/') ? projectRoot : `${projectRoot}/`
  for (const [key, files] of Object.entries(CONFIG_FILES)) {
    result[key as keyof DetectedConfigs] = files.some((f) => tree.exists(`${prefix}${f}`))
  }
  return result
}

function findNestedProjectRoots(tree: Tree): string[] {
  const roots: string[] = []

  // Try common monorepo directory patterns
  const commonDirs = ['packages', 'apps', 'libs', 'projects']
  for (const dir of commonDirs) {
    if (!tree.exists(dir) && !tree.children) continue
    try {
      const children = tree.children(dir)
      for (const child of children) {
        const childPath = `${dir}/${child}`
        // A project root is a directory with a package.json or tsconfig.json
        if (tree.exists(`${childPath}/package.json`) || tree.exists(`${childPath}/tsconfig.json`)) {
          roots.push(childPath)
        }
      }
    } catch {
      // Tree might not support children — skip
    }
  }

  return roots
}

// --- Dependency installation ---

const DEP_VERSIONS: Record<string, string> = {
  tsdown: '^0.22.3',
  oxlint: '^1.0.0',
  '@biomejs/biome': '^2.0.0',
  vitest: '^4.1.9',
  typescript: '^6.0.3',
}

function getMissingDevDeps(
  tree: Tree,
  configs: DetectedConfigs[],
): Record<string, string> {
  const pkg = readJson(tree, 'package.json') ?? {}
  const existing = {
    ...(pkg.dependencies as Record<string, string> | undefined),
    ...(pkg.devDependencies as Record<string, string> | undefined),
  }

  const hasAny = (key: keyof DetectedConfigs) => configs.some((c) => c[key])
  const needed: Record<string, string> = {}

  if (hasAny('tsdown') && !('tsdown' in existing)) needed['tsdown'] = DEP_VERSIONS['tsdown']
  if (hasAny('oxlint') && !('oxlint' in existing)) needed['oxlint'] = DEP_VERSIONS['oxlint']
  if (hasAny('biome') && !('@biomejs/biome' in existing)) needed['@biomejs/biome'] = DEP_VERSIONS['@biomejs/biome']
  if (hasAny('vitest') && !('vitest' in existing)) needed['vitest'] = DEP_VERSIONS['vitest']
  if (hasAny('tsconfig') && !('typescript' in existing)) needed['typescript'] = DEP_VERSIONS['typescript']

  return needed
}

// --- Summary printing ---

function targetLabel(configs: DetectedConfigs): string[] {
  const targets: string[] = []
  if (configs.tsconfig) targets.push('typecheck')
  if (configs.vitest) targets.push('test', 'test:watch', 'test:coverage')
  if (configs.oxlint) targets.push('lint')
  if (configs.biome) {
    targets.push('format', 'format-check')
    if (!configs.oxlint) targets.push('lint')
  }
  if (configs.tsdown) targets.push('build', 'build:watch')
  return targets
}

function printSummary(
  pluginPath: string,
  rootConfigs: DetectedConfigs,
  projectConfigs: Array<{ root: string; configs: DetectedConfigs }>,
  installedDeps: Record<string, string>,
): void {
  const isLocalPath = pluginPath.startsWith('.') || pluginPath.startsWith('/')
  const installStep = isLocalPath
    ? `1. The plugin is registered from a local path: ${pluginPath}`
    : `1. Install the plugin: bun add -D ${pluginPath}`

  console.log(installStep)
  console.log('')
  console.log('Detected projects and inferred targets:')

  const rootTargets = targetLabel(rootConfigs)
  if (rootTargets.length > 0) {
    console.log(`  . (workspace root) → ${rootTargets.join(', ')}`)
  }

  for (const { root, configs } of projectConfigs) {
    const targets = targetLabel(configs)
    if (targets.length > 0) {
      console.log(`  ${root} → ${targets.join(', ')}`)
    }
  }

  console.log('')
  console.log('The preset auto-detects config files and infers targets:')
  console.log('  tsconfig.json     → typecheck (tsgo or tsc)')
  console.log('  vitest.config.*   → test, test:watch, test:coverage')
  console.log('  *.test.ts/spec.ts → test (native node --test, no vitest config needed)')
  console.log('  .oxlintrc.*       → lint (oxlint, highest precedence)')
  console.log('  eslint.config.*   → lint (eslint, fallback)')
  console.log('  biome.json        → format, format-check, lint (fallback)')
  console.log('  tsdown.config.*   → build, build:watch')
  console.log('')
  console.log('No project.json needed — targets are inferred from config files.')

  if (Object.keys(installedDeps).length > 0) {
    console.log('')
    console.log('Added devDependencies:')
    for (const [name, version] of Object.entries(installedDeps)) {
      console.log(`  ${name}: ${version}`)
    }
    console.log('Run `bun install` to install them.')
  }
}

export async function initGenerator(
  tree: Tree,
  options: NxTypescriptInitOptions = {},
): Promise<GeneratorCallback> {
  const pluginPath = options.pluginPath ?? DEFAULT_PLUGIN_PATH
  const skipInstall = options.skipInstall ?? false

  // 1. Ensure package.json exists
  ensurePackageJson(tree)

  // 2. Register plugin (removes standalone @nx-devkit/* entries)
  registerPlugin(tree, pluginPath)

  // 3. Detect configs at workspace root
  const rootConfigs = detectConfigsAtRoot(tree)

  // 4. Detect configs in nested project directories
  const nestedRoots = findNestedProjectRoots(tree)
  const projectConfigs: Array<{ root: string; configs: DetectedConfigs }> = []
  for (const root of nestedRoots) {
    const configs = detectConfigsAtProjectRoot(tree, root)
    if (Object.values(configs).some(Boolean)) {
      projectConfigs.push({ root, configs })
    }
  }

  // 5. Install missing peer deps
  let installedDeps: Record<string, string> = {}
  let installCallback: GeneratorCallback = () => {}

  if (!skipInstall) {
    const allConfigs = [rootConfigs, ...projectConfigs.map((p) => p.configs)]
    installedDeps = getMissingDevDeps(tree, allConfigs)

    if (Object.keys(installedDeps).length > 0) {
      installCallback = await addDependenciesToPackageJson(tree, {}, installedDeps)
    }
  }

  // 6. Print summary
  printSummary(pluginPath, rootConfigs, projectConfigs, installedDeps)

  return () => {
    installCallback()
  }
}

export default initGenerator
