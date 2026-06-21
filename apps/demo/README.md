# @nx-devkit demo workspace

A minimal Nx workspace that exercises all 4 inference plugins in the `@nx-devkit/*` family. Each project is configured by *config files only* (no `project.json`) — targets are inferred automatically by the plugins.

## What this proves

| Project            | Source files          | Type of project                            |
| ------------------ | --------------------- | ------------------------------------------ |
| `projects/library` | `tsdown.config.ts` + `tsconfig.json` + `.oxlintrc.json` + `biome.json` + `vitest.config.ts` | Library — exports `hello = 'world'`        |
| `projects/app`     | Same config set + `src/main.ts` | Application — prints "app running"        |
| `projects/monorepo-pkg` | Same config set, no tests | Workspace-pkg-style package (private `package.json`) |

## How to run the e2e

From the **repo root** (the monorepo that hosts this `apps/demo` workspace):

```bash
bash scripts/e2e.sh
```

The script:

1. `cd apps/demo && bun install` — installs `nx` and the four `@nx-devkit/*` workspace plugins.
2. `bunx nx run-many -t build typecheck lint format test` — runs every inferred target on every project.

It exits 0 only if every target succeeds on every project.

You can also exercise the workspace directly:

```bash
cd apps/demo
bunx nx show projects            # list inferred projects
bunx nx show project @nx-devkit-demo/library  # inspect a single project
bunx nx run-many -t build typecheck lint format test
```

## Inferred targets per project

| Project                        | build | typecheck | lint | format | test |
| ------------------------------ | :---: | :-------: | :--: | :----: | :--: |
| `@nx-devkit-demo/library`      |  yes  |    yes    | yes  |  yes   | yes  |
| `@nx-devkit-demo/app`          |  yes  |    yes    | yes  |  yes   | yes  |
| `@nx-devkit-demo/monorepo-pkg` |  yes  |    yes    | yes  |  yes   |  —   |

(Each project also gets `format-check` and `test:watch`/`test:coverage` as bonus targets.)

## Which plugin infers which target

| Target       | Inferred by             | Trigger file                          |
| ------------ | ----------------------- | ------------------------------------- |
| `build`      | `@nx-devkit/tsdown`     | `tsdown.config.ts`                    |
| `typecheck`  | `@nx-devkit/typescript` | `tsconfig.json`                       |
| `lint`       | `@nx-devkit/oxlint` + `@nx-devkit/biome` | `.oxlintrc.json` + `biome.json` (biome wins on `lint`) |
| `format`     | `@nx-devkit/biome`      | `biome.json`                          |
| `test`       | `@nx-devkit/typescript` | `tsconfig.json` + `vitest.config.ts`  |

## Notes

- The plugins are consumed from the **source packages at `../../packages/*`**, via the compiled `dist/plugin.mjs` entry points declared in each plugin's `package.json` (Nx plugins must be JavaScript).
- The demo overrides the `typecheck` inputs in `nx.json` to drop the `externalDependencies: ['typescript']` hash entry that the `@nx-devkit/typescript` plugin registers by default. Nx's native hasher resolves that key against the workspace's installed packages and, under bun-symlinked `node_modules`, it can fail to detect the package even when it is installed. Overriding the inputs to the file-level set is sufficient for hashing and side-steps the resolver bug.
- `nx` 22.7.1 is installed at `apps/demo` so it matches the plugin's `peerDependency` on `@nx/devkit@22.7.1`. Nx 23 is the current "latest" but the plugins were authored against Nx 22.
- Project `name` fields come from the project-level `package.json` (Nx 22+ requires a `name` on every inferred project). `library` and `app` ship with minimal `package.json` for that reason; `monorepo-pkg` already has one because it represents a real workspace package.
