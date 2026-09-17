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
  if (Array.isArray(entry) && typeof entry[0] === 'string') {
    // Nx supports the tuple form [plugin, options]
    return entry[0]
  }
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

function getPluginOptions(entry: unknown): Record<string, unknown> {
  if (Array.isArray(entry) && typeof entry[1] === 'object' && entry[1] !== null) {
    return entry[1] as Record<string, unknown>
  }
  if (typeof entry === 'object' && entry !== null) {
    const options = (entry as { options?: unknown }).options
    if (typeof options === 'object' && options !== null) {
      return options as Record<string, unknown>
    }
  }
  return {}
}

function registerPlugin(tree: Tree, pluginPath: string): Record<string, unknown> {
  const nxJson = readJson(tree, 'nx.json') ?? {}
  const plugins = Array.isArray(nxJson.plugins) ? (nxJson.plugins as unknown[]) : []

  // Remove @nx-devkit/* standalone entries (not the preset — it gets normalized)
  const filtered = plugins.filter((entry) => !isNxDevkitStandalone(entry, pluginPath))

  // Normalize or add the preset in object form, preserving existing options
  const presetIndex = filtered.findIndex((entry) => isPresetEntry(entry, pluginPath))
  // eslint-disable-next-line security/detect-object-injection -- index is a bounded findIndex result
  const existingOptions = presetIndex >= 0 ? getPluginOptions(filtered[presetIndex]) : {}
  const presetEntry = { options: existingOptions, plugin: pluginPath }
  if (presetIndex >= 0) {
    // eslint-disable-next-line security/detect-object-injection -- index is a bounded findIndex result
    filtered[presetIndex] = presetEntry
  } else {
    filtered.push(presetEntry)
  }

  nxJson.plugins = filtered
  writeJson(tree, 'nx.json', nxJson)
  return existingOptions
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
  eslint: [
    'eslint.config.js',
    'eslint.config.mjs',
    'eslint.config.cjs',
    'eslint.config.ts',
    'eslint.config.mts',
    'eslint.config.cts',
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
  eslint: boolean
  biome: boolean
  tsdown: boolean
  tests: boolean
}

// Keep in sync with the preset's default testGlob/specGlob
// (**/*.{test,spec}.{ts,js,mts,mjs}) — cts/cjs files are not detected
// as native test targets by the plugin, so init must not report them.
const TEST_FILE_PATTERN = /\.(test|spec)\.(ts|js|mts|mjs)$/
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage'])

function detectConfigs(
  tree: Tree,
  files: Record<string, string[]>,
  prefix: string,
): DetectedConfigs {
  const result: DetectedConfigs = {
    tsconfig: false,
    vitest: false,
    oxlint: false,
    eslint: false,
    biome: false,
    tsdown: false,
    tests: false,
  }
  for (const [key, names] of Object.entries(files)) {
    result[key as keyof DetectedConfigs] = names.some((f) => tree.exists(`${prefix}${f}`))
  }
  return result
}

function hasTestFiles(
  tree: Tree,
  dir: string,
  depth = 0,
  extraSkip: ReadonlySet<string> = new Set(),
): boolean {
  if (depth > 6) return false
  const normalized = dir === '' ? '.' : dir
  let children: string[]
  try {
    children = tree.children(normalized)
  } catch {
    return false
  }
  for (const child of children) {
    if (SKIP_DIRS.has(child) || (depth === 0 && extraSkip.has(child))) continue
    const path = dir === '' ? child : `${dir}/${child}`
    if (TEST_FILE_PATTERN.test(child) && tree.exists(path)) return true
    if (hasTestFiles(tree, path, depth + 1, extraSkip)) return true
  }
  return false
}

const PROJECT_CONTAINER_DIRS = new Set(['packages', 'apps', 'libs', 'projects'])

function detectConfigsAtRoot(tree: Tree, configFile = 'tsconfig.json'): DetectedConfigs {
  const result = detectConfigs(tree, { ...CONFIG_FILES, tsconfig: [configFile] }, '')
  // Scan root for test files but skip the project container dirs — their
  // tests belong to the nested projects, not the root.
  result.tests = hasTestFiles(tree, '', 0, PROJECT_CONTAINER_DIRS)
  return result
}

function detectConfigsAtProjectRoot(
  tree: Tree,
  projectRoot: string,
  configFile = 'tsconfig.json',
): DetectedConfigs {
  const prefix = projectRoot.endsWith('/') ? projectRoot : `${projectRoot}/`
  const result = detectConfigs(tree, { ...CONFIG_FILES, tsconfig: [configFile] }, prefix)
  result.tests = hasTestFiles(tree, projectRoot)
  return result
}

function findNestedProjectRoots(
  tree: Tree,
  dir: string,
  depth: number,
  roots: string[],
  configFile = 'tsconfig.json',
): void {
  if (depth > 4) return
  let children: string[]
  try {
    children = tree.children(dir)
  } catch {
    return
  }
  for (const child of children) {
    if (SKIP_DIRS.has(child)) continue
    const childPath = `${dir}/${child}`
    // A project root is a directory with a package.json or the configured
    // tsconfig name — the preset infers a project from either signal.
    if (tree.exists(`${childPath}/package.json`) || tree.exists(`${childPath}/${configFile}`)) {
      roots.push(childPath)
    }
    findNestedProjectRoots(tree, childPath, depth + 1, roots, configFile)
  }
}

// Mirrors the preset's nested-project check: the plugin glob matches
// config files in ANY directory at ANY depth, not only the container
// dirs scanned above — a tools/tsconfig.json suppresses root inference
// just the same. Skipped dirs never become projects and must not count
// either. Deliberately unbounded: a depth cap would diverge from the
// plugin and misreport root targets in the summary.
function hasNestedConfigFile(tree: Tree, fileName: string, dir = ''): boolean {
  let children: string[]
  try {
    children = tree.children(dir === '' ? '.' : dir)
  } catch {
    return false
  }
  for (const child of children) {
    if (SKIP_DIRS.has(child)) continue
    const path = dir === '' ? child : `${dir}/${child}`
    if (dir !== '' && child === fileName && tree.exists(path)) return true
    if (hasNestedConfigFile(tree, fileName, path)) return true
  }
  return false
}

// --- Dependency installation ---

const DEP_VERSIONS: Record<string, string> = {
  tsdown: '^0.22.3',
  oxlint: '^1.0.0',
  eslint: '^9.0.0',
  '@biomejs/biome': '^2.0.0',
  vitest: '^4.1.9',
  typescript: '^6.0.3',
  '@typescript/native-preview': '^7.0.0-dev.20260621.1',
}

function getMissingDevDeps(
  tree: Tree,
  configs: DetectedConfigs[],
  presetOptions: Record<string, unknown> = {},
): Record<string, string> {
  const pkg = readJson(tree, 'package.json') ?? {}
  const existing = {
    ...(pkg.dependencies as Record<string, string> | undefined),
    ...(pkg.devDependencies as Record<string, string> | undefined),
  }

  // eslint-disable-next-line security/detect-object-injection -- key is a DetectedConfigs union member
  const hasAny = (key: keyof DetectedConfigs) => configs.some((c) => c[key])
  const needed: Record<string, string> = {}

  // Default `tsgo: true` typecheck runs the tsgo binary from
  // @typescript/native-preview — install it alongside typescript so a
  // freshly bootstrapped workspace's typecheck target works.
  const DEP_RULES: ReadonlyArray<{
    when: keyof DetectedConfigs
    dep: keyof typeof DEP_VERSIONS
    /** Preset option that disables this tool when explicitly false. */
    option?: string
  }> = [
    { when: 'tsdown', dep: 'tsdown', option: 'tsdown' },
    { when: 'oxlint', dep: 'oxlint', option: 'oxlint' },
    { when: 'eslint', dep: 'eslint', option: 'eslint' },
    { when: 'biome', dep: '@biomejs/biome', option: 'biome' },
    { when: 'vitest', dep: 'vitest' },
    { when: 'tsconfig', dep: 'typescript' },
    { when: 'tsconfig', dep: '@typescript/native-preview', option: 'tsgo' },
  ]
  for (const { when, dep, option } of DEP_RULES) {
    // An existing preset registration may disable a tool — don't
    // install its dependency (matches what the preset will infer).
    // eslint-disable-next-line security/detect-object-injection -- option is a literal DEP_RULES field
    if (option !== undefined && presetOptions[option] === false) continue
    // eslint-disable-next-line security/detect-object-injection -- dep keys come from the literal DEP_RULES table
    if (hasAny(when) && !(dep in existing)) needed[dep] = DEP_VERSIONS[dep]
  }

  return needed
}

function hasPackageDep(tree: Tree, name: string): boolean {
  const pkg = readJson(tree, 'package.json') ?? {}
  const deps = {
    ...(pkg.dependencies as Record<string, string> | undefined),
    ...(pkg.devDependencies as Record<string, string> | undefined),
  }
  // eslint-disable-next-line security/detect-object-injection -- name is the caller-provided plugin path
  return Object.hasOwn(deps, name)
}

// --- Package manager detection ---

function detectPackageManagerFromTree(tree: Tree): 'bun' | 'npm' | 'pnpm' | 'yarn' {
  if (tree.exists('bun.lock')) return 'bun'
  if (tree.exists('pnpm-lock.yaml')) return 'pnpm'
  if (tree.exists('yarn.lock')) return 'yarn'
  return 'npm'
}

// --- Summary printing ---

function targetLabel(
  configs: DetectedConfigs,
  rootConfigs?: DetectedConfigs,
  presetOptions: Record<string, unknown> = {},
): string[] {
  // eslint-disable-next-line security/detect-object-injection -- option is a literal preset-option name
  const enabled = (option: string) => presetOptions[option] !== false
  // Lint-family configs fall back to the workspace root, matching the
  // preset's root-config fallback for lint/format inference.
  const hasOxlint = enabled('oxlint') && (configs.oxlint || (rootConfigs?.oxlint ?? false))
  const hasEslint = enabled('eslint') && (configs.eslint || (rootConfigs?.eslint ?? false))
  const hasBiome = enabled('biome') && (configs.biome || (rootConfigs?.biome ?? false))

  const targets: string[] = []
  if (configs.tsconfig) targets.push('typecheck')
  if (configs.vitest) targets.push('test', 'test:watch', 'test:coverage')
  else if (configs.tests) targets.push('test')
  if (hasOxlint || hasEslint) targets.push('lint')
  if (hasBiome) {
    targets.push('format', 'format-check')
    if (!hasOxlint && !hasEslint) targets.push('lint')
  }
  if (enabled('tsdown') && configs.tsdown) targets.push('build', 'build:watch')
  return targets
}

function printSummary(
  pluginPath: string,
  rootConfigs: DetectedConfigs,
  projectConfigs: Array<{ root: string; configs: DetectedConfigs }>,
  installedDeps: Record<string, string>,
  packageManager: 'bun' | 'npm' | 'pnpm' | 'yarn' = 'bun',
  presetOptions: Record<string, unknown> = {},
  hasNestedConfig = false,
  pluginInstalled = false,
): void {
  const isLocalPath = pluginPath.startsWith('.') || pluginPath.startsWith('/')
  const installCmd =
    packageManager === 'bun'
      ? 'bun add -D'
      : packageManager === 'pnpm'
        ? 'pnpm add -D'
        : packageManager === 'yarn'
          ? 'yarn add -D'
          : 'npm install -D'
  const installStep = isLocalPath
    ? `1. The plugin is registered from a local path: ${pluginPath}`
    : pluginInstalled
      ? `1. The plugin is installed: ${pluginPath}`
      : `1. Install the plugin: ${installCmd} ${pluginPath}`

  console.log(installStep)
  console.log('')
  console.log('Detected projects and inferred targets:')

  const rootDetected = Object.entries(rootConfigs)
    .filter(([, v]) => v)
    .map(([k]) => k)
  if (rootDetected.length > 0) {
    // The workspace root is itself a project when includeRoot is set
    // explicitly, or when no nested config file exists anywhere — matching
    // the plugin's single-package auto-detection, which keys off the
    // tsconfig glob, not only the container dirs. Otherwise root configs
    // are only lint/format fallbacks for nested projects.
    const rootIsProject =
      rootConfigs.tsconfig &&
      (presetOptions.includeRoot === true ||
        (presetOptions.includeRoot !== false && !hasNestedConfig))
    const rootTargets = rootIsProject ? targetLabel(rootConfigs, rootConfigs, presetOptions) : []
    if (rootTargets.length > 0) {
      console.log(`  . (workspace root) → ${rootTargets.join(', ')}`)
    } else {
      console.log(`  . (workspace root — no targets, config source) → ${rootDetected.join(', ')}`)
    }
  }

  for (const { root, configs } of projectConfigs) {
    const targets = targetLabel(configs, rootConfigs, presetOptions)
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
    const installDepsCmd =
      packageManager === 'bun'
        ? 'bun install'
        : packageManager === 'pnpm'
          ? 'pnpm install'
          : packageManager === 'yarn'
            ? 'yarn install'
            : 'npm install'
    console.log(`Run \`${installDepsCmd}\` to install them.`)
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

  // 2. Register plugin first (removes standalone @nx-devkit/* entries) —
  // preserved options like `configFile` steer detection below.
  const presetOptions = registerPlugin(tree, pluginPath)
  const configFileName =
    typeof presetOptions.configFile === 'string' ? presetOptions.configFile : 'tsconfig.json'

  // 3. Detect configs at workspace root
  const rootConfigs = detectConfigsAtRoot(tree, configFileName)

  // 4. Detect configs in nested project directories
  const nestedRoots: string[] = []
  for (const dir of ['packages', 'apps', 'libs', 'projects']) {
    findNestedProjectRoots(tree, dir, 0, nestedRoots, configFileName)
  }
  const projectConfigs: Array<{ root: string; configs: DetectedConfigs }> = []
  for (const root of nestedRoots) {
    const configs = detectConfigsAtProjectRoot(tree, root, configFileName)
    if (Object.values(configs).some(Boolean)) {
      projectConfigs.push({ root, configs })
    }
  }

  // 5. Install missing peer deps
  let installedDeps: Record<string, string> = {}
  let installCallback: GeneratorCallback = () => {}

  if (!skipInstall) {
    const allConfigs = [rootConfigs, ...projectConfigs.map((p) => p.configs)]
    installedDeps = getMissingDevDeps(tree, allConfigs, presetOptions)

    if (Object.keys(installedDeps).length > 0) {
      installCallback = addDependenciesToPackageJson(tree, {}, installedDeps)
    }
  }

  // 6. Print summary
  const packageManager = detectPackageManagerFromTree(tree)
  printSummary(
    pluginPath,
    rootConfigs,
    projectConfigs,
    installedDeps,
    packageManager,
    presetOptions,
    hasNestedConfigFile(tree, configFileName),
    hasPackageDep(tree, pluginPath),
  )

  return () => installCallback()
}

export default initGenerator
