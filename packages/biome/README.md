# @nx-devkit/biome

Standalone Nx plugin: any `biome.json` or `biome.jsonc` becomes a project with `format`, `format-check`, and `lint` targets. No `project.json` needed.

Part of [nx-devkit](https://github.com/nx-devkit/nx.ts). If you want the full TypeScript toolchain (typecheck, test, lint, format, build), use the [`@nx-devkit/typescript`](../typescript-preset/README.md) preset instead — it includes everything this plugin does.

## Install

```bash
bun add -D @nx-devkit/biome @biomejs/biome
```

Requires `nx`, `@nx/devkit` `^22 || ^23`, and `@biomejs/biome` `^2` — all declared peers.

## Register

```jsonc
// nx.json
{ "plugins": ["@nx-devkit/biome"] }
```

## What it infers

<!-- target table consistent with src/plugin.ts infer* targets -->

| Target | Default command | Cacheable | Inputs |
|---|---|---|---|
| `format` | `biome format --write .` | no (mutates source) | `biome.json{,c}`, `**/*` |
| `format-check` | `biome format .` | yes | `biome.json{,c}`, `**/*` |
| `lint` | `biome lint .` | yes | `biome.json{,c}`, `**/*` |

All run via `nx:run-commands` with `cwd` = the project root.

## Inspect

```bash
npx nx show projects
npx nx show project <name>
npx nx run <name>:format-check
```

## Options

<!-- option reference consistent with src/plugin.ts BiomePluginOptions -->

Pass via the plugin tuple in `nx.json`. Each option overrides the command string for one target:

```jsonc
{
  "plugins": [
    ["@nx-devkit/biome", {
      "formatCommand": "biome format --write .",
      "formatCheckCommand": "biome format .",
      "lintCommand": "biome lint ."
    }]
  ]
}
```

| Option | Default | Effect |
|---|---|---|
| `formatCommand` | `biome format --write .` | Command for the `format` target. |
| `formatCheckCommand` | `biome format .` | Command for the `format-check` target. |
| `lintCommand` | `biome lint .` | Command for the `lint` target. |

## Skip rules

- Both `biome.json` and `biome.jsonc` are recognized.
- Configs inside `node_modules` are skipped.
- Configs that escape the workspace root are skipped.
- The workspace-root `biome.json{,c}` is skipped — the plugin is for nested project roots.

## License

MIT
