# Proposal: initial monorepo foundation

## Why

We need a single home for the four `@nx-devkit/*` Nx plugins (tsdown, oxlint, biome, typescript-preset) plus a runnable demo, installable skills, and the supporting OpenSpec-driven spec layer. Today these live as four separate prototype repos with no shared conventions, no spec discipline, no shared CI, and no demo. The convoy that proves the concept ("drop in a `tsdown.config.ts` and get `nx build` for free") cannot be demonstrated end-to-end without first building a bun-managed monorepo skeleton and the OpenSpec spec layer that guards it.

## What Changes

- **NEW** bun-managed monorepo at repo root (private root package, workspaces `packages/*`, `apps/*`, `skills/*`).
- **NEW** root config: `tsconfig.base.json`, `biome.json`, `.oxlintrc.json`, `.gitignore`, `nx.json` (Nx 22.7.1, `bun@1.3.14` packageManager, `pluginsConfig` for all four plugin scopes, empty `plugins: []`).
- **NEW** `.husky/pre-commit` runs `bunx biome format --write .` on every commit.
- **NEW** `scripts/spec-check.ts` scans `openspec/` and `packages/*/src/plugin.ts` for duplicate target/inference definitions; exits non-zero on conflict.
- **NEW** `openspec/specs/SPEC.md` captures purpose, architecture, file-trigger matrix, demo plan, skills catalog, TDD workflow, two-PR strategy.
- **NEW** `openspec/changes/initial-monoreo/` with `proposal.md` (this file), `specs/`, `design.md`, `tasks.md` mapped 1:1 to convoy beads.
- **NEW** `openspec/config.yaml` extended with project context.
- **NEW** dev-deps installed at root via `bun add -d` (latest): `@fission-ai/openspec`, `@nx/devkit@22.7.1`, `nx@22.7.1`, `@biomejs/biome`, `oxlint`, `tsdown`, `vitest`, `typescript`, `@types/node`, `husky`.

This bead creates only the workspace shell + SPEC + OpenSpec change folder. No plugin packages are created here; those land in the four plugin beads and the contracts/demo beads.

## Capabilities

### New Capabilities

- `monorepo-skeleton`: bun workspaces, root tooling config, husky pre-commit biome format, nx.json with plugin scopes and empty plugins array.
- `spec-driven-workflow`: OpenSpec change folder `initial-monoreo` with proposal, specs, design, tasks; SPEC.md at openspec/specs root.
- `spec-conflict-detector`: scripts/spec-check.ts that fails CI if two sources define the same target/inference key.

### Modified Capabilities

None (no existing specs).

## Impact

- **License**: `LICENSE` (MIT, Copyright nx-devkit) kept unchanged.
- **Affected files**: only the new files listed above plus the existing `.gitignore` (extended to include `.nx/`, `.nx-cache/`, `node_modules/`, `dist/`, `coverage/`, `.kilocode/`).
- **Bun lockfile**: `bun.lock` generated.
- **No runtime impact**: this bead ships no plugin code yet.
- **No upstream API impact**: nx.json `plugins: []` is empty until the wire-up bead (bead `5bed80e9`).
