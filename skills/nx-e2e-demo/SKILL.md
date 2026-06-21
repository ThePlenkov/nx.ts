---
name: nx-e2e-demo
description: End-to-end validation skill for the nx-devkit-plugins monorepo demo workspace
---

# nx-e2e-demo

Run and validate the end-to-end demo that exercises all `@nx-devkit` plugins together in a real Nx workspace.

## When to Use

Use this skill when:
- You want to verify all plugins work together in a real workspace
- You are adding a new plugin and need to validate integration
- You need to run the demo workspace's full build/lint/typecheck/test pipeline

## Prerequisites

- Bun >= 1.3.0
- Node >= 20.19.0
- All packages built (`bun run build` from workspace root)

## Quick Start

```bash
# From the workspace root
bun run build

# Navigate to the demo
cd apps/demo

# Install dependencies
bun install

# Run all targets
bunx nx run-many -t build typecheck lint format test
```

## What the Demo Validates

The `apps/demo` workspace demonstrates:

1. **tsdown plugin** — projects with `tsdown.config.ts` get automatic `build` targets
2. **oxlint plugin** — projects with `.oxlintrc.json` get automatic `lint` targets
3. **biome plugin** — projects with `biome.json` get automatic `format`, `format-check`, and `lint` targets
4. **typescript plugin** — projects with `tsconfig.json` get automatic `typecheck` and `test` targets

## Full E2E Script

The repository includes `scripts/e2e.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Building packages"
bun run build

cd apps/demo

echo "==> Installing dependencies in apps/demo"
bun install

echo "==> Running nx run-many against demo workspace"
bunx nx run-many -t build typecheck lint format test
```

Run it:

```bash
bash scripts/e2e.sh
```

## Verifying Individual Targets

### Build

```sh
bunx nx run-many -t build --project-filter=demo-*
```

### Typecheck

```sh
bunx nx run-many -t typecheck --project-filter=demo-*
```

### Lint

```sh
bunx nx run-many -t lint --project-filter=demo-*
```

### Format Check

```sh
bunx nx run-many -t format-check --project-filter=demo-*
```

### Test

```sh
bunx nx run-many -t test --project-filter=demo-*
```

## Troubleshooting

### "dist/ directories not found"

Build packages first: `bun run build` from the workspace root. The demo references plugins via `../../packages/*/dist/plugin.mjs`.

### "No projects found"

Ensure the demo workspace's `nx.json` includes all four plugins and that `bun install` has been run in `apps/demo/`.

### CI Stuck

If CI checks are stuck for more than 5 minutes, post a `### check status` comment and continue. CI is non-blocking for this skill.
