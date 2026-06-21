# @nx-devkit/tsdown

Zero-config Nx inference plugin for [tsdown](https://tsdown.dev/) bundler projects.

## What it does

For every project that contains a `tsdown.config.ts`, this plugin automatically
infers a `build` target — no `project.json` required.

| Trigger file | Inferred target | Executor |
| --- | --- | --- |
| `**/tsdown.config.ts` | `build` | `nx:run-commands` |

The inferred target:

- runs `npx tsdown` with `cwd` set to the project root
- caches output in `{projectRoot}/dist`
- depends on `^build` so dependencies build first
- hashes inputs from `src/**/*.ts`, `tsdown.config.ts`, `tsconfig.lib.json`,
  and `package.json`

The workspace root (where `tsdown.config.ts` lives at `./`) is skipped so the
repo itself is not treated as a project.

## Install

```sh
bun add -D @nx-devkit/tsdown tsdown
```

## Wire it up

Add the plugin to `nx.json`:

```json
{
  "plugins": ["@nx-devkit/tsdown"]
}
```

That's it. Any directory under the workspace containing a `tsdown.config.ts`
now has a `build` target.

## Targets generated

For a project at `packages/foo/` with a `tsdown.config.ts`:

```sh
npx nx show project packages/foo
```

reports:

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

Run it:

```sh
npx nx build packages/foo
```

## Verbose logging

The plugin logs discovery messages when:

- `nx ... --verbose` is passed
- `NX_VERBOSE_LOGGING=true` is set in the environment
- `NX_VERBOSE_LOGGING=true` appears in `<workspaceRoot>/.env`

## How it works

`createNodesV2` matches the glob `**/tsdown.config.ts`. For each match
(except the workspace root), it emits a project configuration pointing at
the file's directory as the project root.

See [`src/plugin.ts`](./src/plugin.ts).

## License

MIT
