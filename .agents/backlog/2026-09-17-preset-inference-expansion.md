---
date: 2026-09-17
tags: [feature, typescript-preset]
source: AGENTS.md preset-as-orchestrator section
---

## Problem

The preset infers targets only from config files it knows today. Common
TypeScript project signals are not yet covered — a project whose only entry
point is `package.json#exports`/`main`, or one using a test runner other
than vitest/node-test, gets no useful targets.

## Proposed action

Expand `@nx-devkit/typescript` inference (one capability per bead):
`package.json#exports`/`main`/`bin` → `build`-adjacent inference or at
least a `typecheck` root; additional test-runner configs; optionally fold
`@nx-devkit/skill` + `@nx-devkit/skillspector` triggers into the preset
family. Each new trigger needs a `plugin.spec.ts` case + README row.
