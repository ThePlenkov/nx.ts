# @nx-devkit/biome

Nx plugin that infers `format`, `format-check`, and `lint` targets from a project's `biome.json` or `biome.jsonc`. Zero `project.json` required.

## Install

```bash
bun add -D @nx-devkit/biome
```

## Register in `nx.json`

```json
{
  "plugins": ["@nx-devkit/biome"]
}
```

That's it. Every project containing a `biome.json` (or `biome.jsonc`) automatically gains three targets.

## Targets generated

| Trigger | Target | Command | Cache |
|---|---|---|---|
| `**/biome.json` or `**/biome.jsonc` | `format` | `npx biome format --write .` | **false** (side effect: writes files) |
| same | `format-check` | `npx biome format .` | true |
| same | `lint` | `npx biome lint .` | true |

All three targets run with `cwd` set to the project root.

## Inputs

Each target's `inputs` array contains:

- `{projectRoot}/biome.json` (or `biome.jsonc`)
- `{projectRoot}/**/*`

## Workspace root is skipped

A `biome.json` at the workspace root is intentionally ignored so the root config does not become its own Nx project.

## Why uncache `format`?

`format --write` mutates the working tree. Nx's cache assumes targets are pure functions of their inputs; side-effecting targets cannot be safely replayed. `format-check` and `lint` are read-only and cacheable.

## Husky pre-commit

This plugin matches the formatter invoked by the repository's husky pre-commit hook (see `openspec/specs/SPEC.md`).

## Options

```ts
// nx.json pluginsConfig
{
  "@nx-devkit/biome": {
    "formatCommand": "npx biome format --write .",
    "formatCheckCommand": "npx biome format .",
    "lintCommand": "npx biome lint ."
  }
}
```

All three options are optional and default to the values shown above.

## Build & test

```bash
bun run build
bun test
```
