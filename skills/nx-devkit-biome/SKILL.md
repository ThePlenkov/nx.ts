---
name: nx-devkit-biome
description: Nx plugin that infers format, format-check, and lint targets from biome.json/biome.jsonc
---

# @nx-devkit/biome

Infer Nx `format`, `format-check`, and `lint` targets from `biome.json` or `biome.jsonc` without writing `project.json`.

## When to Use

Use this skill when:
- You have a monorepo managed by Nx
- Projects use [Biome](https://biomejs.dev/) for formatting and linting
- You want Nx to automatically detect biome configs and generate targets

## How It Works

The plugin scans for `**/biome.jsonc?`. For each match (outside the workspace root), it injects three targets:

| Trigger | Target | Command | Cache |
|---|---|---|---|
| `**/biome.json` or `**/biome.jsonc` | `format` | `npx biome format --write .` | **false** (writes files) |
| same | `format-check` | `npx biome format .` | true |
| same | `lint` | `npx biome lint .` | true |

All three targets run with `cwd` set to the project root.

## Install

```bash
bun add -D @nx-devkit/biome
```

## Register in nx.json

```json
{
  "plugins": ["@nx-devkit/biome"]
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
    "format": {
      "executor": "nx:run-commands",
      "options": { "command": "npx biome format --write .", "cwd": "packages/foo" },
      "cache": false,
      "inputs": ["{projectRoot}/biome.json", "{projectRoot}/src/**/*"]
    },
    "format-check": {
      "executor": "nx:run-commands",
      "options": { "command": "npx biome format .", "cwd": "packages/foo" },
      "cache": true,
      "inputs": ["{projectRoot}/biome.json", "{projectRoot}/src/**/*"]
    },
    "lint": {
      "executor": "nx:run-commands",
      "options": { "command": "npx biome lint .", "cwd": "packages/foo" },
      "cache": true,
      "inputs": ["{projectRoot}/biome.json", "{projectRoot}/src/**/*"]
    }
  }
}
```

Run the targets:

```sh
npx nx lint packages/foo
npx nx format-check packages/foo
npx nx format packages/foo
```

## Why Is `format` Uncached?

`format --write` mutates the working tree. Nx's cache assumes targets are pure functions of their inputs; side-effecting targets cannot be safely replayed. `format-check` and `lint` are read-only and cacheable.

## Options

Customize commands via `pluginsConfig` in `nx.json`:

```json
{
  "pluginsConfig": {
    "@nx-devkit/biome": {
      "formatCommand": "npx biome format --write .",
      "formatCheckCommand": "npx biome format .",
      "lintCommand": "npx biome lint ."
    }
  }
}
```

All three options are optional and default to the values shown above.

## Workspace Root Handling

A `biome.json` at the workspace root is skipped so the root config does not become its own Nx project.

## Source Reference

Implementation: [`packages/biome/src/plugin.ts`](../../packages/biome/src/plugin.ts)
