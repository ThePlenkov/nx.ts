# @nx-devkit/typescript

A preset Nx plugin that infers `typecheck`, `test`, `lint`, `format`, and `build` targets for any project that has a `tsconfig.json`, without requiring a `project.json`.

## What it does

For every `tsconfig.json` (outside the workspace root) the plugin infers a `typecheck` target. Depending on which configuration files are present in the project, it also infers:

- **Vitest test targets** (`test`, `test:watch`, `test:coverage`) when a `vitest.config.*` exists
- **Native Node test runner targets** (`test`, optionally `test:tap` and `test:coverage`) when test/spec files exist but no vitest config
- **Oxlint lint** target when `.oxlintrc.*` exists
- **ESLint lint** target when `eslint.config.*` exists (fallback when no oxlint config)
- **Biome format/format-check/lint** targets when `biome.json` or `biome.jsonc` exists
- **Tsdown build** target when `tsdown.config.ts` exists

This is a "mega-preset" plugin: it owns the cross-cutting `typecheck`, `test`, `lint`, `format`, and `build` logic that most TypeScript projects need, so per-tool plugins don't have to re-implement it.

## Install

```bash
bun add -D @nx-devkit/typescript
```

Peer dependency: `@nx/devkit` >= 22.

## Register in nx.json

```jsonc
{
  "plugins": ["@nx-devkit/typescript"]
}
```

The plugin needs no other setup. By default it scans every `tsconfig.json` in the workspace.

## Targets generated

### `typecheck` — always inferred when `tsconfig.json` is present

```jsonc
{
  "typecheck": {
    "executor": "nx:run-commands",
    "options": {
      "command": "tsgo --build tsconfig.json",
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

### `test`, `test:watch`, `test:coverage` — when `vitest.config.*` exists

```jsonc
{
  "test": {
    "executor": "nx:run-commands",
    "options": {
      "command": "npx vitest run",
      "cwd": "{projectRoot}"
    },
    "outputs": ["{projectRoot}/coverage"],
    "cache": true,
    "inputs": [
      "{projectRoot}/src/**/*.ts",
      "{projectRoot}/tests/**/*",
      "{projectRoot}/vitest.config.ts",
      "{projectRoot}/package.json",
      "{workspaceRoot}/vitest.config.ts"
    ],
    "dependsOn": ["^build"]
  }
}
```

`test:watch` is non-cached and uses `npx vitest` (no `run`).
`test:coverage` adds `--coverage` and uses the same outputs.

### Native Node test runner — when test files exist but NO vitest config

When no `vitest.config.*` is present but files matching `testGlob` or `specGlob` exist, the plugin infers a native Node test runner `test` target:

```jsonc
{
  "test": {
    "executor": "nx:run-commands",
    "options": {
      "command": "node --test --test-reporter spec \"**/*.test.{ts,js,mts,mjs}\"",
      "cwd": "{projectRoot}"
    },
    "cache": true,
    "inputs": [
      "{projectRoot}/**/*.test.{ts,js,mts,mjs}",
      "{projectRoot}/**/*.spec.{ts,js,mts,mjs}",
      "{projectRoot}/package.json"
    ]
  }
}
```

When `tap: true`, a `test:tap` target is also inferred:

```jsonc
{
  "test:tap": {
    "executor": "nx:run-commands",
    "options": {
      "command": "node --test --test-reporter tap \"**/*.test.{ts,js,mts,mjs}\" > test-results.tap",
      "cwd": "{projectRoot}"
    },
    "outputs": ["{projectRoot}/test-results.tap"],
    "cache": true,
    "inputs": [
      "{projectRoot}/**/*.test.{ts,js,mts,mjs}",
      "{projectRoot}/**/*.spec.{ts,js,mts,mjs}",
      "{projectRoot}/package.json"
    ]
  }
}
```

> The `test:tap` command uses `>` (not `| tee`) to preserve the exit status of the test runner. The TAP output file (`test-results.tap`) is declared in `outputs` so Nx can cache it correctly.

When `coverage: true`, a `test:coverage` target is also inferred:

```jsonc
{
  "test:coverage": {
    "executor": "nx:run-commands",
    "options": {
      "command": "node --test --experimental-test-coverage \"**/*.test.{ts,js,mts,mjs}\"",
      "cwd": "{projectRoot}"
    },
    "cache": true,
    "inputs": [
      "{projectRoot}/**/*.test.{ts,js,mts,mjs}",
      "{projectRoot}/**/*.spec.{ts,js,mts,mjs}",
      "{projectRoot}/package.json"
    ]
  }
}
```

### `lint` — Oxlint delegation (when `.oxlintrc.*` exists)

```jsonc
{
  "lint": {
    "executor": "nx:run-commands",
    "options": {
      "command": "oxlint .",
      "cwd": "{projectRoot}"
    },
    "cache": true,
    "inputs": [
      "{projectRoot}/src/**/*",
      "{projectRoot}/.oxlintrc.*",
      "{projectRoot}/package.json"
    ]
  }
}
```

### `format`, `format-check` — Biome delegation (when `biome.json` or `biome.jsonc` exists)

```jsonc
{
  "format": {
    "executor": "nx:run-commands",
    "options": {
      "command": "biome format --write .",
      "cwd": "{projectRoot}"
    },
    "cache": false,
    "inputs": [
      "{projectRoot}/src/**/*",
      "{projectRoot}/biome.json",
      "{projectRoot}/biome.jsonc",
      "{projectRoot}/package.json"
    ]
  },
  "format-check": {
    "executor": "nx:run-commands",
    "options": {
      "command": "biome format .",
      "cwd": "{projectRoot}"
    },
    "cache": true,
    "inputs": [
      "{projectRoot}/src/**/*",
      "{projectRoot}/biome.json",
      "{projectRoot}/biome.jsonc",
      "{projectRoot}/package.json"
    ]
  }
}
```

`format` is non-cached because it writes files. `format-check` is cached.

### `lint` — Biome delegation (when neither oxlint nor ESLint owns lint)

When `biome.json` exists but neither oxlint nor ESLint is providing the `lint` target (either `oxlint: false` or no `.oxlintrc.*`, AND `eslint: false` or no `eslint.config.*`), biome provides `lint`:

```jsonc
{
  "lint": {
    "executor": "nx:run-commands",
    "options": {
      "command": "biome lint .",
      "cwd": "{projectRoot}"
    },
    "cache": true,
    "inputs": [
      "{projectRoot}/src/**/*",
      "{projectRoot}/biome.json",
      "{projectRoot}/biome.jsonc",
      "{projectRoot}/package.json"
    ]
  }
}
```

### Lint precedence

When multiple lint configs exist, the precedence is:

1. **oxlint** (`.oxlintrc.*` + `oxlint: true`) — highest priority
2. **ESLint** (`eslint.config.*` + `eslint: true`) — fallback when no oxlint config
3. **Biome** (`biome.json` + `biome: true`) — fallback when neither oxlint nor eslint owns lint

Biome always provides `format`/`format-check` when `biome.json` exists, regardless of lint ownership.

### `build` — Tsdown delegation (when `tsdown.config.*` exists)

```jsonc
{
  "build": {
    "executor": "nx:run-commands",
    "options": {
      "command": "tsdown",
      "cwd": "{projectRoot}"
    },
    "outputs": ["{projectRoot}/dist"],
    "cache": true,
    "inputs": [
      "{projectRoot}/src/**/*",
      "{projectRoot}/tsdown.config.ts",
      "{projectRoot}/tsconfig.json",
      "{projectRoot}/package.json"
    ],
    "dependsOn": ["^build"]
  }
}
```

### `build:watch` — Tsdown watch mode (when `tsdown.config.*` exists)

```jsonc
{
  "build:watch": {
    "executor": "nx:run-commands",
    "options": {
      "command": "tsdown --watch",
      "cwd": "{projectRoot}"
    },
    "cache": false,
    "inputs": [
      "{projectRoot}/src/**/*",
      "{projectRoot}/tsdown.config.ts",
      "{projectRoot}/tsconfig.json",
      "{projectRoot}/package.json"
    ],
    "dependsOn": ["^build"]
  }
}
```

For a project at `packages/foo/` with a `tsconfig.json`:

```bash
npx nx show project packages/foo
```

lists all inferred targets.

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
| `tsgo` | `boolean` | `true` | `true` uses `tsgo` and external-deps `@typescript/native-preview`; `false` uses `tsc` and external-deps `typescript`. |
| `configFile` | `string` | `"tsconfig.json"` | The trigger file basename. Use e.g. `"tsconfig.lib.json"` for lib projects. |
| `clean` | `boolean` | `false` | When `true`, a `tsgo/tsc --build --clean <configFile>` runs first, chained with `&&`, so a full clean rebuild happens before the normal typecheck. |
| `tap` | `boolean` | `false` | When `true`, infers a `test:tap` target using the native Node test runner with TAP reporter. |
| `coverage` | `boolean` | `false` | When `true`, infers a `test:coverage` target using the native Node test runner with `--experimental-test-coverage`. |
| `oxlint` | `boolean` | `true` | When `true` and `.oxlintrc.*` exists, infers a `lint` target via `oxlint .`. |
| `eslint` | `boolean` | `true` | When `true` and `eslint.config.*` exists (and oxlint is not owning lint), infers a `lint` target via `npx eslint .`. |
| `biome` | `boolean` | `true` | When `true` and `biome.json`/`biome.jsonc` exists, infers `format`/`format-check` (and `lint` when neither oxlint nor ESLint is providing it). |
| `tsdown` | `boolean` | `true` | When `true` and `tsdown.config.ts` exists, infers a `build` target via `tsdown`. |
| `testGlob` | `string` | `"**/*.test.{ts,js,mts,mjs}"` | Glob pattern for detecting native test files. |
| `specGlob` | `string` | `"**/*.spec.{ts,js,mts,mjs}"` | Glob pattern for detecting spec files. |

## Skip rules

The plugin never creates a project at the workspace root and ignores any `tsconfig.json` under `node_modules` or outside the workspace.

## Reusable helpers

The plugin exports the helpers used internally so per-tool plugins can compose with the same logic:

```ts
import {
  inferTypecheckTarget,
  inferVitestTargets,
  inferNativeTestTargets,
  inferOxlintTarget,
  inferBiomeTargets,
  inferTsdownBuildTarget,
  shouldSkipPath,
  isVerbose,
  logDebug,
} from '@nx-devkit/typescript';
```

## Verbose logging

`logDebug` only prints when:

- `--verbose` is on `process.argv`, or
- `NX_VERBOSE_LOGGING=true` is set in the environment or the workspace `.env`.

Messages are prefixed with `[nx-typescript]`.

## License

MIT