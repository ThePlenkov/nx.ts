---
name: nx-e2e-demo
description: End-to-end validation skill for verifying all @nx-devkit plugins work together
---

# nx-e2e-demo

Validate that all `@nx-devkit` plugins work together in a real Nx workspace.

## When to Use

Use this skill when:
- You want to verify all plugins work together in a real workspace
- You are adding a new plugin and need to validate integration
- You need to run the full build/lint/typecheck/test pipeline across all plugins

## Prerequisites

- Bun >= 1.3.0
- Node >= 20.19.0
- All packages built (`bun run build` from workspace root)

## What the Plugins Validate

Each plugin infers targets from config files in project directories:

1. **tsdown plugin** — projects with `tsdown.config.ts` get automatic `build` targets
2. **oxlint plugin** — projects with `.oxlintrc.json` get automatic `lint` targets
3. **biome plugin** — projects with `biome.json` get automatic `format`, `format-check`, and `lint` targets
4. **typescript plugin** — projects with `tsconfig.json` get automatic `typecheck` and `test` targets

## Manual Validation Steps

### 1. Create a test project

```bash
mkdir -p /tmp/e2e-test/packages/demo
cd /tmp/e2e-test
```

Initialize a workspace with `nx.json`:

```json
{
  "plugins": [
    "@nx-devkit/tsdown",
    "@nx-devkit/oxlint",
    "@nx-devkit/biome",
    "@nx-devkit/typescript"
  ]
}
```

### 2. Add config files to trigger each plugin

In `packages/demo/`, add:
- `tsdown.config.ts` — triggers the build target
- `.oxlintrc.json` — triggers the lint target
- `biome.json` — triggers format/lint targets
- `tsconfig.json` — triggers typecheck target

### 3. Verify inferred targets

```sh
npx nx show project packages/demo
```

Expected: all four target types appear (`build`, `lint`, `format`, `typecheck`).

### 4. Run each target

```sh
npx nx build packages/demo
npx nx lint packages/demo
npx nx format packages/demo
npx nx typecheck packages/demo
```

## Verifying Individual Plugins

See the individual plugin skills for detailed verification:
- `nx-devkit-tsdown` — build target inference
- `nx-devkit-oxlint` — lint target inference
- `nx-devkit-biome` — format/lint target inference
- `nx-devkit-typescript` — typecheck/test target inference

## Troubleshooting

### "No projects found"

Ensure each project directory contains the relevant config file and `bun install` has been run.

### "dist/ directories not found"

Build packages first: `bun run build` from the workspace root. Plugins reference other plugins via `../../packages/*/dist/plugin.mjs`.
