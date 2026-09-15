# @nx-devkit/typescript (preset)

Agent guide for working in `packages/typescript-preset/`. Touch ONLY this directory unless the bead body says otherwise.

## File layout

```
packages/typescript-preset/
├── package.json
├── tsdown.config.ts          # entry: src/plugin.ts
├── vitest.config.ts
├── src/
│   ├── plugin.ts             # createNodesV2 — mega-preset: typecheck, vitest/native test, oxlint, biome, tsdown
│   └── plugin.spec.ts        # (under test/ — see note below)
├── test/
│   └── plugin.spec.ts        # canonical test location
├── README.md
└── AGENTS.md
```

> Note: this package places its test under `test/` (not `src/`) historically. The `vitest.config.ts` glob is `test/**/*.spec.ts`. Do not move the test file without updating `vitest.config.ts`.

## Mega-preset options interface

```ts
export interface NxDevkitTypescriptOptions {
  /** Use the experimental `@typescript/native-preview` (`tsgo`) binary. Default: true. */
  tsgo?: boolean;
  /** Name of the tsconfig file to detect. Default: "tsconfig.json". */
  configFile?: string;
  /** Pre-clean the tsbuildinfo before building. Default: false. */
  clean?: boolean;
  /** Infer `test:tap` target using the native Node test runner TAP reporter. Default: false. */
  tap?: boolean;
  /** Infer `test:coverage` target for the native Node test runner. Default: false. */
  coverage?: boolean;
  /** Infer `lint` target from `.oxlintrc.*`. Default: true. */
  oxlint?: boolean;
  /** Infer `lint` target from `eslint.config.*`. Default: true. */
  eslint?: boolean;
  /** Infer `format`/`format-check`/`lint` from `biome.json`. Default: true. */
  biome?: boolean;
  /** Infer `build` target from `tsdown.config.ts`. Default: true. */
  tsdown?: boolean;
  /** Glob for native test files. Default: "**/*.test.{ts,js,mts,mjs}". */
  testGlob?: string;
  /** Glob for spec files. Default: "**/*.spec.{ts,js,mts,mjs}". */
  specGlob?: string;
  /** Workspace root as a project: true = always, false = never, unset = only when it is the sole project (single-package repos). */
  includeRoot?: boolean;
}
```

## Inferred targets

| Target | Trigger | Notes |
|---|---|---|
| `typecheck` | `tsconfig.json` | Always inferred. Uses `tsgo` or `tsc`. |
| `test` / `test:watch` / `test:coverage` | `vitest.config.*` | Vitest takes priority over native test runner. |
| `test` | test/spec files (no vitest config) | Native Node test runner: `node --test --test-reporter spec`. |
| `test:tap` | test/spec files + `tap: true` | Native Node test runner with TAP reporter. Uses `>` not `\| tee`. |
| `test:coverage` | test/spec files + `coverage: true` | Native Node test runner with `--experimental-test-coverage`. |
| `lint` | `.oxlintrc.*` + `oxlint: true` | `npx oxlint .`. Oxlint wins over eslint and biome for `lint`. |
| `lint` | `eslint.config.*` + `eslint: true` | `npx eslint .`. ESLint wins over biome for `lint`. Only when oxlint is not owning it. |
| `lint` | `biome.json` + oxlint AND eslint NOT providing lint | `npx biome lint .`. Only when oxlint disabled or no `.oxlintrc.*`, and eslint disabled or no `eslint.config.*`. |
| `format` / `format-check` | `biome.json` + `biome: true` | `format` writes files (cache false), `format-check` is cached. |
| `build` | `tsdown.config.ts` + `tsdown: true` | `npx tsdown`, outputs `{projectRoot}/dist`, `dependsOn: ['^build']`. |
| `build:watch` | `tsdown.config.ts` + `tsdown: true` | `npx tsdown --watch`, cache disabled. |

### Lint precedence

When both `.oxlintrc.*` and `biome.json` exist:
- `oxlint: true` (default) → oxlint owns `lint`, biome only provides `format`/`format-check`
- `oxlint: false` → eslint owns `lint` if `eslint.config.*` exists and `eslint: true`
- `oxlint: false` + `eslint: false` → biome owns `lint`

## Scope rules

- Touch ONLY `packages/typescript-preset/`.
- Reusable helpers (`inferTypecheckTarget`, `inferVitestTargets`, `inferNativeTestTargets`, `inferOxlintTarget`, `inferBiomeTargets`, `inferTsdownBuildTarget`, `shouldSkipPath`, `logDebug`, `isVerbose`) are exported for sibling plugins. Do NOT duplicate them elsewhere.
- Do NOT modify other plugin packages or the root `nx.json`.

## TDD workflow

1. Write failing `test/plugin.spec.ts` covering: workspace-root skip, tsconfig detection, vitest target inference, native test runner, oxlint/biome/tsdown delegation, options.
2. `bun test` → RED.
3. Update `src/plugin.ts`.
4. `bun run build`.
5. Commit.

## Verification commands

```bash
cd packages/typescript-preset
bun test
bun run build
```