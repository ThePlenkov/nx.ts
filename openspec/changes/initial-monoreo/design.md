# Design: initial monorepo foundation

## Workspace topology

```text
/
  package.json          # private, workspaces [packages/*, apps/*, skills/*]
  tsconfig.base.json    # strict, ES2022, ESNext, Bundler resolution
  biome.json            # formatter + linter (root)
  .oxlintrc.json        # oxlint plugins: typescript, import, unicorn, node
  .gitignore            # node_modules, dist, .nx, .kilocode, .env
  nx.json               # Nx 22.7.1, bun@1.3.14, pluginsConfig, plugins: []
  .husky/pre-commit     # bunx biome format --write .
  scripts/spec-check.ts # duplicate-target detector
  openspec/
    config.yaml         # schema: spec-driven, project context
    specs/SPEC.md       # architecture + matrix + workflow
    changes/initial-monoreo/  # this change folder
  packages/             # (empty in this bead; populated by per-plugin beads)
  apps/                 # (empty; populated by demo bead)
  skills/               # (empty; populated by skills bead)
```

## Tooling decisions

- **Bun 1.3.14** as both package manager and script runner. `packageManager: "bun@1.3.14"` declared.
- **Nx 22.7.1** pinned (not latest 23.x) per convoy spec; `@nx/devkit@22.7.1` to match.
- **Biome 2.5.0** for formatting AND linting at root (single tool). `bun run format` runs `biome format --write .`.
- **oxlint 1.70.0** as secondary linter (config-only here; plugins add `lint` targets via inference).
- **TypeScript 6.0.3** for `tsconfig.base.json`; per-package `tsdown.config.ts` uses tsdown 0.22.3.
- **Vitest 4.1.9** for unit tests in plugin beads.
- **Husky 9.1.7** for pre-commit hook; runs biome format.

## OpenSpec workflow

- `openspec/config.yaml` extends `spec-driven` schema with project context (bun, Nx 22, latest-version discipline, two-PR strategy).
- Change folder `initial-monoreo/` uses the artifact layout: `proposal.md`, `specs/`, `design.md`, `tasks.md`.
- `tasks.md` maps 1:1 to convoy beads so progress is traceable per bead.
- `scripts/spec-check.ts` runs as `bun run spec:check`; complements `openspec validate`.

## nx.json design

- `pluginsConfig` lists all four plugin scopes with empty options object so downstream beads can declare defaults without re-touching nx.json.
- `plugins: []` is empty in this bead. Wire-up bead (`5bed80e9`) fills it.
- `namedInputs.sharedGlobals` defined to capture root config that affects every project's inputs.
- `targetDefaults` sets `cache: true` + `dependsOn: ['^build']` on `build`; `cache: true` on `typecheck`, `lint`, `test`.

## Husky pre-commit

`.husky/pre-commit` is a `#!/usr/bin/env sh` shell script that runs `bunx biome format --write --no-errors-on-unmatched` followed by `git add -u` to re-stage formatted files. Because biome is installed at root and the hook runs from repo root, this works without `cd`.

## spec-check.ts design

Scans plugin entrypoints (`packages/*/src/plugin.ts`) and OpenSpec files (`openspec/**/*.md`, `openspec/**/*.ts`). For each file, scans for `createNodesV2`, `createNodes`, `inferTarget`, `buildTarget`, `testTarget`, `lintTarget`, `formatTarget`, `typecheckTarget` definitions, and for each line that matches, extracts target keys (`build`, `test`, `lint`, `format`, `format-check`, `typecheck`, `test:watch`, `test:coverage`). A target key defined in two distinct files (one spec, one plugin, or two plugins) is a conflict and exits non-zero.

## Risk / non-goals

- **Non-goal**: this bead does not implement plugin packages.
- **Non-goal**: this bead does not open PRs. PR-opening lives in the final bead (`f7fb7ee7`).
- **Risk**: Nx 22 vs 23 mismatch. Mitigated by pinning both `nx` and `@nx/devkit` to 22.7.1.
- **Risk**: husky's `prepare` script may run in environments without git. Mitigated by checking `git rev-parse --is-inside-work-tree` (husky does this internally on 9.x).
