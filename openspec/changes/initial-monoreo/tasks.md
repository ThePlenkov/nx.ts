# Tasks: initial monorepo foundation

Tasks map 1:1 to convoy beads. Status icons: `[ ]` pending, `[x]` done.

## 1. Scaffold root config files

- [x] Create `package.json` (private, workspaces, scripts).
- [x] Create `tsconfig.base.json` (strict, ES2022, ESNext, Bundler).
- [x] Create `biome.json` (formatter + linter, lineWidth 100, single quotes).
- [x] Create `.oxlintrc.json` (typescript, import, unicorn, node plugins).
- [x] Extend `.gitignore` (add `.nx/`, `.nx-cache/`, `node_modules/`, `dist/`, `coverage/`, `.kilocode/`).
- [x] Create `nx.json` (Nx 22.7.1, bun packageManager, pluginsConfig, empty plugins).
- [x] Create `.husky/pre-commit` (`#!/usr/bin/env bun` + biome format).

## 2. Install latest dev-deps via `bun add -d`

- [x] `bun add -d @fission-ai/openspec@latest` (1.4.1).
- [x] `bun add -d nx@22.7.1 @nx/devkit@22.7.1`.
- [x] `bun add -d @biomejs/biome@latest` (2.5.0).
- [x] `bun add -d oxlint@latest` (1.70.0).
- [x] `bun add -d typescript@latest` (6.0.3).
- [x] `bun add -d @types/node@latest` (26.0.0).
- [x] `bun add -d tsdown@latest vitest@latest` (0.22.3 / 4.1.9).
- [x] `bun add -d husky@latest` (9.1.7).
- [x] Verify `bun install` succeeds.

## 3. Initialize OpenSpec

- [x] Verify exact init command via webfetch of Fission-AI/OpenSpec docs.
- [x] Run `bunx openspec init --tools kilocode --force`.
- [x] Trust `@fission-ai/openspec` postinstall via `bun pm trust @fission-ai/openspec`.

## 4. Author SPEC.md

- [x] Create `openspec/specs/SPEC.md` with purpose, architecture, file-trigger matrix, demo plan, skills catalog, TDD workflow, two-PR strategy, quality gates.

## 5. Author initial-monoreo change artifacts

- [x] `proposal.md` (why, what changes, capabilities, impact).
- [x] `design.md` (workspace topology, tooling, OpenSpec workflow, risks).
- [x] `tasks.md` (this file, mapped 1:1 to convoy beads).
- [x] `specs/` capability delta files.

## 6. Add spec-conflict detector

- [x] Create `scripts/spec-check.ts` scanning openspec + packages/*/src/plugin.ts for duplicate target/inference definitions; exits non-zero on conflict.

## 7. Verification

- [x] `bun install` succeeds.
- [ ] `bun run lint` clean.
- [ ] `bun run format:check` clean.
- [ ] `bun run spec:check` clean (no plugin packages yet → trivially clean).
- [ ] `bunx openspec validate` no errors.
- [ ] `LICENSE` unchanged (MIT, Copyright nx-devkit).

## Bead traceability

| Bead | Title | Tasks covered |
|---|---|---|
| `0a220f70` (this) | OpenSpec init + SPEC + monorepo skeleton | All of sections 1-7 |
| `8c089491` | `@nx-devkit/tsdown` plugin | (subsequent bead) |
| `d423389d` | `@nx-devkit/oxlint` plugin | (subsequent bead) |
| `eac7202f` | `@nx-devkit/biome` plugin | (subsequent bead) |
| `79ad4eee` | `@nx-devkit/typescript` preset plugin | (subsequent bead) |
| `5bed80e9` | Wire 4 plugins + contract test | (subsequent bead) |
| `3e5dcab7` | Demo workspace + e2e | (subsequent bead) |
| `989f2411` | Skills (per-plugin + nx-vs-nx) | (subsequent bead) |
| `f7fb7ee7` | Root README + CONTRIBUTING + 2 PRs | (subsequent bead) |
