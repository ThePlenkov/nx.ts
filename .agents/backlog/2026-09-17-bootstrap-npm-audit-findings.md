---
date: 2026-09-17
status: resolved 2026-09-18
tags: [security, bootstrap, docs]
source: registry smoke test of @nx-devkit/typescript@0.1.1
---

## Problem

The scratch-consumer bootstrap reported `2 high severity vulnerabilities`
from `npm audit` and an `allow-scripts` warning for `nx@23.2.1`'s
postinstall script. Neither blocks the command, but a consumer hitting
them on first contact has no guidance.

## Proposed action

Identify which transitive deps drive the two high findings
(`npm audit --json` in the scratch consumer); if they are Nx's own deps,
document the expected warning in the typescript-preset README bootstrap
section; if they are ours, file/fix upstream. Also document the
`allow-scripts` prompt: explain what `nx`'s postinstall actually runs
(`node -e "try{require('./dist/bin/post-install')}catch(e){}"` — loads
Nx's post-install task, e.g. validating/selecting the platform-native
binary) and how a consumer can verify it themselves (`npm view nx
scripts`, or inspect `node_modules/nx/package.json` → `scripts`) before
deciding whether to approve it — verification steps, not a blanket
"safe to approve" claim.

## Findings (2026-09-18)

- Root cause: `nx@23.2.1` exact-pins `smol-toml@1.6.1` →
  [GHSA-7w5x-hrqm-74c2](https://github.com/advisories/GHSA-7w5x-hrqm-74c2)
  (DoS via malformed TOML). Both "high" entries are this single chain —
  `nx` as affected parent + `smol-toml` itself. Not our dep.
- Upstream fix already merged: nrwl/nx#37059 bumps to `smol-toml@1.7.1`;
  present in `nx@23.3.0-canary.*`, lands with the next stable release.
- Consumer mitigation documented: `"overrides": { "smol-toml": "^1.7.1" }`.
- `allow-scripts` / postinstall: `nx show projects` worked in our
  packed-tarball e2e consumer where the postinstall never ran — that
  establishes it for this environment, not universally (the hook also
  does platform-support and Nx Cloud checks). README directs consumers
  to verify the installed script for their version before skipping.

## Resolution

Documented both warnings in `packages/typescript-preset/README.md` →
"First-install warnings you may see" (same PR that resolves this item).
