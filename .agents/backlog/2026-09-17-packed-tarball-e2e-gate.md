---
date: 2026-09-17
tags: [ci, e2e, release]
source: https://github.com/nx-devkit/nx.ts/pull/32
---

## Problem

The published `@nx-devkit/typescript@0.1.0` bootstrap was broken from the
registry even though CI was green — the bin never installed the plugin into
the consumer, so `nx g` could not resolve it. CI tests the repo workspace,
not the packed artifact a consumer actually installs.

## Proposed action

Add a CI job (or extend `scripts/e2e.sh`) that packs every publishable
package (`npm pack`), installs them into a scratch consumer, and runs the
real bootstrap path (`npx nx-devkit-typescript init` equivalent + `nx show
projects`). Gate `release.yml`'s publish step on it so a broken tarball can
never reach the registry again.
