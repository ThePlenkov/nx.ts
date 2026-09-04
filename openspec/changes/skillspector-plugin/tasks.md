# Tasks: @nx-devkit/skillspector executor

Tasks map to independent beads. Status: `[ ]` pending, `[x]` done.

## 1. Scaffold package

- [ ] Create `packages/skillspector/package.json` (`@nx-devkit/skillspector`, peerDep `@nx/devkit >=22`)
- [ ] Create `packages/skillspector/tsdown.config.ts` (entry: `src/index.ts`)
- [ ] Create `packages/skillspector/vitest.config.ts`
- [ ] Create `packages/skillspector/executors.json`
- [ ] Create `packages/skillspector/AGENTS.md`
- [ ] Create `packages/skillspector/README.md`
- [ ] Add `packages/skillspector` to root `package.json` workspaces
- [ ] `bun install` succeeds

## 2. Plugin: createNodesV2

- [ ] Write failing `test/plugin.spec.ts`: SKILL.md → project with `scan` target
- [ ] Write failing test: workspace root SKILL.md skipped
- [ ] Write failing test: node_modules SKILL.md skipped
- [ ] Write failing test: custom `scanTargetName` via options
- [ ] Implement `src/plugin.ts` with `createNodesV2`
- [ ] `bun test` → GREEN

## 3. Scan executor — CLI wrapper

- [ ] Write failing `test/executor.spec.ts`: mock spawn, verify skillspector called with correct args
- [ ] Write failing test: `--no-llm` flag passed when `noLlm: true`
- [ ] Write failing test: baseline passed when set
- [ ] Implement `src/lib/skillspector.ts` (spawn wrapper)
- [ ] `bun test` → GREEN

## 4. Scan executor — SARIF mapping

- [ ] Write failing test: issues → SARIF results with correct ruleId, level, locations
- [ ] Write failing test: properties preserve category, confidence, remediation, code_snippet
- [ ] Implement `src/lib/sarif.ts` (types)
- [ ] Implement `src/lib/mapping.ts` (JSON → SARIF)
- [ ] `bun test` → GREEN

## 5. Scan executor — annotations

- [ ] Write failing test: code findings (.ts/.js/.py) → `::error file=...` annotations
- [ ] Write failing test: doc findings (.md) → NOT emitted as annotations
- [ ] Write failing test: annotations written to shared file (not stdout)
- [ ] Implement `src/lib/annotations.ts`
- [ ] `bun test` → GREEN

## 6. Scan executor — main

- [ ] Write failing test: executor returns `{ success: false }` on high/critical when failOnError
- [ ] Write failing test: executor returns `{ success: true }` on low/medium
- [ ] Write failing test: per-skill findings JSON written for step summary
- [ ] Implement `src/executors/scan/executor.ts`
- [ ] Implement `src/executors/scan/schema.json`
- [ ] `bun test` → GREEN

## 7. Wire-up + publish

- [ ] Register `@nx-devkit/skillspector` in root `nx.json` pluginsConfig
- [ ] Run `bunx nx show project .` — no errors
- [ ] `bun run check:spec` — no conflicts with `@nx-devkit/skill` (both trigger on SKILL.md, different targets)
- [ ] Publish placeholder via `@nx-devkit/prepare-for-release:publish-placeholder`
- [ ] Set up OIDC trust for `@nx-devkit/skillspector`

## 8. Consumer migration (separate PRs)

- [ ] `theplenkov-ai/skills` PR: switch from `file:./actions/skillspector/nx-skillspector` to `@nx-devkit/skillspector`
- [ ] `ThePlenkov/skills` PR: add `@nx-devkit/skillspector` + `nx.json`

## 9. Verification

- [ ] `bun test` — all pass
- [ ] `bun run build` — build succeeds
- [ ] `bun run lint` — clean
- [ ] `bun run format:check` — clean
- [ ] `bash scripts/e2e.sh` — demo passes
- [ ] `bun run check:spec` — no conflicts
