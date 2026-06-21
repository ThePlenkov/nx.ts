---
name: nx-devkit-typescript
description: Preset Nx plugin that infers typecheck and vitest test targets from tsconfig.json and vitest.config.*
---

# @nx-devkit/typescript

Preset Nx plugin that infers `typecheck` and `test` targets for any project with a `tsconfig.json`, without requiring `project.json`.

## Why a "Preset" Plugin?

Per-tool plugins (`@nx-devkit/tsdown`, `@nx-devkit/oxlint`, `@nx-devkit/biome`) only own the target logic for the tool they wrap. Type-checking and test-running are cross-cutting concerns that almost every TypeScript project needs. Instead of each per-tool plugin re-implementing the same `typecheck` / `test` inference, they delegate to this single preset.

This plugin:
- Eliminates duplication across per-tool plugins
- Provides a single place to evolve typecheck/test inference logic
- Exports reusable helpers (`inferTypecheckTarget`, `inferVitestTargets`, etc.) that other plugins can compose with

## When to Use

Use this skill when:
- You have a TypeScript monorepo managed by Nx
- You want automatic `typecheck` and `test` targets without `project.json`
- You want a single source of truth for type-checking and test inference across all projects

## Install

```bash
bun add -D @nx-devkit/typescript
```

Peer dependency: `@nx/devkit` >= 22.

## Register in nx.json

```json
{
  "plugins": ["@nx-devkit/typescript"]
}
```

## Targets Inferred

### `typecheck` — always inferred when `tsconfig.json` is present

```jsonc
{
  "typecheck": {
    "executor": "nx:run-commands",
    "options": {
      "command": "npx tsgo --build tsconfig.json",
      "cwd": "{projectRoot}"
    },
    "cache": true,
    "inputs": [
      "{projectRoot}/src/**/*.ts",
      "{projectRoot}/tsconfig.json",
      "{projectRoot}/package.json",
      "{workspaceRoot}/tsconfig.base.json",
      { "externalDependencies": ["@typescript/native-preview"] }
    ]
  }
}
```

When `vitest.config.{ts,js,mts,mjs,cts,cjs}` exists alongside `tsconfig.json`, these targets are also added:

### `test`, `test:watch`, `test:coverage`

```jsonc
{
  "test": {
    "executor": "nx:run-commands",
    "options": {
      "command": "npx vitest run --reporter=default",
      "cwd": "{projectRoot}"
    },
    "outputs": ["{projectRoot}/coverage"],
    "cache": true,
    "inputs": [
      "{projectRoot}/src/**/*.ts",
      "{projectRoot}/tests/**/*",
      "{projectRoot}/vitest.config.{ts,js,mts,mjs,cts,cjs}",
      "{projectRoot}/package.json",
      "{workspaceRoot}/vitest.config.ts"
    ],
    "dependsOn": ["^build"]
  }
}
```

`test:watch` is non-cached and uses `npx vitest` (no `run`).
`test:coverage` adds `--coverage` and uses the same outputs.

## Options

Pass options via `pluginsConfig` in `nx.json`:

```json
{
  "pluginsConfig": {
    "@nx-devkit/typescript": {
      "tsgo": true,
      "configFile": "tsconfig.json",
      "clean": false
    }
  }
}
```

| Option | Type | Default | Notes |
|---|---|---|---|
| `tsgo` | `boolean` | `true` | `true` uses `tsgo` (`@typescript/native-preview`); `false` uses `tsc` (`typescript`) |
| `configFile` | `string` | `"tsconfig.json"` | The trigger file basename. Use `"tsconfig.lib.json"` for lib projects |
| `clean` | `boolean` | `false` | When `true`, runs `tsgo/tsc --build --clean` before the normal typecheck |

## Verify It Works

```sh
npx nx show project packages/foo
```

Run the targets:

```sh
npx nx typecheck packages/foo
npx nx test packages/foo
```

## Reusable Helpers

The plugin exports helpers for composition by other plugins:

```ts
import {
  inferTypecheckTarget,
  inferVitestTargets,
  shouldSkipPath,
  isVerbose,
  logDebug,
} from '@nx-devkit/typescript';
```

## Skip Rules

The plugin never creates a project at the workspace root and ignores any `tsconfig.json` under `node_modules` or outside the workspace.

## Verbose Logging

`logDebug` only prints when:
- `--verbose` is on `process.argv`, or
- `NX_VERBOSE_LOGGING=true` is set in the environment or the workspace `.env`

Messages are prefixed with `[nx-typescript]`.

## Source Reference

Implementation: [`packages/typescript-preset/src/plugin.ts`](../../packages/typescript-preset/src/plugin.ts)
