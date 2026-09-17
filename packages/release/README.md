# @nx-devkit/release

Zero-config Nx plugin for automated npm releases via CI — no PR, no manual merge.

## What it does

1. Computes the next version from npm latest (patch/minor/major) or uses an explicit x.y.z
2. Stamps `package.json` with `npm version --no-git-tag-version`
3. Publishes to npm via OIDC (`npm publish --provenance --access public`)
4. Commits the bump + tag, rebases on `origin/main`, and pushes directly
5. Creates a GitHub Release with `--generate-notes` (auto-generated changelog)

All steps are **idempotent** — reruns skip whatever already exists. Release repair
mode: if npm + tag exist but the GitHub Release is missing, only the release is created.

## Quick start

```bash
# Install
npm install -D @nx-devkit/release

# Generate the release workflow + tools project
npx nx g @nx-devkit/release:init

# Dry run
npx nx run tools:release --version=patch --dryRun=true

# Real release (via GitHub Actions)
gh workflow run release.yml -f version=patch -f dry-run=false
```

## Executor options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `packageName` | string | from `package.json` | npm package name to publish |
| `packagePath` | string | project root | Path to the package directory |
| `version` | string | `"patch"` | Version to release (x.y.z, or patch\|minor\|major) |
| `dryRun` | boolean | `false` | Verify only — no publish, tag, push, or release |
| `registry` | string | `https://registry.npmjs.org/` | npm registry URL |
| `branch` | string | `"main"` | Branch to push the bump commit to |
| `generateNotes` | boolean | `true` | Create a GitHub Release with auto-generated changelog |
| `provenance` | boolean | `true` | Publish with `--provenance` (npm OIDC) |

## Generator options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `projectName` | string | `"tools"` | Name of the tools project |
| `packageName` | string | from root `package.json` | npm package name |
| `packagePath` | string | `"packages/cli"` | Path to the package directory |
| `branch` | string | `"main"` | Branch to push to |

## How it works

The `init` generator creates:
- `tools/project.json` with a `release` target using the `@nx-devkit/release:publish` executor
- `.github/workflows/release.yml` that runs build → typecheck → lint → test → release
- Registers the plugin in `nx.json`

The workflow is triggered via `workflow_dispatch`:

```bash
gh workflow run release.yml -f version=patch -f dry-run=false
```

No version-sync PR. No manual merge. The bump commit goes directly to main.
