import { type GeneratorCallback, type Tree, joinPathFragments } from '@nx/devkit'

export interface NxReleaseInitOptions {
  /** Name of the tools project to create or update. Default: "tools". */
  projectName?: string
  /** npm package name to publish. Default: derived from root package.json. */
  packageName?: string
  /** Path to the package directory containing package.json. Default: "packages/cli". */
  packagePath?: string
  /** Branch to push the bump commit to. Default: "main". */
  branch?: string
}

const DEFAULT_PROJECT_NAME = 'tools'
const DEFAULT_PACKAGE_PATH = 'packages/cli'
const DEFAULT_BRANCH = 'main'
const PLUGIN_NAME = '@nx-devkit/release'

function readJson(tree: Tree, path: string): Record<string, unknown> | null {
  if (!tree.exists(path)) return null
  try {
    return JSON.parse(tree.read(path, 'utf8') ?? '{}') as Record<string, unknown>
  } catch {
    return null
  }
}

function writeJson(tree: Tree, path: string, value: unknown): void {
  tree.write(path, `${JSON.stringify(value, null, 2)}\n`)
}

function registerPlugin(tree: Tree, pluginPath: string): void {
  const nxJson = readJson(tree, 'nx.json') ?? {}
  const plugins = Array.isArray(nxJson.plugins) ? (nxJson.plugins as unknown[]) : []
  const already = plugins.some(
    (entry) =>
      (typeof entry === 'string' && entry === pluginPath) ||
      (typeof entry === 'object' &&
        entry !== null &&
        (entry as { plugin?: string }).plugin === pluginPath),
  )
  if (!already) {
    plugins.push({ options: {}, plugin: pluginPath })
    nxJson.plugins = plugins
    writeJson(tree, 'nx.json', nxJson)
  }
}

function ensureToolsProject(
  tree: Tree,
  projectName: string,
  packageName: string,
  packagePath: string,
): void {
  const projectJsonPath = joinPathFragments(projectName, 'project.json')

  if (tree.exists(projectJsonPath)) {
    const existing = readJson(tree, projectJsonPath)
    if (existing) {
      const targets = (existing.targets ?? {}) as Record<string, Record<string, unknown>>
      if (!targets['release']) {
        targets['release'] = {
          executor: `${PLUGIN_NAME}:publish`,
          options: { packagePath, packageName },
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
    sourceRoot: projectName,
    targets: {
      release: {
        executor: `${PLUGIN_NAME}:publish`,
        options: { packagePath, packageName },
      },
    },
  }
  writeJson(tree, projectJsonPath, project)
  tree.write(joinPathFragments(projectName, '.gitkeep'), '')
}

function createReleaseWorkflow(tree: Tree, projectName: string, branch: string): void {
  const workflowPath = '.github/workflows/release.yml'

  if (tree.exists(workflowPath)) {
    // Don't overwrite an existing workflow — user may have customized it
    return
  }

  const workflow = `name: Release

concurrency:
  group: release

on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to release (x.y.z, or patch|minor|major vs npm latest)'
        required: false
        default: 'patch'
        type: string
      dry-run:
        description: 'Dry run (verify only — no tag, publish, or release)'
        required: false
        default: 'true'
        type: choice
        options:
          - 'true'
          - 'false'

permissions:
  contents: write
  id-token: write

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    environment: npm
    timeout-minutes: 10

    steps:
      - name: Checkout
        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with:
          submodules: true

      - name: Setup Node.js
        uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
        with:
          node-version: lts/*
          check-latest: true
          registry-url: 'https://registry.npmjs.org'

      - name: Install dependencies
        run: npm ci --ignore-scripts

      - name: Build
        run: npx nx run-many -t build

      - name: Typecheck
        run: npx nx run-many -t typecheck

      - name: Lint
        run: npx nx run-many -t lint

      - name: Test
        run: npx nx run-many -t test

      - name: Release
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}
        run: |
          npx nx run ${projectName}:release \\
            --version="\${{ inputs.version }}" \\
            --dryRun="\${{ inputs.dry-run }}"
`

  tree.write(workflowPath, workflow)
}

export async function initGenerator(
  tree: Tree,
  options: NxReleaseInitOptions = {},
): Promise<GeneratorCallback> {
  const projectName = options.projectName ?? DEFAULT_PROJECT_NAME
  const packagePath = options.packagePath ?? DEFAULT_PACKAGE_PATH
  const branch = options.branch ?? DEFAULT_BRANCH

  // Derive package name from root package.json if not provided
  let packageName = options.packageName
  if (!packageName) {
    const rootPkg = readJson(tree, 'package.json')
    packageName = (rootPkg?.name as string) ?? 'kilo-ai-cli'
  }

  registerPlugin(tree, PLUGIN_NAME)
  ensureToolsProject(tree, projectName, packageName, packagePath)
  createReleaseWorkflow(tree, projectName, branch)

  const checklist = [
    `1. Install the plugin: npm install -D ${PLUGIN_NAME}`,
    `2. Run a dry run: npx nx run ${projectName}:release --version=patch --dryRun=true`,
    `3. Run a real release: gh workflow run release.yml -f version=patch -f dry-run=false`,
    '4. The workflow publishes to npm via OIDC, pushes the bump+tag to main, and creates a GitHub Release.',
  ]
  for (const line of checklist) console.log(line)

  return () => {
    /* No-op */
  }
}

export default initGenerator
