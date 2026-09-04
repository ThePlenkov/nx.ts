# Tasks: TypeScript mega-preset

Tasks map to independent beads. Status: `[ ]` pending, `[x]` done.

## 1. Native Node test runner inference

- [ ] Add `inferNativeTestTargets()` to `packages/typescript-preset/src/plugin.ts`
- [ ] Add test-file discovery: scan `configFiles` for `*.test.{ts,js,mts,mjs}` / `*.spec.{ts,js,mts,mjs}` when no `vitest.config.*` is found
- [ ] Add `test` target: `node --test --test-reporter spec`
- [ ] Add `test:tap` target when `tap: true`: `node --test --test-reporter tap`
- [ ] Add `test:coverage` target when `coverage: true`: `node --test --experimental-test-coverage`
- [ ] Write tests: project with test files, no vitest config → native targets inferred
- [ ] Write tests: project with vitest config → vitest targets, NOT native
- [ ] Write tests: project with no test files → no test targets

## 2. Mega-preset delegation — oxlint

- [ ] Add `.oxlintrc.*` detection in `createNodesV2`
- [ ] Add `lint` target: `npx oxlint .` (when `oxlint: true` and `.oxlintrc.*` exists)
- [ ] Write tests: project with `.oxlintrc.json` → `lint` target inferred

## 3. Mega-preset delegation — biome

- [ ] Add `biome.json` / `biome.jsonc` detection
- [ ] Add `format` target: `npx biome format --write .` (cache: false)
- [ ] Add `format-check` target: `npx biome format --check .` (cache: true)
- [ ] Add `lint` target: `npx biome lint .` (cache: true) — only when no oxlint config
- [ ] Write tests: project with `biome.json` → format targets inferred

## 4. Mega-preset delegation — tsdown

- [ ] Add `tsdown.config.ts` detection
- [ ] Add `build` target: `npx tsdown` (cache: true, outputs: `dist/`, dependsOn: `^build`)
- [ ] Write tests: project with `tsdown.config.ts` → `build` target inferred

## 5. Options + documentation

- [ ] Extend `NxDevkitTypescriptOptions` interface with new options
- [ ] Update `packages/typescript-preset/README.md` with mega-preset usage
- [ ] Update `openspec/specs/SPEC.md` file-trigger matrix
- [ ] Update `packages/typescript-preset/AGENTS.md` with new inference rules
- [ ] Run `bun run check:spec` — no conflicts with standalone plugins

## 6. Verification

- [ ] `bun test` — all tests pass
- [ ] `bun run build` — build succeeds
- [ ] `bun run lint` — clean
- [ ] `bun run format:check` — clean
- [ ] `bash scripts/e2e.sh` — demo workspace passes with mega-preset only (no standalone plugins)
