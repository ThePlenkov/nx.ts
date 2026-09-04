# Tasks: @nx-devkit/skill plugin

Tasks map to independent beads. Status: `[ ]` pending, `[x]` done.

## 1. Scaffold package

- [ ] Create `packages/skill/package.json` (`@nx-devkit/skill`, peerDep `@nx/devkit >=22`)
- [ ] Create `packages/skill/tsdown.config.ts` (entry: `src/index.ts`)
- [ ] Create `packages/skill/vitest.config.ts`
- [ ] Create `packages/skill/executors.json`
- [ ] Create `packages/skill/AGENTS.md`
- [ ] Create `packages/skill/README.md`
- [ ] Add `packages/skill` to root `package.json` workspaces
- [ ] `bun install` succeeds

## 2. Plugin: createNodesV2

- [ ] Write failing `test/plugin.spec.ts`: SKILL.md → project with build/lint/validate/os-check/size-check targets
- [ ] Write failing test: workspace root SKILL.md skipped
- [ ] Write failing test: node_modules SKILL.md skipped
- [ ] Write failing test: custom target names via options
- [ ] Implement `src/plugin.ts` with `createNodesV2`
- [ ] Implement `src/lib/discovery.ts` helpers
- [ ] `bun test` → GREEN

## 3. Build executor

- [ ] Write failing `test/executor.spec.ts`: build executor compiles skill to skills-sh
- [ ] Write failing test: invalid target option fails
- [ ] Implement `src/executors/build/executor.ts`
- [ ] Implement `src/executors/build/schema.json`
- [ ] Implement `src/lib/compiler.ts` (thin wrapper over skills-compiler)
- [ ] `bun test` → GREEN

## 4. Wire-up + publish

- [ ] Register `@nx-devkit/skill` in root `nx.json` pluginsConfig
- [ ] Run `bunx nx show project .` — no errors
- [ ] `bun run check:spec` — no conflicts with other plugins
- [ ] Publish placeholder via `@nx-devkit/prepare-for-release:publish-placeholder`
- [ ] Set up OIDC trust for `@nx-devkit/skill`

## 5. Consumer migration (separate PRs, not in this change)

- [ ] `theplenkov-ai/skills` PR: switch from `file:./tools/nx-skill` to `@nx-devkit/skill`
- [ ] `ThePlenkov/skills` PR: add `@nx-devkit/skill` + `nx.json`

## 6. Verification

- [ ] `bun test` — all pass
- [ ] `bun run build` — build succeeds
- [ ] `bun run lint` — clean
- [ ] `bun run format:check` — clean
- [ ] `bash scripts/e2e.sh` — demo passes
- [ ] `bun run check:spec` — no conflicts
