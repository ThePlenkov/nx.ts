# nx-devkit-plugins

Zero-config Nx plugin inference for tsdown, oxlint, biome, typescript/vitest.

This project uses its own `@nx-devkit` plugins for build/lint/format/test — it is fully self-hosting.

## Packages

| Package | Description |
|---|---|
| `@nx-devkit/tsdown` | Infers `build` target from `tsdown.config.ts` |
| `@nx-devkit/oxlint` | Infers `lint` target from `.oxlintrc.json` |
| `@nx-devkit/biome` | Infers `format`, `format-check`, and `lint` targets from `biome.json` |
| `@nx-devkit/typescript` | Infers `typecheck` target from `tsconfig.json` and `test`/`test:watch`/`test:coverage` targets from `vitest.config.*` |

## Inferred Targets

All targets are automatically inferred by the plugins — no `project.json` needed.

| Target | Plugin | Source file |
|---|---|---|
| `build` | `@nx-devkit/tsdown` | `tsdown.config.ts` |
| `lint` | `@nx-devkit/oxlint` | `.oxlintrc.json` |
| `format` | `@nx-devkit/biome` | `biome.json` |
| `format-check` | `@nx-devkit/biome` | `biome.json` |
| `typecheck` | `@nx-devkit/typescript` | `tsconfig.json` |
| `test` | `@nx-devkit/typescript` | `vitest.config.*` |
| `test:watch` | `@nx-devkit/typescript` | `vitest.config.*` |
| `test:coverage` | `@nx-devkit/typescript` | `vitest.config.*` |

## Run CI locally

```bash
bun install
bun run ci
```

Or run individual steps:

```bash
bun run build
bun run lint
bun run format
bun run test
bun run typecheck
```
