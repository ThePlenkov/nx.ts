# REVIEW.md

Rules for AI code reviewers (Claude Code Review, GitHub Copilot, CodeRabbit custom instructions, etc.) reviewing this repository. Keep this file short; long REVIEW.md dilutes rules.

## Important

Reserve `Important` for issues that are behavior-breaking or have real consequences:

- Behavior-breaking bugs (incorrect logic, broken contracts, data loss, race conditions).
- Security issues (injection, path traversal, unsafe deserialization, leaked secrets, missing input validation on external input).
- Schema/interface drift: an `AGENTS.md` or `schema.json`/`schema.d.ts` definition that no longer matches the source, or vice versa.
- API breaking changes (renamed/removed exports, changed signatures, changed default behavior).
- Missing tests for new public API surface.
- A new public option exposed in plugin code is NOT mirrored in `schema.json`/`schema.d.ts`, the corresponding `AGENTS.md` interface definition, AND any `SKILL.md` that documents options.

## Nit

Reserve `Nit` for naming, comments, and minor refactors. Cap at **5 nits per review**. Do not post nits that don't have a concrete improvement.

## Skip

Do not flag findings in:

- `bun.lock`, `package-lock.json`, any `*.lock` file
- `apps/demo/dist/**`, `**/dist/**`, `**/coverage/**`
- `node_modules/**`
- Auto-generated files under `apps/demo/**/dist/**` and `apps/demo/**/.nx/**`
- `scripts/spec-check.ts` (intentionally minimal, not part of the published API)

## Already enforced by CI

Do not duplicate. These are caught by existing tooling:

- Linting (oxlint, biome)
- Formatting (biome)
- Type errors (tsgo)
- Security hotspots (SonarCloud S-rules in `release.yml`)

## Always check

Repo-specific rules every review should flag with a `file:line` citation:

- `createNodesV2` callbacks must honor their `options` parameter.
- `spawnSync` / `exec` calls must have a timeout.
- `JSON.parse` errors must be distinguished from `readFileSync` FS errors.
- Cross-platform path ops: use `dirname` / `joinPathFragments`, not regex.
- npm lifecycle scripts in `package.json` are not duplicated into placeholder artifacts.

## Verification bar

Before posting any finding, require a `file:line` citation in the source. Do not infer issues from naming, directory structure, or PR description. If you cannot cite the line, do not post it.

## Re-review convergence

After the first review on a PR, suppress new nits. On subsequent reviews, only post new `Important` findings.

## Summary shape

Open the review body with a count line, e.g. `2 factual, 4 style`. When there are no factual issues, lead with "no factual issues".

## Cross-fork rule

The fork PR and the upstream PR reference the same branch and contain the same code. Do not flag divergence between them.

For per-PR review history, see [.agents/pr-review/CHANGELOG.md](./.agents/pr-review/CHANGELOG.md).