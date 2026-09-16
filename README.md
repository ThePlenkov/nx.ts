# nx-devkit

Zero-config Nx plugins for modern TypeScript tooling. Register one plugin and get `typecheck`, `test`, `lint`, `format`, and `build` targets derived from the config files your project already keeps — no `project.json`, no target boilerplate.

## Why

Nx's project graph, caching, and `affected` detection are excellent; its built-in TypeScript tooling is not. nx-devkit keeps the graph and replaces the toolchain:

- **tsdown** instead of `tsc` emit for builds
- **tsgo** (`@typescript/native-preview`) for typecheck, with `tsc` fallback
- **oxlint / ESLint / Biome** for lint, **Biome** for format
- **Vitest**, or the native `node --test` runner when no Vitest config exists
- **`createNodesV2` inference** — targets appear because `tsconfig.json` or `biome.json` exists, not because someone edited `project.json`

## Quick start

```bash
npx @nx-devkit/typescript init
```

In any workspace — Nx or plain TypeScript — this registers the preset in `nx.json`, detects your config files, installs missing tool dependencies, and prints the inferred targets. Works for single-package repos and monorepos.

Manual alternative:

```bash
bun add -D @nx-devkit/typescript   # or npm/pnpm/yarn add -D
```

```jsonc
// nx.json
{ "plugins": ["@nx-devkit/typescript"] }
```

## Packages

<!-- package matrix consistent with packages/*/package.json names and each plugin's createNodesV2 glob -->

| Package | Trigger | What you get |
|---|---|---|
| [`@nx-devkit/typescript`](./packages/typescript-preset/README.md) | `**/tsconfig*.json` + tool configs | Full preset: `typecheck`, `test`, `lint`, `format`, `build` (+ watch/coverage variants). **Recommended entry point.** |
| [`@nx-devkit/tsdown`](./packages/tsdown/README.md) | `**/tsdown.config.ts` | Standalone `build` target |
| [`@nx-devkit/oxlint`](./packages/oxlint/README.md) | `**/.oxlintrc.*` | Standalone `lint` target |
| [`@nx-devkit/biome`](./packages/biome/README.md) | `**/biome.json{,c}` | Standalone `format`, `format-check`, `lint` |
| [`@nx-devkit/skill`](./packages/skill/README.md) | `**/SKILL.md` | Skill lifecycle: `build`, `lint`, `validate`, `os-check`, `size-check` |
| [`@nx-devkit/skillspector`](./packages/skillspector/README.md) | `**/SKILL.md` | `scan` target — SkillSpector security scans with SARIF + CI annotations |
| [`@nx-devkit/prepare-for-release`](./packages/prepare-for-release/README.md) | `**/project.json` referencing its executor | `prepare-for-release` target — idempotent npm placeholder publishing |

The preset subsumes the standalone tsdown/oxlint/biome plugins; they stay available for single-tool consumers.

## How it works

Each plugin implements Nx's `createNodesV2` API: during project-graph construction it globs for config files, then emits project nodes whose targets call the tool binaries — the same way Nx's own `@nx/*` plugins infer targets. Most targets are `nx:run-commands` (binaries resolved from `node_modules/.bin`, `cwd` = project root); the typecheck/build targets use dedicated executors that launch the tool's entry point directly (`execFile`/`spawn`, no shell), with walk-up `node_modules` resolution so hoisted monorepo installs work.

Because inference is per-run, the graph always reflects the files on disk: add `vitest.config.ts` and `test` appears. A single-package repo (a `tsconfig` at the root, none nested) gets a root project; the first nested `tsconfig` turns that off automatically — `includeRoot` on the preset forces the behavior either way.

## Repository map

<!-- top-level layout consistent with this repository's directories -->

| Path | Contents |
|---|---|
| `packages/` | The publishable plugins above (+ private `internal` helpers) |
| `apps/demo/` | Working demo workspace exercising the plugins |
| `skills/` | Project-facing agent skills (`nx-devkit-typescript`, `nx-skill`, …) |
| `scripts/` | `e2e.sh`, `spec-check.ts`, `rewrite-workspace-protocol.ts` |
| `.github/workflows/` | `ci.yml` (lint/build/test), `release.yml` (e2e + OIDC publish) |

## Contributing

| Audience | Doc |
|---|---|
| Human contributor | [`CONTRIBUTING.md`](./CONTRIBUTING.md) |
| AI coding agent | [`AGENTS.md`](./AGENTS.md) |
| Code reviewer | [`REVIEW.md`](./REVIEW.md) |

## License

MIT — see [`LICENSE`](./LICENSE).
