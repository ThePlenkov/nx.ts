# Tasks: Config-free tsdown build inference

## 1. Implementation

- [x] Add `hasConfigFreeTsdownEntry()` to `packages/typescript-preset/src/targets/build.ts` — true when `src/index.ts` exists AND `package.json` has `exports`, `bin`, or `main` + `files`
- [x] Wire fallback into `src/plugin.ts` tsdown block: `tsdownConfigPath || hasConfigFreeTsdownEntry(absProjectRoot)`
- [x] Re-export the helper from `src/plugin.ts` alongside existing build helpers

## 2. Tests

- [x] Spec: `exports` + `src/index.ts` → `build`/`build:watch` inferred
- [x] Spec: `bin` + `src/index.ts` → `build` inferred
- [x] Spec: `src/index.ts` without publishable fields → no build
- [x] Spec: `exports` without `src/index.ts` → no build
- [x] Spec: `tsdown.config.ts` still wins when both signals present
- [x] Spec: `tsdown: false` suppresses config-free inference (covered by existing tsdown:false spec)

## 3. Docs + spec

- [x] `packages/typescript-preset/README.md` — inference table row + `tsdown` option text
- [x] `packages/typescript-preset/AGENTS.md` — target table trigger column
- [x] Root `AGENTS.md` — preset inference matrix row
- [x] OpenSpec change `config-free-tsdown-build` (proposal/tasks/spec delta)

## 4. Verification

- [ ] `bun test` (package) — green
- [ ] `bun run build` — green
- [ ] `bun run lint` + `bun run format:check` — clean
- [ ] `bunx openspec validate config-free-tsdown-build --strict` — clean
