# Proposal: TypeScript mega-preset — native Node test runner + TAP + unified targets

## Why

The current `@nx-devkit/typescript` preset infers `typecheck` (tsgo) and `test`/`test:watch`/`test:coverage` (vitest only). But not every TypeScript project uses vitest — many use Node's built-in test runner (`node --test`), TAP-compatible reporters, or both. Today, projects that don't have `vitest.config.*` get **zero** test targets inferred, even though `node --test` needs no config file at all.

The goal: **one plugin, all TypeScript tooling targets**. Drop a `tsconfig.json` and get `typecheck`. Add test files (`*.test.ts` / `*.spec.ts`) and get `test` via `node --test` — no config file required. Add `vitest.config.*` and vitest targets override the native ones. Add `.oxlintrc.*` and get `lint`. Add `biome.json` and get `format`. Add `tsdown.config.ts` and get `build`.

This eliminates the need for consumers to install 4-5 separate plugins for a standard TypeScript project. The mega-preset detects what's present and infers the right targets.

## What Changes

### `@nx-devkit/typescript` (mega-preset)

- **ADD** native Node test runner inference: when `*.test.ts` or `*.spec.ts` files exist in `src/` or `test/` AND no `vitest.config.*` is present, infer `test` target using `node --test --test-reporter spec`.
- **ADD** TAP reporter option: `tap: true` infers `node --test --test-reporter tap` for CI-friendly output.
- **ADD** `test:tap` target when `tap: true` — runs `node --test --test-reporter tap | tee test-results.tap`.
- **ADD** coverage support via `node --test --experimental-test-coverage` when `coverage: true` option is set.
- **KEEP** vitest inference as-is (takes priority over native when `vitest.config.*` exists).
- **ADD** `oxlint` target inference when `.oxlintrc.*` exists in project root (delegates to `@nx-devkit/oxlint` logic or inlines the same `nx:run-commands`).
- **ADD** `biome` format/lint targets when `biome.json` exists (delegates to `@nx-devkit/biome` logic or inlines).
- **ADD** `build` target when `tsdown.config.ts` exists (delegates to `@nx-devkit/tsdown` logic or inlines).
- **EXPORT** `inferNativeTestTargets()` helper alongside existing `inferVitestTargets()` and `inferTypecheckTarget()`.

### Options

```ts
export interface NxDevkitTypescriptOptions {
  tsgo?: boolean;              // existing — use tsgo instead of tsc
  configFile?: string;         // existing — tsconfig filename
  clean?: boolean;             // existing — pre-clean tsbuildinfo

  // NEW: native Node test runner
  nativeTest?: boolean;        // default: true — infer node --test targets when no vitest config
  testGlob?: string;           // default: '**/*.{test,spec}.{ts,js,mts,mjs}'
  tap?: boolean;               // default: false — use TAP reporter instead of spec
  coverage?: boolean;          // default: false — enable --experimental-test-coverage

  // NEW: mega-preset delegation
  oxlint?: boolean;            // default: true — infer lint target when .oxlintrc.* exists
  biome?: boolean;             // default: true — infer format/format-check when biome.json exists
  tsdown?: boolean;            // default: true — infer build target when tsdown.config.ts exists
}
```

### Priority rules

When multiple test configs exist:
1. `vitest.config.*` → vitest targets (test, test:watch, test:coverage)
2. No vitest config + test files present → native node targets (test, test:tap if tap:true)
3. No test files → no test targets

When multiple lint configs exist:
1. `.oxlintrc.*` → `lint` target via oxlint
2. `biome.json` + no oxlint → `lint` target via biome

When multiple format configs exist:
1. `biome.json` → `format`, `format-check` targets

When multiple build configs exist:
1. `tsdown.config.ts` → `build` target via tsdown

## Capabilities

### New Capabilities

- `native-node-test-runner`: infer `test` (and optionally `test:tap`, `test:coverage`) targets from `node --test` when no vitest config is present.
- `mega-preset-delegation`: infer `build`, `lint`, `format`, `format-check` from tsdown/oxlint/biome configs when present, without requiring separate plugin installation.

### Modified Capabilities

- `typescript-preset`: adds native test runner inference and mega-preset delegation options.

## Non-goals

- Does NOT replace `@nx-devkit/tsdown`, `@nx-devkit/oxlint`, `@nx-devkit/biome` as standalone packages. They remain available for consumers who want only one tool.
- Does NOT infer targets for ESLint, Jest, Mocha, or other test runners. Only vitest and native Node.
- Does NOT add custom executors. All targets use `nx:run-commands`.

## Impact

- **Package**: `packages/typescript-preset/` — `src/plugin.ts` extended, `test/plugin.spec.ts` new test cases.
- **No breaking changes**: all new behavior is opt-in via options or triggered by file presence.
- **Sibling plugins**: `@nx-devkit/tsdown`, `@nx-devkit/oxlint`, `@nx-devkit/biome` remain standalone but the mega-preset can inline-equivalent targets when their config files are detected.
