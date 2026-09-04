# Design: TypeScript mega-preset

## Architecture

The mega-preset extends `packages/typescript-preset/src/plugin.ts` with three new inference paths, all triggered by file presence:

```
tsconfig.json found
  ├── typecheck target (existing — tsgo or tsc)
  ├── vitest.config.* found?
  │   └── YES → vitest targets (existing)
  │   └── NO  → test files (*.test.ts / *.spec.ts) found?
  │       └── YES → native node --test targets (NEW)
  │       └── NO  → no test targets
  ├── .oxlintrc.* found? (NEW)
  │   └── YES → lint target (npx oxlint .)
  ├── biome.json found? (NEW)
  │   └── YES → format, format-check, lint targets (npx biome ...)
  └── tsdown.config.ts found? (NEW)
      └── YES → build target (npx tsdown)
```

## Native Node test runner inference

### Discovery

Scan `src/` and `test/` directories for files matching `testGlob` (default: `**/*.{test,spec}.{ts,js,mts,mjs}`). Use `readdirSync` with recursive option (Node 18.17+). Skip `node_modules/`, `dist/`, `coverage/`.

### Targets

```ts
function inferNativeTestTargets(projectRoot: string, options: {
  testGlob: string;
  tap: boolean;
  coverage: boolean;
}): Record<string, TargetConfiguration> {
  const reporter = options.tap ? 'tap' : 'spec';
  const targets: Record<string, TargetConfiguration> = {
    test: {
      executor: 'nx:run-commands',
      cache: true,
      inputs: [
        `{projectRoot}/src/**/*.{test,spec}.{ts,js,mts,mjs}`,
        `{projectRoot}/test/**/*.{test,spec}.{ts,js,mts,mjs}`,
        '{projectRoot}/package.json',
        '{projectRoot}/tsconfig.json',
      ],
      options: {
        command: `node --test --test-reporter ${reporter}`,
        cwd: projectRoot,
      },
    },
  };

  if (options.tap) {
    targets['test:tap'] = {
      executor: 'nx:run-commands',
      cache: true,
      inputs: targets.test.inputs,
      options: {
        command: 'node --test --test-reporter tap | tee test-results.tap',
        cwd: projectRoot,
      },
      outputs: ['{projectRoot}/test-results.tap'],
    };
  }

  if (options.coverage) {
    targets['test:coverage'] = {
      executor: 'nx:run-commands',
      cache: true,
      inputs: targets.test.inputs,
      options: {
        command: 'node --test --experimental-test-coverage',
        cwd: projectRoot,
      },
    };
  }

  return targets;
}
```

### Priority: vitest > native

If `vitest.config.*` exists, vitest targets are inferred and native targets are NOT. This is the existing behavior — no change needed, just a new else-branch.

## Mega-preset delegation

### Approach: inline equivalents, not plugin dependencies

The mega-preset does NOT import `@nx-devkit/tsdown`, `@nx-devkit/oxlint`, or `@nx-devkit/biome`. Instead it inlines the same `nx:run-commands` target definitions that those plugins produce. This keeps the preset dependency-free and avoids version coupling.

Consumers who want the standalone plugins can still install them — the mega-preset checks `options.tsdown !== false` etc. and only infers when the config file is present. If a standalone plugin is also registered, Nx's target-merge logic handles deduplication (last-registered wins, which is deterministic based on `nx.json` plugin order).

### Inlined targets

```ts
// tsdown
{ executor: 'nx:run-commands', cache: true, outputs: ['{projectRoot}/dist'],
  options: { command: 'npx tsdown', cwd: projectRoot },
  dependsOn: ['^build'],
  inputs: ['{projectRoot}/tsdown.config.ts', '{projectRoot}/src/**/*', '{projectRoot}/package.json'] }

// oxlint
{ executor: 'nx:run-commands', cache: true,
  options: { command: 'npx oxlint .', cwd: projectRoot },
  inputs: ['{projectRoot}/src/**/*', '{projectRoot}/.oxlintrc.*', '{projectRoot}/package.json'] }

// biome format
{ executor: 'nx:run-commands', cache: false,
  options: { command: 'npx biome format --write .', cwd: projectRoot } }

// biome format-check
{ executor: 'nx:run-commands', cache: true,
  options: { command: 'npx biome format --check .', cwd: projectRoot } }

// biome lint
{ executor: 'nx:run-commands', cache: true,
  options: { command: 'npx biome lint .', cwd: projectRoot } }
```

## Risks

- **Target conflicts**: if both mega-preset and standalone plugins are registered, duplicate targets may appear. Mitigation: document that consumers should pick one approach (mega-preset OR standalone plugins, not both).
- **Native test runner maturity**: `node --test` is stable in Node 22+ but coverage is still experimental. Mitigation: `coverage: true` is opt-in.
- **File discovery cost**: scanning for `*.test.ts` on every graph build could be slow in large repos. Mitigation: use Nx's `configFiles` parameter (already globbed by the daemon) rather than manual `readdirSync`.

## TDD plan

1. Write failing test: project with `tsconfig.json` + `src/foo.test.ts` (no vitest config) → expect `test` target with `node --test`.
2. Write failing test: project with `vitest.config.ts` + `src/foo.test.ts` → expect vitest targets, NOT native.
3. Write failing test: project with `tsconfig.json` + `.oxlintrc.json` → expect `lint` target.
4. Write failing test: project with `tsconfig.json` + `biome.json` → expect `format`, `format-check`, `lint` targets.
5. Write failing test: project with `tsconfig.json` + `tsdown.config.ts` → expect `build` target.
6. Implement, refactor, verify.
