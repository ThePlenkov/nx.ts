# @nx-devkit/oxlint

Zero-config Nx plugin that infers a `lint` target from `.oxlintrc.{json,yaml,yml,js,mjs,cjs,cts,mts}` config files.

## What it does

Scans the workspace for any file matching `**/.oxlintrc.{json,yaml,yml,js,mjs,cjs,cts,mts}`. For each match (outside the workspace root), it injects a `lint` target into the project graph.

## Install

```bash
bun add -D @nx-devkit/oxlint
```

## Register in `nx.json`

```json
{
  "plugins": ["@nx-devkit/oxlint"]
}
```

## Targets generated

| Trigger file | Target | Executor | Command | Cache | Inputs |
|---|---|---|---|---|---|
| `**/.oxlintrc.{json,yaml,yml,js,mjs,cjs,cts,mts}` | `lint` | `nx:run-commands` | `npx oxlint .` | true | `{projectRoot}/src/**/*`, `{projectRoot}/.oxlintrc.*`, `{projectRoot}/package.json` |

The `cwd` of the lint command is the project root (relative to the workspace root).

## Skip rules

- The workspace root is skipped (no `lint` target is added to the root project).
- Files that cannot be read are skipped.

## Example

Given this layout:

```text
.
├── nx.json
├── packages/
│   └── foo/
│       ├── .oxlintrc.json
│       ├── package.json
│       └── src/index.ts
```

Running `bunx nx show project foo` will list the `lint` target:

```text
> nx show project foo

foo
- lint (nx:run-commands, cacheable)
  command: npx oxlint .
  cwd: packages/foo
  inputs: src/**/*, .oxlintrc.*, package.json
```

## Build

```bash
bunx tsdown
```

## Test

```bash
bunx vitest run
```
