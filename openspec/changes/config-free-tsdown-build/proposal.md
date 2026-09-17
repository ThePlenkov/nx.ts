# Proposal: Config-free tsdown build inference

## Why

Today `@nx-devkit/typescript` only infers `build`/`build:watch` when a project has an explicit `tsdown.config.*`. But tsdown itself works config-free: with no config and no CLI entry it falls back to `src/index.ts`. A publishable library (`package.json` with `exports`/`bin`, or `main` + `files`) that keeps the conventional `src/index.ts` entry therefore needs **zero** build configuration — yet gets no `build` target today.

The goal stays true to the preset philosophy: no `project.json`, and now no `tsdown.config.ts` either for the conventional library shape.

## What Changes

### `@nx-devkit/typescript`

- **ADD** `hasConfigFreeTsdownEntry()` helper in `src/targets/build.ts` — returns true when the project root has `src/index.ts` AND a `package.json` with a publishable signal (`exports` field, `bin` field, or `main` + `files`).
- **ADD** config-free build inference: when `tsdown: true` and no `tsdown.config.*` exists but `hasConfigFreeTsdownEntry()` is true, infer the same `build`/`build:watch` targets.
- **KEEP** `tsdown.config.*` precedence — explicit config continues to infer the same targets; the helper is only a fallback.
- **KEEP** `tsdown: false` escape hatch — disables build inference entirely.

## Non-goals

- No new test-runner or linter inference (separate changes).
- No `package.json#exports`-only inference — exports without `src/index.ts` would produce a broken `npx tsdown` invocation (tsdown throws "No input files").
- No inference for app-shaped projects — bare `src/index.ts` without publishable package fields stays untouched.
