---
name: nx-devkit-oxlint
description: Zero-config Nx plugin that infers a `lint` target from .oxlintrc config files
---

# @nx-devkit/oxlint

Infer Nx `lint` targets from `.oxlintrc` config files without writing `project.json`.

## When to Use

Use this skill when:
- You have a monorepo managed by Nx
- Projects use [oxlint](https://oxc.rs/) for linting
- You want Nx to automatically detect and run `lint` for every project that has a `.oxlintrc` config

## How It Works

The plugin scans for `**/.oxlintrc.{json,yml,yaml,cjs,mjs,js,cts,mts}`. For each match (outside the workspace root), it injects a `lint` target:

| Trigger file | Target | Executor | Command | Cache |
|---|---|---|---|---|
| `**/.oxlintrc.{json,yml,yaml,cjs,mjs,js,cts,mts}` | `lint` | `nx:run-commands` | `npx oxlint .` | true |

The `cwd` of the lint command is set to the project root.

## Install

```bash
bun add -D @nx-devkit/oxlint
```

## Register in nx.json

```json
{
  "plugins": ["@nx-devkit/oxlint"]
}
```

## Verify It Works

Given this layout:

```
.
├── nx.json
├── packages/
│   └── foo/
│       ├── .oxlintrc.json
│       ├── package.json
│       └── src/index.ts
```

Run:

```sh
npx nx show project packages/foo
```

Expected output:

```
foo
- lint (nx:run-commands, cacheable)
  command: npx oxlint .
  cwd: packages/foo
  inputs: src/**/*, .oxlintrc.*, package.json
```

Run the lint:

```sh
npx nx lint packages/foo
```

## Inputs

Each lint target hashes:
- `{projectRoot}/src/**/*`
- `{projectRoot}/.oxlintrc.*`
- `{projectRoot}/package.json`

## Workspace Root Handling

A `.oxlintrc` at the workspace root is skipped so the root config does not become its own Nx project.

## Source Reference

Implementation: [`packages/oxlint/src/plugin.ts`](../../packages/oxlint/src/plugin.ts)
