# nx-devkit

Zero-config Nx inference plugins for TypeScript projects. Add a plugin to `nx.json` and get `build`, `typecheck`, `lint`, `format`, and `test` targets derived from the config files you already keep — no `project.json` required.

## Why nx-devkit?

- **One command.** `npx @nx-devkit/typescript init` bootstraps the full preset into any project.
- **Zero config.** Targets are inferred from `tsdown.config.ts`, `tsconfig.json`, `.oxlintrc.*`, `biome.json{,c}`, and `vitest.config.*` already in your project.
- **Inference-based.** The preset uses Nx's `createNodesV2` to discover projects at graph-creation time.
- **Extend, don't replace.** nx-devkit adds targets alongside anything Nx already provides.
- **One plugin, all tools.** Register only `@nx-devkit/typescript` — it auto-detects and orchestrates everything.

## Plugin matrix

| Plugin | npm package | Trigger file | Inferred targets |
|---|---|---|---|
| **typescript (preset)** | [`@nx-devkit/typescript`](./packages/typescript-preset/README.md) | `**/tsconfig.json` + `vitest.config.*` | `typecheck`, `test`, `test:watch`, `test:coverage`, `lint`, `format`, `format-check`, `build`, `build:watch` |
| tsdown (standalone) | [`@nx-devkit/tsdown`](./packages/tsdown/README.md) | `**/tsdown.config.ts` | `build` |
| oxlint (standalone) | [`@nx-devkit/oxlint`](./packages/oxlint/README.md) | `**/.oxlintrc.*` | `lint` |
| biome (standalone) | [`@nx-devkit/biome`](./packages/biome/README.md) | `**/biome.json{,c}` | `format`, `format-check`, `lint` |
| prepare-for-release | [`@nx-devkit/prepare-for-release`](./packages/prepare-for-release/README.md) | `tools/project.json` referencing its executor | `prepare-for-release` |

The **typescript preset** is the recommended entry point — it subsumes tsdown, oxlint, and biome. Standalone plugins remain available for granular use.

## Install

```bash
npx @nx-devkit/typescript init
```

This registers the preset as the sole plugin, detects your config files, installs missing peer deps, and prints a summary of inferred targets.

### Manual setup

```bash
bun add -D @nx-devkit/typescript
```

Register in `nx.json`:

```jsonc
{ "plugins": ["@nx-devkit/typescript"] }
```

See each plugin's README for options and per-tool behavior. `prepare-for-release` has its own install command — see [its README](./packages/prepare-for-release/README.md).

## Try it locally

```bash
git clone https://github.com/nx-devkit/nx.ts
cd nx.ts
bun install
bun run build
```

The `apps/demo/` workspace is a working example that wires all five plugins.

## Documentation map

| Audience | File |
|---|---|
| npm consumer — per-package usage | [`packages/*/README.md`](./packages) |
| Human contributor — fork, branch, PR flow | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| AI coding agent — scope, TDD, escalation | [`AGENTS.md`](./AGENTS.md) |
| AI code reviewer — review rules | [`REVIEW.md`](./REVIEW.md) |
| Working example | [`apps/demo/`](./apps/demo) |
| Agent skills registry | [`skills/`](./skills) |

## License

MIT. See [`LICENSE`](./LICENSE).