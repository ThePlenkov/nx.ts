# @nx-devkit/tsdown

Zero-config Nx plugin that infers a `build` target from a `tsdown.config.ts`.

## What it does

For every project that contains a `tsdown.config.ts`, this plugin automatically infers a `build` target — no `project.json` required. The target runs `npx tsdown` with `cwd` set to the project root and caches output in `{projectRoot}/dist`.

| Trigger file | Inferred target | Executor |
| --- | --- | --- |
| `**/tsdown.config.ts` | `build` | `nx:run-commands` |

## Install

```bash
bun add -D @nx-devkit/tsdown tsdown
```

## Register in nx.json

```jsonc
{
  "plugins": ["@nx-devkit/tsdown"]
}
```

## Options

The plugin currently ships no options.

```ts
export interface NxTsdownPluginOptions {}
```

## Targets generated

For a project at `packages/foo/` with a `tsdown.config.ts`:

```bash
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
        "{projectRoot}/tsdown.config.ts",
        "{projectRoot}/tsconfig.lib.json",
        "{projectRoot}/package.json"
      ],
      "dependsOn": ["^build"]
    }
  }
}
```

Run it:

```bash
npx nx build packages/foo
```

## Skip rules

The workspace root (where `tsdown.config.ts` lives at `./`) is skipped so the repo itself is not treated as a project.

## Verbose logging

The plugin logs discovery messages when:

- `nx ... --verbose` is passed
- `NX_VERBOSE_LOGGING=true` is set in the environment
- `NX_VERBOSE_LOGGING=true` appears in `<workspaceRoot>/.env`

## License

MIT