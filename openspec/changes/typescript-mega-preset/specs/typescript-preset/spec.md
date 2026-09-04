# Spec: typescript-preset (mega-preset extension)

## ADDED Requirements

### Requirement: Native Node test runner inference
When a project has `tsconfig.json` and test files (`*.test.ts` or `*.spec.ts` in `src/` or `test/`) but NO `vitest.config.*`, the plugin MUST infer a `test` target using `node --test`.

#### Scenario: Native test target inferred
- **WHEN** a project has `tsconfig.json` and `src/foo.test.ts` but no `vitest.config.*`
- **THEN** the plugin infers a `test` target with command `node --test --test-reporter spec`

#### Scenario: Vitest takes priority over native
- **WHEN** a project has both `vitest.config.ts` and `src/foo.test.ts`
- **THEN** the plugin infers vitest targets (`test`, `test:watch`, `test:coverage`) and does NOT infer native node targets

#### Scenario: No test files means no test targets
- **WHEN** a project has `tsconfig.json` but no test files and no vitest config
- **THEN** the plugin infers no test targets

### Requirement: TAP reporter option
When `tap: true` option is set and native test targets are inferred, the plugin MUST infer a `test:tap` target using `node --test --test-reporter tap`.

#### Scenario: TAP target inferred
- **WHEN** `tap: true` is set and project has test files but no vitest config
- **THEN** the plugin infers both `test` (spec reporter) and `test:tap` (tap reporter) targets

### Requirement: Coverage option
When `coverage: true` option is set and native test targets are inferred, the plugin MUST infer a `test:coverage` target using `node --test --experimental-test-coverage`.

#### Scenario: Coverage target inferred
- **WHEN** `coverage: true` is set and project has test files but no vitest config
- **THEN** the plugin infers a `test:coverage` target

### Requirement: Oxlint target delegation
When `oxlint: true` (default) and a project has `.oxlintrc.*`, the plugin MUST infer a `lint` target using `npx oxlint .`.

#### Scenario: Oxlint target inferred
- **WHEN** a project has `tsconfig.json` and `.oxlintrc.json`
- **THEN** the plugin infers a `lint` target with command `npx oxlint .`

### Requirement: Biome format and lint targets
When `biome: true` (default) and a project has `biome.json` or `biome.jsonc`, the plugin MUST infer `format`, `format-check`, and `lint` targets using `npx biome`.

#### Scenario: Biome format targets inferred
- **WHEN** a project has `tsconfig.json` and `biome.json`
- **THEN** the plugin infers `format` (cache: false), `format-check` (cache: true), and `lint` (cache: true) targets

### Requirement: Tsdown build target
When `tsdown: true` (default) and a project has `tsdown.config.ts`, the plugin MUST infer a `build` target using `npx tsdown`.

#### Scenario: Build target inferred
- **WHEN** a project has `tsconfig.json` and `tsdown.config.ts`
- **THEN** the plugin infers a `build` target with command `npx tsdown`, outputs `{projectRoot}/dist`, and `dependsOn: ['^build']`

## MODIFIED Requirements

### Requirement: TypeScript preset infers typecheck and test targets
The plugin MUST infer `typecheck` from `tsconfig.json` (existing). Test target inference now supports BOTH vitest (when `vitest.config.*` exists) AND native Node test runner (when test files exist without vitest config).

#### Scenario: All targets from one plugin
- **WHEN** a project has `tsconfig.json`, `tsdown.config.ts`, `.oxlintrc.json`, `biome.json`, and `src/foo.test.ts`
- **THEN** the plugin infers `typecheck`, `build`, `lint`, `format`, `format-check`, and `test` targets — all from `@nx-devkit/typescript` alone
