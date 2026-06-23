# @nx-devkit/biome

Nx plugin that infers `format`, `format-check`, and `lint` targets from a project's `biome.json` or `biome.jsonc`. Zero `project.json` required.

## What it does

Scans the workspace for any `biome.json` or `biome.jsonc`. For each match (outside the workspace root), it injects three targets: `format` (uncached — has side effects), `format-check` (cached), and `lint` (cached).

## Install

```bash
bun add -D @nx-devkit/biome
```

## Register in nx.json

```jsonc
{
  "plugins": ["@nx-devkit/biome"]
}
```

## Targets generated

| Trigger | Target | Command | Cache |
|---|---|---|---|
| `**/biome.json` or `**/biome.jsonc` | `format` | `npx biome format --write .` | **false** (side effect: writes files) |
| same | `format-check` | `npx biome format .` | true |
| same | `lint` | `npx biome lint .` | true |

All three targets run with `cwd` set to the project root. Each target's `inputs` array contains `{projectRoot}/biome.json` (or `biome.jsonc`) and `{projectRoot}/**/*`.

## Skip rules

- The workspace root is skipped (a `biome.json` at `./` is intentionally ignored).
- `format` MUST NOT be cached because `format --write` mutates the working tree — Nx's cache assumes targets are pure functions of their inputs. `format-check` and `lint` are read-only and cacheable.

## Options

```ts
export interface NxBiomePluginOptions {
  /** Run `lint` as part of `nx lint`. Default: false. */
  checkOnLint?: boolean;
  /** Reuse biome's internal cache for `format-check`. Default: true. */
  formatCache?: boolean;
}
```

## License

MIT