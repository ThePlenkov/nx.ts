# @nx-devkit/oxlint

Zero-config Nx plugin that infers a `lint` target from `.oxlintrc.*` config files.

## What it does

Scans the workspace for any file matching `**/.oxlintrc.{json,yaml,yml,js,mjs,cjs,cts,mts}`. For each match (outside the workspace root), it injects a `lint` target into the project graph.

## Install

```bash
bun add -D @nx-devkit/oxlint
```

## Register in nx.json

```jsonc
{
  "plugins": ["@nx-devkit/oxlint"]
}
```

## Targets generated

| Trigger file | Target | Executor | Command | Cache | Inputs |
|---|---|---|---|---|---|
| `**/.oxlintrc.{json,yaml,yml,js,mjs,cjs,cts,mts}` | `lint` | `nx:run-commands` | `npx oxlint .` | true | `{projectRoot}/src/**/*`, `{projectRoot}/.oxlintrc.*`, `{projectRoot}/package.json` |

The `cwd` of the lint command is the project root (relative to the workspace root).

## Options

This plugin accepts no options. The discovery glob is fixed; rename the trigger file if you need to restrict it.

## Skip rules

- The workspace root is skipped (no `lint` target is added to the root project).
- Files that cannot be read are skipped.
- Config files larger than 1 MiB are ignored.

## License

MIT