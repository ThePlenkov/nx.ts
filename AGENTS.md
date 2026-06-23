# AGENTS.md — nx-devkit master handbook

This document is the master agent handbook for the `nx-devkit-plugins` workspace. Every polecat and humans-as-agent reads it first. For human-contributor rules (fork, branch naming, PR flow) see [`CONTRIBUTING.md`](./CONTRIBUTING.md). For npm-consumer usage see each `packages/*/README.md`.

## What this repo is

A monorepo of **zero-config Nx inference plugins** under the `@nx-devkit` scope. Each plugin inspects a config file already present in a TypeScript project and auto-injects a matching Nx target via `createNodesV2`. Consumers do not write `project.json`; targets are derived from files they already keep.

## Plugin matrix (scope ownership)

| Package | Owns directory | Touch-allowed-for-beads |
|---|---|---|
| `packages/tsdown` | `packages/tsdown/**` | beads scoped to tsdown only |
| `packages/oxlint` | `packages/oxlint/**` | beads scoped to oxlint only |
| `packages/biome` | `packages/biome/**` | beads scoped to biome only |
| `packages/typescript-preset` | `packages/typescript-preset/**` | beads scoped to typescript-preset only |
| `packages/prepare-for-release` | `packages/prepare-for-release/**` | beads scoped to prepare-for-release only |

Per-package options interfaces, file layout, and TDD workflow are in each `packages/<name>/AGENTS.md` — read the one for your package before touching its directory.

## Scope rules (global)

- **One bead = one PR.** Do not mix plugin-source changes with documentation changes unless the bead body explicitly covers both.
- **Touch ONLY your assigned files.** Root `nx.json` and root `package.json` are owned by a single dedicated bead — check the bead body.
- **Do not open upstream PRs.** The user does that after fork PR review.
- **Do not merge into `main` yourself.**
- **Never edit** `node_modules/`, `dist/`, `coverage/`, `.nx/`, `.nx-cache/`, or `bun.lock` entries for dependencies you didn't actually add.

## TDD workflow (canonical)

This is the agent-execution checklist. The human-readable summary is in [`CONTRIBUTING.md`](./CONTRIBUTING.md).

1. Write a failing `*.spec.ts` (vitest) using `@nx/devkit` testing helpers + `memfs` / tmp dirs / `vi.mock` for child_process.
2. `bun test` → RED.
3. Implement the minimum to pass.
4. Refactor only after GREEN.
5. `bun run build` → must succeed.
6. `bun run lint` and `bun run format:check` → must be clean.
7. `bun run check:spec` → no conflicts.
8. `bunx openspec validate` → no errors.
9. Commit. Push. Open draft PR.

## Privilege escalation

If you hit any of:

- HTTP 401/403 from npm or GitHub
- 404 from the npm registry for a package you expected to exist
- "scope" / "permission" errors
- `gh` authentication failures
- OIDC trust failures during CI

**STOP. Do not retry. Mail the mayor via `gt_mail_send` and create an `gt_escalate` bead with full context.** This applies even if the failure looks transient.

## When to use prepare-for-release

Run `@nx-devkit/prepare-for-release:publish-placeholder` when:

- You are adding a brand-new package to this monorepo that needs to exist on npm before OIDC trust can be set up.
- The user has just invited you to bootstrap a fresh consumer workspace.
- You need to publish placeholders so the `release` job in `.github/workflows/release.yml` can run.

The executor is **idempotent** — already-published packages are skipped. It **never mutates** the source `package.json`; the placeholder tarball is built in a temp dir.

## Verification commands

```bash
bun install
bun run lint
bun test
bun run build
bash scripts/e2e.sh
bun run check:spec
```

All six must exit 0 before pushing.

## OpenSpec workflow

This repo uses [OpenSpec](https://github.com/Fission-AI/OpenSpec) for spec-driven changes:

1. `openspec/changes/<change-id>/proposal.md` — what & why
2. `openspec/changes/<change-id>/tasks.md` — checklist
3. `openspec/changes/<change-id>/specs/<capability>/spec.md` — delta vs `openspec/specs/`
4. `openspec validate <change-id> --strict` — must pass
5. Once the change ships, run `openspec archive <change-id>` to fold the spec delta into `openspec/specs/`.

## Spec-conflict detector

`bun run check:spec` runs `scripts/spec-check.ts`. It scans `packages/*/src/plugin.ts` and `src/executors/*/schema.json` for:

- Two plugins registering the same target name on the same file trigger
- Two packages exporting the same module name
- Inconsistent option schemas across siblings

Exits non-zero on conflict. Wire this into CI.