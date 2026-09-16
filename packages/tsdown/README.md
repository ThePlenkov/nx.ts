# @nx-devkit/tsdown

Standalone Nx plugin: any `tsdown.config.ts` becomes a project with a cached `build` target. No `project.json` needed.

Part of [nx-devkit](https://github.com/nx-devkit/nx.ts). If you want the full TypeScript toolchain (typecheck, test, lint, format, build), use the [`@nx-devkit/typescript`](../typescript-preset/README.md) preset instead — it includes everything this plugin does.

## Install

```bash
bun add -D @nx-devkit/tsdown tsdown
```

Requires `@nx/devkit` `^22 || ^23` (peer) and the `tsdown` binary installed — the target shells out to it via `nx:run-commands`.

## Register

```jsonc
// nx.json
{ "plugins": ["@nx-devkit/tsdown"] }
```

## What it infers

<!-- target table consistent with src/plugin.ts createNodesV2 -->

| Trigger | Target | Command | Cacheable | Outputs |
|---|---|---|---|---|
| `tsdown.config.ts` | `build` | `tsdown` (via `nx:run-commands`, `cwd` = project root) | yes | `{projectRoot}/dist` |

`build` declares `dependsOn: ["^build"]`, so upstream dependencies build first.

## Inspect

```bash
npx nx show projects
npx nx show project <name>
npx nx run <name>:build
```

## Skip rules

- Only `tsdown.config.ts` matches (not `.mts`, `.js`, or other extensions).
- Configs inside `node_modules` are skipped.
- Configs that escape the workspace root are skipped.
- The workspace-root `tsdown.config.ts` is skipped — the plugin is for nested project roots.

## Options

None. Behavior is entirely file-driven.

## License

MIT
