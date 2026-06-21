---
name: nx-devkit-tsdown
description: Zero-config Nx plugin that infers a `build` target from tsdown.config.ts files
---

# @nx-devkit/tsdown

Infer Nx `build` targets from `tsdown.config.ts` without writing `project.json`.

## When to Use

Use this skill when:
- You have a monorepo managed by Nx
- Projects use [tsdown](https://tsdown.dev/) as their bundler
- You want Nx to automatically detect and run `build` for every project that has a `tsdown.config.ts`

## How It Works

The plugin scans for `**/tsdown.config.ts`. For each match (outside the workspace root), it injects a `build` target:

| Trigger file | Target | Executor |
|---|---|---|
| `**/tsdown.config.ts` | `build` | `nx:run-commands` |

The inferred target:
- Runs `npx tsdown` with `cwd` set to the project root
- Caches output in `{projectRoot}/dist`
- Depends on `^build` so dependencies build first
- Hashes inputs from `src/**/*.ts`, `tsdown.config.ts`, `tsconfig.lib.json`, and `package.json`

## Install

```bash
bun add -D @nx-devkit/tsdown tsdown
```

## Register in nx.json

```json
{
  "plugins": ["@nx-devkit/tsdown"]
}
```

## Verify It Works

```sh
npx nx show project packages/foo
```

Expected output:

```jsonc
{
  "targets": {
    "build": {
      "executor": "nx:run-commands",
      "options": { "command": "npx tsdown", "cwd": "packages/foo" },
      "outputs": ["{projectRoot}/dist"],
      "cache": true,
      "inputs": [
        "{projectRoot}/src/**/*.ts",
        "{projectRoot}/tsconfig.lib.json",
        "{projectRoot}/tsdown.config.ts",
        "{projectRoot}/package.json"
      ],
      "dependsOn": ["^build"]
    }
  }
}
```

Run the build:

```sh
npx nx build packages/foo
```

## Verbose Logging

Enable debug output with any of:
- `nx ... --verbose`
- `NX_VERBOSE_LOGGING=true` in the environment
- `NX_VERBOSE_LOGGING=true` in `<workspaceRoot>/.env`

Messages are prefixed with `[nx-devkit/tsdown]`.

## Workspace Root Handling

A `tsdown.config.ts` at the workspace root is skipped so the repo itself is not treated as a project.

## Source Reference

Implementation: [`packages/tsdown/src/plugin.ts`](../../packages/tsdown/src/plugin.ts)
