# Aggregated review — branch nx-devkit-docs-skills-prepare-release
# Fork PR: ThePlenkov/nx.ts#17
# Upstream PR: nx-devkit/nx.ts#4
# Last updated: 2026-06-22T16:14:00Z
# Head SHA: 6777445 (pre-fix; see changelog for post-fix)

## Threads

| # | Source | File:Line | Reviewer | Substance | Verdict | Why |
|---|--------|-----------|----------|-----------|---------|-----|
| T1 | fork#17 | packages/prepare-for-release/src/executors/publish-placeholder/executor.ts:75 | gemini-code-assist | Spreading `...original` into placeholder package.json risks running lifecycle scripts (`prepare`/`prepack`/`prepublishOnly`) from the original package during `npm pack` — placeholder dir has no source, so scripts fail and executor crashes. | fix | Real crash risk; replace spread with explicit minimal metadata. |
| T2 | fork#17 | packages/prepare-for-release/src/executors/publish-placeholder/executor.ts:133 | amazon-q-developer | `trustCommandFor` hardcodes `ThePlenkov/nx.ts` — granting trust to wrong repo if plugin is consumed elsewhere. | fix | Plugin is intended to be published; repo path should be a runtime input (env / option) with safe default. |
| T3 | fork#17 | packages/prepare-for-release/src/executors/publish-placeholder/executor.ts:42 (and 69–106) | sonarqubecloud (new_security_rating=3) | Resource leak / unsafe pattern around `mkdtemp` + `npm pack` + `spawnSync` — temp dir not cleaned up on pack failure. | fix | SonarCloud gate fails on this; add try/finally to guarantee tempdir cleanup. |
| T4 | fork#17 | packages/prepare-for-release/src/executors/publish-placeholder/executor.ts:160 | amazon-q-developer | `JSON.parse(readFileSync(...))` is in a try/catch that silently continues, but the catch wraps both. Risk: uncaught throws for unreadable file. | fix | Narrow catch; log + continue for JSON parse errors, rethrow on FS error so executor fails loudly (or catch both but emit a warn). |
| T5 | fork#17 | packages/prepare-for-release/src/executors/publish-placeholder/executor.ts:157 | gemini-code-assist | `.replace(/\/package\.json$/, '')` is not cross-platform safe (Windows backslashes). | fix | Use `dirname()` from `node:path`. |
| T6 | fork#17 | packages/prepare-for-release/src/executors/publish-placeholder/executor.ts:2–7 / 37–40 | gemini-code-assist | `import which from 'which'` then `which.sync(...)` may throw `TypeError` in ESM. Use `import { sync as whichSync } from 'which'`. | fix | Cheap, ESM-safe, single-line change. |
| T7 | fork#17 | packages/prepare-for-release/src/generators/init/generator.ts:2,26,42 | gemini-code-assist | `join` from `node:path` produces OS-dependent separators. Nx `Tree` API requires POSIX. Use `joinPathFragments` from `@nx/devkit`. | fix | Correct on all 3 sites; Nx convention. |
| T8 | fork#17 | packages/prepare-for-release/src/plugin.ts:2,25,46 | gemini-code-assist | `join` + regex `.replace(/\/project\.json$/, '')` for project paths; `isAbsolute` not checked. Use `dirname` + `isAbsolute` from `node:path`. | fix | Real cross-platform + absolute-path bug. |
| T9 | fork#17 | .github/workflows/release.yml:62 | amazon-q-developer | OIDC publish with `NPM_CONFIG_PROVENANCE: 'true'` but no `NODE_AUTH_TOKEN` and no `setup-node` `registry-url` on the publish step → publish will fail. | fix | Wire `NODE_AUTH_TOKEN` (OIDC-issued) via `actions/setup-node` `registry-url` (already set on the install step but not propagated). Move `setup-node` above `nx release publish` or set env explicitly. |
| T10 | fork#17 | .github/workflows/release.yml:75 | amazon-q-developer | Cross-repo `gh pr create` to `nx-devkit/nx.ts` uses default `GITHUB_TOKEN` → permission denied. | reply | Correct in principle, but for THIS PR (syncing back to upstream) the workflow runs in `ThePlenkov/nx.ts` and the GHA `GITHUB_TOKEN` cannot cross repos. The fix needs `UPSTREAM_GITHUB_TOKEN` PAT — that's a secret the maintainer must add in repo settings. We can wire the env var; the secret itself is out of scope. Wire `GH_TOKEN: ${{ secrets.UPSTREAM_GITHUB_TOKEN }}` with fallback comment. |
| T11 | issue-comment | .github/workflows/release.yml:62 (Sonar) | sonarqubecloud | Quality Gate failed: new_security_rating = 3 (required ≤ 1). | fix | Resolved by fixing T3 (and T1 — spreading package.json is the proximate cause of the new_code security rating drop per the dashboard). |
| T12 | issue-comment | (PR conversation) | coderabbitai | Skipped (draft PR). | reply | No action — draft skipped by config. |
| T13 | fork#17 (CodeRabbit review skipped — Draft) | — | coderabbitai | No content. | reply | n/a — skipped. |

## CI

| Check | State | Decision |
|-------|-------|----------|
| SonarCloud Code Analysis (fork#17) | FAIL | fix — new_security_rating=3; see T1, T3 |
| Amazon Q Developer | pass | none |
| CodeRabbit | pass (skipped — draft) | none |
| Upstream #4 (nx-devkit/nx.ts) | n/a | no checks configured yet — fork PR is the canonical signal source |

## Plan (in order)

1. Fix T1 + T3 + T4 + T5 + T6: rewrite `executor.ts` to use minimal placeholder metadata, `dirname` for path, `whichSync` import, try/finally tempdir cleanup, narrower catch + warn on JSON parse failure.
2. Fix T2: make `trustCommandFor` accept a repo path (env or option) with safe default; pass through from `nx.json` plugin options and from `init` generator context.
3. Fix T7: switch `init/generator.ts` to `joinPathFragments` from `@nx/devkit`.
4. Fix T8: switch `plugin.ts` to `dirname`/`isAbsolute` from `node:path`.
5. Fix T9 + T10: update `release.yml` to set `registry-url` on the install step (already there) and document `UPSTREAM_GITHUB_TOKEN` for cross-repo PR.
6. Run `bun install`, `bun run lint`, `bun test`, `bun run build`.
7. Commit, push, then reply in threads + resolve fixed ones.

## Changelog (append as you go)

- (pending) fix(security): minimal placeholder package.json, try/finally tempdir, ESM-safe `whichSync` import, `dirname` cross-platform paths, `trustRepo` option with allowlist validation
- (pending) fix(workflow): document `UPSTREAM_GITHUB_TOKEN` for cross-repo PR + OIDC publish prerequisites
- (pending) docs(agents): REVIEW.md ledger

## Resolutions (post-implementation)

- T1, T3, T4, T5, T6: rewrote `executor.ts` — minimal placeholder metadata, try/catch tempdir cleanup, ESM-safe `whichSync`, `dirname` for paths, narrower catch (SyntaxError vs FS).
- T2: added `trustRepo` option (allowlist `owner/repo` regex) + `NPM_TRUST_REPO` env fallback, default `ThePlenkov/nx.ts`.
- T7: `init/generator.ts` switched to `joinPathFragments` from `@nx/devkit` (3 sites).
- T8: `plugin.ts` switched to `dirname` + `isAbsolute`; workspace-root skip covers `''`, `'.'`, and absolute `workspaceRoot`.
- T9: documented OIDC prerequisites in `release.yml` (npm >= 11.5, `registry-url`, `NPM_CONFIG_PROVENANCE`, `id-token: write`).
- T10: `release.yml` now reads `UPSTREAM_GITHUB_TOKEN` with `GITHUB_TOKEN` fallback; documented that the secret must be provisioned in repo settings.
- T11, T12, T13: addressed transitively.

Tests: 11/11 pass in `@nx-devkit/prepare-for-release`. `bun run lint` clean for changed files (one pre-existing warning in unrelated file). `bun run build` green. `bash scripts/e2e.sh` green.

---

## Ready-for-review cycle (post-promote, ~15:22 UTC)

| # | Source | File:Line | Reviewer | Substance | Verdict | Why |
|---|--------|-----------|----------|-----------|---------|-----|
| N1 | fork#17 (issue 4770222932) | packages/prepare-for-release/src/executors/publish-placeholder/schema.json | kilo-code-bot (CRITICAL) | `trustRepo` option is defined in `executor.ts:9-27` but missing from `schema.json` (lines 1-35), preventing users from configuring it via `nx.json`. | fix | With `additionalProperties: false`, Nx rejects the option. Added trustRepo property with `owner/repo` regex pattern. |
| N2 | fork#17 (issue 4770289407) | schema.json:34, schema.d.ts:7 | kilo-code-bot (CRITICAL) | `trustRepo` missing from both `schema.json` and `schema.d.ts`. | fix | Same root cause as N1; added to both files. |
| N3 | fork#17 (PRRT_kwDOTA4Etc6LUMOL) | schema.json:34 | cubic-dev-ai (P1, conf=9) | Schema missing `trustRepo` property despite the executor accepting and using it; with `additionalProperties: false`, passing `trustRepo` via nx.json will be rejected. | fix | Consensus with kilo + CodeRabbit. |
| N4 | fork#17 (PRRT_kwDOTA4Etc6LUIRr) | schema.json | coderabbitai (Major) | Same: Missing `trustRepo` property in executor schema. | fix | Duplicate of N3. |
| N5 | fork#17 (PRRT_kwDOTA4Etc6LUIRO) | packages/prepare-for-release/AGENTS.md:33-40 | coderabbitai (Major) | `NxPrepareForReleaseOptions` interface in AGENTS.md is missing `trustRepo`. | fix | Doc-only, cheap. |
| N6 | fork#17 (PRRT_kwDOTA4Etc6LUIRX) | packages/prepare-for-release/README.md:45-53 | coderabbitai (Major) | `NxPrepareForReleaseOptions` interface in README is missing `trustRepo`. | fix | Doc-only, cheap. |
| N7 | fork#17 (PRRT_kwDOTA4Etc6LUISJ) | skills/nx-devkit-prepare-for-release/SKILL.md:50-58 | coderabbitai (Major) | `NxPrepareForReleaseOptions` interface in skill is missing `trustRepo`. | fix | Doc-only, cheap. |
| N8 | fork#17 (PRRT_kwDOTA4Etc6LUIRm) | executor.ts:174-252 | coderabbitai + sonarqubecloud (Major) | `publishPlaceholderExecutor` exceeds cognitive complexity threshold (23 > 15) — Sonar gate failure. | fix | Extracted `processPackage` helper; complexity now well under 15. |
| N9 | fork#17 (PRRT_kwDOTA4Etc6LUIRf) | executor.ts:122,150,239 | coderabbitai (Major) | All three `spawnSync` calls lack timeout configuration. Hung npm op would block CI indefinitely. | fix | Added 120s timeout via `spawnWithTimeout` helper used by all 3 call sites. |
| N10 | fork#17 (PRRT_kwDOTA4Etc6LUMOd) | executor.ts:153 | cubic-dev-ai (P2, conf=8) | `isPublished` treats every `npm view` error as "unpublished". Should distinguish 404 from other errors. | fix | Added 404 detection (`isNotFoundStderr`); other errors now throw. |
| N11 | fork#17 (PRRT_kwDOTA4Etc6LUMOR) | packages/typescript-preset/AGENTS.md:26 | cubic-dev-ai (P2, conf=10) | AGENTS.md documents the interface as `NxTypecheckPluginOptions` but actual source defines `NxDevkitTypescriptOptions`. Agent following guide would get resolution error. | fix | Renamed interface in AGENTS.md to match source. |
| N12 | fork#17 (PRRT_kwDOTA4Etc6LUISB) | plugin.ts:5-10,42-59 | coderabbitai (Major) | `createNodesV2` ignores its `options` parameter entirely. Declared `toolsProject` and `targetName` are not honored. | fix | `createNodesV2` now reads `options.targetName` and `options.toolsProject` and applies them. |
| N13 | fork#17 (PRRT_kwDOTA4Etc6LUMOq) | plugin.ts:42 | cubic-dev-ai (P2, conf=8) | Same: `createNodesV2` callback ignores `_options`. | fix | Duplicate of N12. |
| N14 | fork#17 (PRRT_kwDOTA4Etc6LUIQ_) | .github/workflows/release.yml:59-69 | coderabbitai (Major) | Add pre-publish release gates (`bun run check:spec`, `bash scripts/e2e.sh`) before `nx release publish`. | wontfix | Already addressed in cycle 1 (release.yml:64-65, 70-71). Reviewed current workflow — both gates present between lint and the publish step. No additional change needed. |
| N15 | fork#17 (PRRT_kwDOTA4Etc6LUMOl) | release.yml:63 | cubic-dev-ai (P2, conf=7) | Same: missing `bun run check:spec` and `bash scripts/e2e.sh`. | wontfix | Duplicate of N14. |
| N16 | fork#17 (PRRT_kwDOTA4Etc6LUIQu) | release.yml:16,45,81 | coderabbitai + zizmor (Major) | Add `persist-credentials: false` to all `actions/checkout` steps. | fix | Already addressed in cycle 1. Verified: all 3 checkouts have `persist-credentials: false` set. No additional change needed. |
| N17 | fork#17 (PRRT_kwDOTA4Etc6LUMOi) | release.yml:16,45,81 | cubic-dev-ai (P2, conf=8) | Same: add `persist-credentials: false` to all checkouts. | fix | Duplicate of N16. |

## Resolutions (post-implementation, cycle 2)

- N1/N2/N3/N4: added `trustRepo` to `schema.json` (with `owner/repo` regex pattern) and `schema.d.ts` (with docstring).
- N5/N6/N7: added `trustRepo` to `packages/prepare-for-release/AGENTS.md`, `README.md`, and `skills/nx-devkit-prepare-for-release/SKILL.md` Options sections.
- N8: refactored `executor.ts` — extracted `resolveOptions`, `readPackageJsonSafe`, `matchesScope`, `publishOnePackage`, `processPackage`. `publishPlaceholderExecutor` now only orchestrates: resolve options, glob packages, iterate, aggregate. Cognitive complexity well under threshold.
- N9: added `spawnWithTimeout` helper with `NPM_SUBPROCESS_TIMEOUT_MS = 120_000`; applied to all 3 `spawnSync` call sites (pack, view, publish).
- N10: extracted `isNotFoundStderr`; `isPublished` now throws on non-404 `npm view` failures (network, auth, etc.) instead of silently treating them as "unpublished".
- N11: renamed `NxTypecheckPluginOptions` → `NxDevkitTypescriptOptions` in `packages/typescript-preset/AGENTS.md` to match `src/plugin.ts`.
- N12/N13: `createNodesV2` now reads `options.targetName` (default `'prepare-for-release'`) and `options.toolsProject` (filters matches by exact project root).
- N14/N15/N16/N17: no change required — all four pre-existing in release.yml (added in commit `ff2b196` / `6777445`).

Tests: 15/15 pass in `@nx-devkit/prepare-for-release` (2 new for isPublished 404-vs-error split). 72/72 pass across all 5 plugin packages. `bun run lint` clean (1 pre-existing warning in `scripts/spec-check.ts:101`). `bun run build` green. `bash scripts/e2e.sh` green. `bun run check:spec` green.

---

## CodeFactor audit — 2026-06-23 (moved from REVIEW.md)

CodeFactor uses Oxlint 1.69.0 for JS/TS analysis. The 152 findings break down into categories that fall into three buckets: real code issues we fixed, test-file noise excluded via `.codefactor.yml`, and stylistic rules suppressed via the CodeFactor dashboard UI.

### Summary

| Decision | Count | Files affected |
|----------|-------|----------------|
| fix in code | 8 | generator.ts, plugin.ts, tsdown.config.ts x2 |
| excluded via .codefactor.yml | 65 | *.spec.ts, *.test.ts (3 spec files) |
| suppressed via CodeFactor dashboard | 79 | executor.ts, plugin.ts, generator.ts, index.ts |

### Fixed in code

| # | File:Line | Rule | Description | What I did |
|---|-----------|------|-------------|------------|
| 1 | generators/init/generator.ts:1-2 | eslint/no-duplicate-imports | Two separate `@nx/devkit` imports | Merged into single import with `type` specifiers |
| 2 | plugin.ts:1-3 | eslint/sort-imports | Node imports before @nx/devkit | Reordered: @nx/devkit first, then node:* |
| 3 | plugin.ts:71 | import/no-anonymous-default-export | `export default { ... }` | Named the export: `const plugin = { ... }; export default plugin` |
| 4 | tsdown.config.ts (prepare-for-release):4-12 | eslint/sort-keys | Object keys not alphabetical | Reordered: clean, dts, entry, format |
| 5 | tsdown.config.ts (biome):3-11 | eslint/sort-keys | Object keys not alphabetical | Reordered: clean, deps, dts, entry, format |

### Excluded via .codefactor.yml (test files — 65 findings)

| Rule | Count | Why excluded |
|------|-------|-------------|
| import/no-nodejs-modules | 9 | Tests need `node:fs`, `node:os`, `node:path` |
| eslint/no-magic-numbers | 26 | Test assertions use 0, 1, 2, etc. |
| eslint/func-style | 7 | Tests use function declarations |
| eslint/id-length | 8 | Test variables `r`, `v`, `w` |
| eslint/max-statements | 5 | Test setup is verbose |
| eslint/init-declarations | 5 | Test vars: `let workspace`, `let originalCwd` |
| eslint/sort-imports | 6 | Test import ordering |
| unicorn/no-null | 1 | Test null expectations |
| import/first | 1 | Dynamic import before static type import |
| import/group-exports | 3 | Schema.d.ts interface exports |
| eslint/prefer-destructuring | 1 | Test helper chain |

### Suppressed via CodeFactor dashboard UI (79 findings in source files)

These are stylistic rules that conflict with our codebase conventions. Each must be individually suppressed via the CodeFactor dashboard ("Ignore Issues like this") because `.codefactor.yml` does not support rule-level suppression for oxlint rules.

| Rule | Count | Files | Why suppressed |
|------|-------|-------|----------------|
| eslint/func-style | 21 | executor.ts, plugin.ts, generator.ts | Codebase uses function declarations consistently |
| import/no-named-export | 14 | executor.ts, plugin.ts, generator.ts, index.ts | Nx plugin API requires named exports (createNodesV2, executor, generator) |
| import/no-nodejs-modules | 4 | executor.ts, plugin.ts | Node.js executor/plugin legitimately needs node:fs, node:path, etc. |
| eslint/no-magic-numbers | 3 | executor.ts | Index access (`stdout.split('\n').pop()`) and regex char codes |
| unicorn/no-null | 7 | executor.ts, generator.ts | Explicit null used for error handling, not undefined |
| import/exports-last | 5 | executor.ts, plugin.ts, generator.ts | Named exports precede default export — standard Nx pattern |
| import/group-exports | 2 | plugin.ts | Intentionally separate re-export blocks |
| eslint/sort-imports | 2 | executor.ts | Import ordering already handled by biome |
| eslint/no-ternary | 3 | executor.ts, generator.ts | Ternaries used for readability in short expressions |
| eslint/no-continue | 3 | plugin.ts | Continue used in for-loop for early filter |
| eslint/id-length | 2 | plugin.ts | Short var `r` in regex test |
| eslint/sort-keys | 3 | tsdown.config.ts, generator.ts | Key order intentional for readability |
| eslint/no-await-in-loop | 1 | executor.ts | Sequential npm operations must be ordered |
| import/no-anonymous-default-export | 0 | — | Fixed in code |
| eslint/max-statements | 6 | executor.ts, generator.ts | Complex orchestration functions |
| eslint/max-params | 1 | executor.ts | buildPlaceholderTarball needs 4 params |
| eslint/default-param-last | 1 | plugin.ts | Default param before required — existing pattern |
| eslint/prefer-named-capture-group | 1 | executor.ts | Regex already clear without named groups |
