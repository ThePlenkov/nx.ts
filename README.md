# nx-devkit

Zero-config Nx inference plugins for TypeScript projects. Add a plugin to `nx.json` and get `build`, `typecheck`, `lint`, `format`, and `test` targets derived from the config files you already keep — no `project.json` required.

## Why nx-devkit?

- **Zero config.** Targets are inferred from `tsdown.config.ts`, `tsconfig.json`, `.oxlintrc.*`, `biome.json{,c}`, and `vitest.config.*` already in your project.
- **Inference-based.** Each plugin uses Nx's `createNodesV2` to discover projects at graph-creation time.
- **Extend, don't replace.** nx-devkit adds targets alongside anything Nx already provides.
- **One monorepo, focused tools.** Pick the plugins you need; each ships as its own npm package under `@nx-devkit/*`.

## Plugin matrix

| Plugin | npm package | Trigger file | Inferred targets |
|---|---|---|---|
| tsdown | [`@nx-devkit/tsdown`](./packages/tsdown/README.md) | `**/tsdown.config.ts` | `build` |
| oxlint | [`@nx-devkit/oxlint`](./packages/oxlint/README.md) | `**/.oxlintrc.*` | `lint` |
| biome | [`@nx-devkit/biome`](./packages/biome/README.md) | `**/biome.json{,c}` | `format`, `format-check`, `lint` |
| typescript | [`@nx-devkit/typescript`](./packages/typescript-preset/README.md) | `**/tsconfig.json` + `vitest.config.*` | `typecheck`, `test`, `test:watch`, `test:coverage` |
| prepare-for-release | [`@nx-devkit/prepare-for-release`](./packages/prepare-for-release/README.md) | `tools/project.json` referencing its executor | `prepare-for-release` |

## Install

```bash
bun add -D @nx-devkit/tsdown tsdown @nx-devkit/oxlint @nx-devkit/biome @nx-devkit/typescript
```

Register in `nx.json`:

```jsonc
{ "plugins": ["@nx-devkit/tsdown", "@nx-devkit/oxlint", "@nx-devkit/biome", "@nx-devkit/typescript"] }
```

See each plugin's README for options and per-tool behavior. `prepare-for-release` has its own install command — see [its README](./packages/prepare-for-release/README.md).

## Try it locally

```bash
git clone https://github.com/ThePlenkov/nx.ts
cd nx.ts
bun install
bun run build
```

The `apps/demo/` workspace is a working example that wires all five plugins.

## Documentation map

| Audience | File |
|---|---|
| npm consumer — per-package usage | [`packages/*/README.md`](./packages) |
| Human contributor — fork, branch, PR flow | [`CONTRIBUTING.md`](./CONTRIBUTING.md) |
| AI coding agent — scope, TDD, escalation | [`AGENTS.md`](./AGENTS.md) |
| AI code reviewer — review rules | [`REVIEW.md`](./REVIEW.md) |
| Working example | [`apps/demo/`](./apps/demo) |
| Agent skills registry | [`skills/`](./skills) |

## License

MIT. See [`LICENSE`](./LICENSE).