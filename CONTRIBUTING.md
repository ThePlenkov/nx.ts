# Contributing to nx-devkit

Thanks for your interest in contributing. This guide is for humans opening PRs. AI coding agents operating in this repo should read [`AGENTS.md`](./AGENTS.md) instead — that handbook is the canonical source for scope rules, TDD workflow, and OpenSpec workflow.

## Fork and clone

Fork [`ThePlenkov/nx.ts`](https://github.com/ThePlenkov/nx.ts) to your own GitHub org first, then clone your fork:

```bash
git clone https://github.com/<your-org>/nx.ts
cd nx.ts
bun install
```

Do not branch directly off convoy branches — branch off `main`.

## Branch naming

Use one of:

- `feat/<slug>` — new plugin, new target, new option
- `fix/<slug>` — bug fix
- `docs/<slug>` — documentation only
- `chore/<slug>` — repo maintenance (CI, deps, tooling)

Slugs are lowercase kebab-case. Keep them short and descriptive (`feat/biome-format-cache`, `docs/audience-restructure`).

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(biome): add formatCache option
fix(oxlint): skip workspace root correctly on Windows
docs(readme): split audience-scoped READMEs
chore(deps): bump @nx/devkit to 22.1.0
```

The scope is usually the package name; omit it for repo-wide changes.

## PR flow

1. Push your branch to your fork.
2. Open a **DRAFT** PR against `main` (`gh pr create --draft`). The Refinery reviews the draft.
3. Address review feedback on the same branch and push again.
4. Once the Refinery approves, the user opens the upstream PR manually. **Do not open upstream PRs from your fork.**

## Adding a new plugin

The one-shot bootstrap path is the `init` generator from `@nx-devkit/prepare-for-release`:

```bash
bunx nx g @nx-devkit/prepare-for-release:init
```

This:

- Adds the plugin to `nx.json`.
- Creates a `tools` project with a `prepare-for-release` target.
- Prints the post-setup checklist (install → bootstrap → `npm trust github`).

Follow the printed checklist — install the plugin, publish placeholders, run the `npm trust github` commands locally with MFA, then commit the workflow file. CI takes over from there.

For per-package scope rules, TDD workflow, and verification commands, see [`AGENTS.md`](./AGENTS.md) and the per-package `packages/<name>/AGENTS.md`.

## Privilege escalation

If you hit any of:

- HTTP 401/403 from npm or GitHub
- 404 from the npm registry for a package you expected to exist
- "scope" / "permission" errors
- `gh` authentication failures
- OIDC trust failures during CI

**STOP. Do not retry.** Mail the mayor and create an escalation bead with full context. This applies even if the failure looks transient.

## Verification before opening a PR

```bash
bun install
bun run lint
bun test
bun run build
bash scripts/e2e.sh
bun run check:spec
```

All six must exit 0.

## More

- [`AGENTS.md`](./AGENTS.md) — AI agent handbook (TDD workflow, OpenSpec workflow, scope rules).
- [`REVIEW.md`](./REVIEW.md) — what reviewers check on each PR.

## License

By contributing, you agree that your contributions will be licensed under the MIT License. See [`LICENSE`](./LICENSE).