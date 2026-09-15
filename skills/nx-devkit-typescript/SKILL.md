---
name: nx-devkit-typescript
description: Preset Nx plugin — one command bootstraps typecheck, test, lint, format, and build targets from config files you already keep. No project.json required.
---

# @nx-devkit/typescript

Preset Nx plugin that infers `typecheck`, `test`, `lint`, `format`, and `build` targets for any project with a `tsconfig.json`. The **single recommended entry point** for nx-devkit — it subsumes `@nx-devkit/tsdown`, `@nx-devkit/oxlint`, and `@nx-devkit/biome`.

## One-command bootstrap

```bash
npx @nx-devkit/typescript init
```

This single command:
1. Registers `@nx-devkit/typescript` as the **sole plugin** in `nx.json` (removes any existing `@nx-devkit/*` standalone entries)
2. Creates `nx.json` and `package.json` if they don't exist
3. Detects config files in your workspace and nested project directories
4. Installs missing peer dependencies (`tsdown`, `oxlint`, `@biomejs/biome`, `vitest`, `typescript`)
5. Prints a summary of detected projects and inferred targets

If your project doesn't have Nx yet, the bootstrap installs `nx` + `@nx/devkit` automatically.

### Manual setup (without the bootstrap)

```bash
bun add -D @nx-devkit/typescript
```

```jsonc
{ "plugins": ["@nx-devkit/typescript"] }
```

One plugin entry. The preset auto-detects everything else.

## What it does

For every `tsconfig.json` (outside the workspace root) the plugin infers a `typecheck` target. Depending on which config files are present in each project, it also infers:

| Config file detected | Inferred target(s) |
|---|---|
| `tsconfig.json` | `typecheck` (tsgo or tsc) |
| `vitest.config.*` | `test`, `test:watch`, `test:coverage` |
| `*.test.ts` / `*.spec.ts` (no vitest) | `test` (native `node --test`) |
| `.oxlintrc.*` | `lint` (oxlint, highest precedence) |
| `eslint.config.*` | `lint` (eslint, fallback) |
| `biome.json` / `biome.jsonc` | `format`, `format-check`, `lint` (fallback) |
| `tsdown.config.*` | `build`, `build:watch` |

### Lint precedence

When multiple lint configs exist: **oxlint** > **eslint** > **biome**. Biome always provides `format`/`format-check` when `biome.json` exists, regardless of lint ownership.

## Options

Pass options via the inline plugin tuple in `nx.json`:

```jsonc
{
  "plugins": [
    [
      "@nx-devkit/typescript",
      {
        "tsgo": true,
        "configFile": "tsconfig.json",
        "clean": false,
        "tap": false,
        "coverage": false,
        "oxlint": true,
        "eslint": true,
        "biome": true,
        "tsdown": true,
        "testGlob": "**/*.test.{ts,js,mts,mjs}",
        "specGlob": "**/*.spec.{ts,js,mts,mjs}"
      }
    ]
  ]
}
```

| Option | Type | Default | Notes |
|---|---|---|---|
| `tsgo` | `boolean` | `true` | `true` uses `tsgo` (`@typescript/native-preview`); `false` uses `tsc` |
| `configFile` | `string` | `"tsconfig.json"` | Trigger file basename |
| `clean` | `boolean` | `false` | Pre-clean tsbuildinfo before typecheck |
| `tap` | `boolean` | `false` | Infer `test:tap` with native Node TAP reporter |
| `coverage` | `boolean` | `false` | Infer `test:coverage` for native Node runner |
| `oxlint` | `boolean` | `true` | Infer `lint` from `.oxlintrc.*` |
| `eslint` | `boolean` | `true` | Infer `lint` from `eslint.config.*` (fallback) |
| `biome` | `boolean` | `true` | Infer `format`/`format-check`/`lint` from `biome.json` |
| `tsdown` | `boolean` | `true` | Infer `build`/`build:watch` from `tsdown.config.*` |
| `testGlob` | `string` | `"**/*.test.{ts,js,mts,mjs}"` | Glob for native test files |
| `specGlob` | `string` | `"**/*.spec.{ts,js,mts,mjs}"` | Glob for spec files |

## Verify it works

```sh
npx nx show project packages/foo
npx nx typecheck packages/foo
npx nx test packages/foo
npx nx run-many -t build
```

## Reusable helpers

```ts
import {
  inferTypecheckTarget,
  inferVitestTargets,
  inferNativeTestTargets,
  inferOxlintTarget,
  inferEslintTarget,
  inferBiomeTargets,
  inferTsdownBuildTarget,
  inferTsdownWatchTarget,
  shouldSkipPath,
  isVerbose,
  logDebug,
} from '@nx-devkit/typescript'
```

## Skip rules

Never creates a project at the workspace root. Ignores `tsconfig.json` under `node_modules` or outside the workspace.

## Source reference

Implementation: [`packages/typescript-preset/src/plugin.ts`](../../packages/typescript-preset/src/plugin.ts)
Init generator: [`packages/typescript-preset/src/generators/init/generator.ts`](../../packages/typescript-preset/src/generators/init/generator.ts)
