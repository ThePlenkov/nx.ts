---
date: 2026-09-17
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
