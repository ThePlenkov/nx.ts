# @nx-devkit/typescript

A preset Nx plugin that infers `typecheck` and `test` targets for any project that has a `tsconfig.json`, without requiring a `project.json`.

## What it does

For every `tsconfig.json` (outside the workspace root) the plugin infers a `typecheck` target. If a `vitest.config.*` is also present, it additionally infers `test`, `test:watch`, and `test:coverage` targets.

This is a "preset" plugin: it owns the cross-cutting `typecheck` and `test` logic that most TypeScript projects need, so per-tool plugins don't have to re-implement it.

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

When `vitest.config.{ts,js,mts,mjs,cts,cjs}` exists alongside `tsconfig.json`, the following targets are also added:

### `test`, `test:watch`, `test:coverage`

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

For a project at `packages/foo/` with a `tsconfig.json`:

```bash
npx nx show project packages/foo
```

lists `typecheck` (and `test` if a `vitest.config.*` is present).

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
        "clean": false
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

## Skip rules

The plugin never creates a project at the workspace root and ignores any `tsconfig.json` under `node_modules` or outside the workspace.

## Reusable helpers

The plugin exports the helpers used internally so per-tool plugins can compose with the same logic:

```ts
import {
  inferTypecheckTarget,
  inferVitestTargets,
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