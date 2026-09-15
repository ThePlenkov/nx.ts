# @nx-devkit/oxlint

Standalone Nx plugin: any `.oxlintrc.*` config becomes a project with a cached `lint` target. No `project.json` needed.

Part of [nx-devkit](https://github.com/nx-devkit/nx.ts). If you want the full TypeScript toolchain (typecheck, test, lint, format, build), use the [`@nx-devkit/typescript`](../typescript-preset/README.md) preset instead — it includes everything this plugin does.

## Install

```bash
bun add -D @nx-devkit/oxlint oxlint
```

Requires `nx`, `@nx/devkit`, and `oxlint` `^1` — all declared peers.

## Register

```jsonc
// nx.json
{ "plugins": ["@nx-devkit/oxlint"] }
```

## What it infers

<!-- target table consistent with src/plugin.ts createNodesV2 and inferLintTarget -->

| Trigger | Target | Command | Cacheable | Inputs |
|---|---|---|---|---|
| `.oxlintrc.{json,yml,yaml,cjs,mjs,js,cts,mts}` | `lint` | `oxlint .` (via `nx:run-commands`, `cwd` = project root) | yes | `src/**`, `.oxlintrc.*`, `package.json` |

Non-JSON config formats are read defensively: the plugin checks the file exists and is parseable, but delegates real config semantics to `oxlint` at target runtime.

## Inspect

```bash
npx nx show projects
npx nx show project <name>
npx nx run <name>:lint
```

## Skip rules

- Configs inside `node_modules` are skipped.
- Configs that escape the workspace root are skipped.
- The workspace-root `.oxlintrc.*` is skipped — the plugin is for nested project roots.
- Unreadable files and configs larger than 1 MiB are skipped.

## Options

None. Behavior is entirely file-driven.

## License

MIT
