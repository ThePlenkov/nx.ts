# Spec: typescript-preset (config-free tsdown build)

## ADDED Requirements

### Requirement: Config-free tsdown build inference
When `tsdown: true` (default) and a project has NO `tsdown.config.*` but has `src/index.ts` AND a `package.json` with a publishable signal (`exports` field, `bin` field, or `main` + `files`), the plugin MUST infer the same `build` and `build:watch` targets it infers for `tsdown.config.*`.

#### Scenario: Publishable package with exports gets build targets
- **WHEN** a project has `tsconfig.json`, `src/index.ts`, and `package.json` with an `exports` field but no `tsdown.config.*`
- **THEN** the plugin infers `build` (executor `@nx-devkit/typescript:build`, outputs `{projectRoot}/dist`, `dependsOn: ['^build']`) and `build:watch` targets

#### Scenario: Publishable package with main + files gets build targets
- **WHEN** a project has `tsconfig.json`, `src/index.ts`, and `package.json` with both `main` and `files` fields but no `tsdown.config.*`
- **THEN** the plugin infers `build` and `build:watch` targets

#### Scenario: Publishable package with bin gets build targets
- **WHEN** a project has `tsconfig.json`, `src/index.ts`, and `package.json` with a `bin` field but no `tsdown.config.*`
- **THEN** the plugin infers `build` and `build:watch` targets

#### Scenario: Bare src/index.ts is not enough
- **WHEN** a project has `tsconfig.json` and `src/index.ts` but `package.json` has no `exports`, `bin`, or `main` + `files` and no `tsdown.config.*`
- **THEN** the plugin does NOT infer `build`/`build:watch`

#### Scenario: Publishable package without conventional entry gets no build
- **WHEN** a project has `tsconfig.json` and `package.json` with `exports` but no `src/index.ts` and no `tsdown.config.*`
- **THEN** the plugin does NOT infer `build`/`build:watch` (tsdown would fail with "No input files")

#### Scenario: Explicit config still wins
- **WHEN** a project has `tsdown.config.ts` and also satisfies the publishable-package heuristic
- **THEN** the plugin infers `build`/`build:watch` from the config path as before (same targets, no behavioral change)

#### Scenario: tsdown option disables config-free inference
- **WHEN** `tsdown: false` is set and a project satisfies the publishable-package heuristic
- **THEN** the plugin does NOT infer `build`/`build:watch`

### Requirement: Build executor accepts config-free projects
The `@nx-devkit/typescript:build` executor MUST run tsdown when the project has no `tsdown.config.*` but has the conventional `src/index.ts` entry (tsdown's own fallback). It MUST still fail when neither exists.

#### Scenario: Config-free project builds via executor
- **WHEN** a project has `src/index.ts` but no `tsdown.config.*`
- **THEN** the executor invokes tsdown (which resolves `src/index.ts` as its default entry) instead of returning `{ success: false }`

#### Scenario: No config and no entry still fails
- **WHEN** a project has neither `tsdown.config.*` nor `src/index.ts`
- **THEN** the executor returns `{ success: false }` with an error naming both missing inputs
