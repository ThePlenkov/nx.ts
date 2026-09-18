# Tasks: @nx-devkit/nx-cloud plugin

Tasks map to independent beads. Status: `[ ]` pending, `[x]` done.

## 1. Scaffold package

- [x] Create `packages/nx-cloud/package.json` (`@nx-devkit/nx-cloud`, peerDep `@nx/devkit ^22 || ^23`)
- [x] Create `packages/nx-cloud/tsdown.config.ts` (entries: index, plugin, rotate executor, init generator)
- [x] Create `packages/nx-cloud/vitest.config.ts`
- [x] Create `packages/nx-cloud/tsconfig.json`
- [x] Create `packages/nx-cloud/executors.json` and `generators.json`
- [x] Create `packages/nx-cloud/AGENTS.md` and `README.md`
- [x] `bun install` succeeds (workspace glob `packages/*` covers it)

## 2. Plugin: createNodesV2

- [x] Write failing `src/plugin.spec.ts`: root `nx.json` → `nx-cloud-rotate` target on root project (`.` )
- [x] Write failing test: custom `targetName` option
- [x] Write failing test: nested `nx.json` ignored
- [x] Implement `src/plugin.ts` with `createNodesV2`
- [x] `bun test` → GREEN

## 3. Rotate executor

- [x] Write failing `src/executors/rotate/rotate.spec.ts`: v2 endpoint → `nxCloudId` written, stale `nxCloudAccessToken` removed
- [x] Write failing test: 404 → v1 fallback → `nxCloudAccessToken` written
- [x] Write failing test: `dryRun` leaves `nx.json` untouched
- [x] Write failing tests: `workspaceName`/`cloudUrl`/`installationSource` options, `NX_CLOUD_API` env → `nxCloudUrl`, non-404 + message-body errors throw, git-log failure falls back to now
- [x] Implement `src/executors/rotate/executor.ts` + `schema.json` + `schema.d.ts`
- [x] `bun test` → GREEN

## 4. Init generator

- [x] Write failing `src/generators/init/generator.spec.ts`: registers plugin, idempotent, preserves existing plugins, custom `pluginPath`
- [x] Implement `src/generators/init/generator.ts` + `schema.json`
- [x] `bun test` → GREEN

## 5. Wire-up

- [x] Register `./packages/nx-cloud/src/plugin.ts` in root `nx.json` plugins
- [x] Add `packages/nx-cloud` to `release.projects` in root `nx.json`
- [ ] `bunx nx show project nx-devkit-plugins` — `nx-cloud-rotate` target inferred on root project
- [ ] `bun run check:spec` — no conflicts with other plugins

## 6. Verification

- [ ] `bun test` — all pass
- [ ] `bun run build` — build succeeds
- [ ] `bun run lint` — clean
- [ ] `bun run format:check` — clean
- [ ] `bunx openspec validate` — no errors
- [ ] `bash scripts/e2e.sh` — demo passes

## 7. Publish (separate bead)

- [ ] Publish placeholder via `@nx-devkit/prepare-for-release:publish-placeholder`
- [ ] Set up OIDC trust for `@nx-devkit/nx-cloud`
