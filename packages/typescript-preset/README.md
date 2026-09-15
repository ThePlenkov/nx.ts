# @nx-devkit/typescript

The nx-devkit preset plugin: one entry in `nx.json` gives every project `typecheck`, `test`, `lint`, `format`, and `build` targets inferred from the config files it already has — `tsconfig.json`, `vitest.config.*`, `.oxlintrc.*`, `eslint.config.*`, `biome.json{,c}`, `tsdown.config.*`. No `project.json` anywhere.

## Install

### One-command bootstrap (recommended)

```bash
npx @nx-devkit/typescript init
```

This:

1. Registers `@nx-devkit/typescript` in `nx.json` — removing standalone `@nx-devkit/*` entries, preserving your existing preset options and non-nx-devkit plugins
2. Detects config files at the workspace root and in `packages/`, `apps/`, `libs/`, `projects/` (nested project roots are found recursively)
3. Adds devDependencies for the tools your configs imply (`typescript`, `@typescript/native-preview`, `vitest`, `oxlint`, `eslint`, `@biomejs/biome`, `tsdown`)
4. Prints the detected projects and the targets each will get

If the workspace has no Nx yet, the bootstrap installs `nx` + `@nx/devkit` first.

### Manual setup

```bash
bun add -D @nx-devkit/typescript
```

```jsonc
// nx.json
{ "plugins": ["@nx-devkit/typescript"] }
```

Requires `@nx/devkit` and `typescript` (required peers). The remaining tools are optional peers — install only what your configs use:

```bash
bun add -D vitest oxlint eslint @biomejs/biome tsdown
# tsgo (optional, not a declared peer): bun add -D @typescript/native-preview
```

## What it infers

<!-- target table consistent with src/targets/*.ts and src/plugin.ts skip rules -->

| Config detected | Targets | Runs |
|---|---|---|
| `tsconfig.json` (or `configFile` option) | `typecheck` | `@nx-devkit/typescript:typecheck` executor — `tsgo --build` or `tsc --build`, shell-free, 10-min bounded |
| `vitest.config.*` | `test`, `test:watch`, `test:coverage` | `vitest run` / `vitest` / `vitest run --coverage` |
| `*.test.*`/`*.spec.*` without Vitest | `test` (+ `test:tap`, `test:coverage` when enabled) | native `node --test` |
| `.oxlintrc.*` + `oxlint: true` | `lint` | `oxlint .` |
| `eslint.config.*` + `eslint: true` | `lint` (if oxlint did not provide it) | `eslint .` |
| `biome.json{,c}` + `biome: true` | `format`, `format-check` (+ `lint` if no earlier tool provided it) | `biome format --write .` / `biome format .` / `biome lint .` |
| `tsdown.config.*` | `build`, `build:watch` | `@nx-devkit/typescript:build` executor — `tsdown` / `tsdown --watch` |

All `nx:run-commands` targets run with `cwd` = the project root and resolve binaries from `node_modules/.bin`. The executors resolve the tool's Node entry directly and walk up ancestor `node_modules` directories — hoisted monorepo installs work, on Windows too.

### Lint precedence

Each lint source requires its option enabled *and* its config present: oxlint wins when `oxlint: true` and `.oxlintrc.*` exists; eslint wins when `eslint: true` and `eslint.config.*` exists; biome owns `lint` only when `biome: true`, `biome.json{,c}` exists, and no earlier tool provided `lint`. So `oxlint: false` lets ESLint win even with an `.oxlintrc.*` present, and `eslint: true` without an `eslint.config.*` still leaves `lint` for Biome. Biome's `format`/`format-check` are inferred regardless of who owns `lint`. Root-level lint/format configs are used as fallbacks for projects that lack their own.

### Root project

In a single-package repo (a `tsconfig.json` at the workspace root and none nested), the root itself becomes a project — automatically, with nothing in `nx.json`. Add a nested config later and the root project disappears on its own. `includeRoot` forces the behavior either way.

## Inspect

```bash
npx nx show projects              # all inferred projects
npx nx show project <name>        # targets of one project
npx nx run <name>:typecheck
```

## Options

Pass via the plugin tuple in `nx.json`:

```jsonc
{
  "plugins": [
    ["@nx-devkit/typescript", {
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
      "specGlob": "**/*.spec.{ts,js,mts,mjs}",
      "includeRoot": true
    }]
  ]
}
```

<!-- option reference consistent with src/types.ts NxDevkitTypescriptOptions -->

| Option | Type | Default | Effect |
|---|---|---|---|
| `tsgo` | `boolean` | `true` | `typecheck` runs `tsgo` when `@typescript/native-preview` is installed; falls back to `tsc` when absent or `tsgo: false`. |
| `configFile` | `string` | `"tsconfig.json"` | Config basename that marks a directory as a project. |
| `clean` | `boolean` | `false` | `typecheck` runs `… --build --clean <config>` first. |
| `tap` | `boolean` | `false` | Adds `test:tap` — native runner, TAP reporter, `test-results.tap` output. |
| `coverage` | `boolean` | `false` | Adds `test:coverage` — native runner, `--experimental-test-coverage`. |
| `oxlint` | `boolean` | `true` | `.oxlintrc.*` infers `lint`. |
| `eslint` | `boolean` | `true` | `eslint.config.*` infers `lint` (below oxlint in precedence). |
| `biome` | `boolean` | `true` | `biome.json{,c}` infers `format`/`format-check` (+ `lint` fallback). |
| `tsdown` | `boolean` | `true` | `tsdown.config.*` infers `build`/`build:watch`. |
| `testGlob` | `string` | `"**/*.test.{ts,js,mts,mjs}"` | Glob for native test files. |
| `specGlob` | `string` | `"**/*.spec.{ts,js,mts,mjs}"` | Glob for spec files. |
| `includeRoot` | `boolean` | auto | `true`: root is always a project. `false`: never. Unset: only when it is the sole project — self-corrects when nested configs appear. |

## Skip rules

A `tsconfig.json` is ignored when it sits under `node_modules`, escapes the workspace, or — in a monorepo — at the workspace root (root configs still feed lint/format fallbacks and dependency detection). `includeRoot` overrides the root skip; the skip rules for `node_modules` and escaping paths always apply.

## Executors

| Executor | Options | Notes |
|---|---|---|
| `@nx-devkit/typescript:typecheck` | `tsgo`, `configFile`, `clean` | `execFile` on the tool's Node entry — no shell; 10-minute timeout; large `maxBuffer` for compiler output. |
| `@nx-devkit/typescript:build` | `watch` | Non-watch: bounded `execFile`. Watch: `spawn` with inherited stdio, runs until interrupted. |

## Migrations

The package ships `migrations.json`; `nx migrate @nx-devkit/typescript` replaces legacy `nx:run-commands` typecheck/build targets that use `tsc|tsgo --build <config>` or `tsdown` with the dedicated executors. Only literal command forms are rewritten — shell composition, expansions, and quoted/globbed config paths are left untouched.

## For plugin authors

The preset re-exports its inference helpers so sibling plugins can compose the same logic:

<!-- exported helpers consistent with src/plugin.ts export block -->

```ts
import {
  inferTypecheckTarget, inferVitestTargets, inferNativeTestTargets,
  inferOxlintTarget, inferEslintTarget, inferBiomeTargets,
  inferTsdownBuildTarget, inferTsdownWatchTarget,
  shouldSkipPath, isVerbose, logDebug, resetCachedEnv,
  globMatch, globMatchAsync, globToRegExp, expandBraces,
} from '@nx-devkit/typescript'
```

## Verbose logging

`logDebug` prints only with `--verbose` on argv or `NX_VERBOSE_LOGGING=true` (env or workspace `.env`). Messages are prefixed `[nx-typescript]`.

## License

MIT
