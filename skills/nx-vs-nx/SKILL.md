---
name: nx-vs-nx
description: Explains how @nx-devkit plugins extend Nx without replacing it
---

# Nx DevKit Plugins: Extending Nx, Not Replacing It

## Positioning

The `@nx-devkit` plugins are **additive extensions** to [Nx](https://nx.dev/). They do **not** replace Nx, fork it, or introduce a new build system. They are standard Nx plugins that use the official `createNodesV2` API to infer project configuration.

## What Nx Provides

Nx is a full-featured monorepo toolchain:
- Project graph and dependency analysis
- Task scheduling and parallelization
- Distributed computation caching
- Affected commands (`nx affected`)
- Generators and executors
- Cloud integration

## What @nx-devkit Adds

The `@nx-devkit` plugins add **zero-config project inference** for specific tools:

| Plugin | What It Infers | Trigger File |
|---|---|---|
| `@nx-devkit/tsdown` | `build` target | `**/tsdown.config.ts` |
| `@nx-devkit/oxlint` | `lint` target | `**/.oxlintrc.{json,yml,...}` |
| `@nx-devkit/biome` | `format`, `format-check`, `lint` targets | `**/biome.jsonc?` |
| `@nx-devkit/typescript` | `typecheck`, `test`, `test:watch`, `test:coverage` targets | `**/tsconfig.json` |

Without these plugins, you would need to manually define targets in `project.json` for every project. With them, Nx automatically discovers projects and their capabilities.

## How Integration Works

1. Install a plugin: `bun add -D @nx-devkit/tsdown`
2. Register it in `nx.json`:
   ```json
   {
     "plugins": ["@nx-devkit/tsdown"]
   }
   ```
3. Nx calls the plugin's `createNodesV2` function during project graph creation
4. The plugin returns project configurations for any matching config files
5. Nx merges these into the project graph as if you had written `project.json`

## Key Principle: Plugins Are Nx-Native

These plugins:
- Use the official `@nx/devkit` API (`CreateNodesV2`)
- Follow Nx plugin conventions (glob-based triggers, project configuration format)
- Work with all Nx features (caching, affected, task graph, etc.)
- Do not modify Nx internals or override core behavior

## When to Use @nx-devkit Plugins

Use them when:
- You have projects using tsdown, oxlint, biome, or TypeScript/vitest
- You want to avoid writing `project.json` boilerplate
- You want Nx to "just work" with your tool choices

Do **not** use them when:
- You already have well-maintained `project.json` files
- You need custom executor logic beyond what `nx:run-commands` provides
- Your project structure doesn't match the trigger file patterns

## Compatibility

All `@nx-devkit` plugins peer-depend on `@nx/devkit` >= 22 and are tested with Nx 22.x. They work in any Nx monorepo regardless of package manager (bun, npm, yarn, pnpm).
