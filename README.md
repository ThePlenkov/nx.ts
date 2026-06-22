# @nx-devkit/plugins

Zero-config Nx plugin inference for tsdown, oxlint, biome, and typescript/vitest.

This project uses its own `@nx-devkit` plugins for build, lint, format, and test — a self-hosting monorepo where the plugins power their own CI.

## Packages

| Package | Description |
|---------|-------------|
| `@nx-devkit/tsdown` | Infers `build` targets from `tsdown.config.ts` |
| `@nx-devkit/oxlint` | Infers `lint` targets from `.oxlintrc.json` |
| `@nx-devkit/biome` | Infers `format`, `format-check`, and `lint` targets from `biome.json` |
| `@nx-devkit/typescript` | Infers `typecheck` and `test` targets from `tsconfig.json` and `vitest.config.*` |

## Inferred Targets

Each package receives its targets automatically via the Nx plugin system — no `project.json` files needed:

| Target | Plugin | Source file |
|--------|--------|-------------|
| `build` | `@nx-devkit/tsdown` | `tsdown.config.ts` |
| `lint` | `@nx-devkit/oxlint` | `.oxlintrc.json` |
| `lint` | `@nx-devkit/biome` | `biome.json` |
| `format` | `@nx-devkit/biome` | `biome.json` |
| `format-check` | `@nx-devkit/biome` | `biome.json` |
| `typecheck` | `@nx-devkit/typescript` | `tsconfig.json` |
| `test` | `@nx-devkit/typescript` | `vitest.config.*` |

## Getting Started

```bash
bun install
```

## Run CI Locally

```bash
bun run build     # Build all packages
bun run lint      # Lint all packages
bun run format    # Format all packages
bun run test      # Test all packages
bun run typecheck # Typecheck all packages
bun run ci        # Run build + lint + test + typecheck
```

Individual package commands:

```bash
nx run @nx-devkit/tsdown:build
nx run @nx-devkit/oxlint:test
```

## Nx Cache

Nx automatically caches build and test results. The second run of any target completes in near-zero time.

```bash
nx run-many -t build  # first run: builds everything
nx run-many -t build  # second run: fully cached
```

## License

MIT
