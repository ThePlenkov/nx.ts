# @nx-devkit/release

Agent guide for working in `packages/release/`. Touch ONLY this directory unless the bead body says otherwise.

## File layout

```
packages/release/
├── package.json
├── tsdown.config.ts
├── vitest.config.ts
├── executors.json
├── generators.json
├── src/
│   ├── index.ts            # public surface
│   ├── plugin.ts           # createNodesV2: detects project.json referencing our executor
│   ├── plugin.spec.ts
│   ├── executors/
│   │   └── publish/
│   │       ├── executor.ts
│   │       ├── executor.spec.ts
│   │       ├── schema.json
│   │       └── schema.d.ts
│   └── generators/
│       └── init/
│           ├── generator.ts
│           ├── generator.spec.ts
│           └── schema.json
├── README.md
└── AGENTS.md
```

## Standard options interface

```ts
export interface NxReleasePublishOptions {
  packageName?: string       // default: derived from package.json name
  packagePath?: string       // default: project root
  version?: string           // default: "patch" (or x.y.z, minor, major)
  dryRun?: boolean           // default: false
  registry?: string          // default: https://registry.npmjs.org/
  branch?: string            // default: "main"
  generateNotes?: boolean    // default: true
  provenance?: boolean       // default: true
}
```

## What the executor does

1. Compute next version from npm latest (patch/minor/major) or use explicit x.y.z
2. Check if already published + tagged + released → skip if complete
3. Stamp package.json version (`npm version --no-git-tag-version`)
4. Publish to npm via OIDC (`npm publish --provenance --access public`)
5. Commit bump + tag (`git add`, `git commit`, `git tag`)
6. Rebase on origin/main + push (`git fetch`, `git rebase`, `git push`)
7. Create GitHub Release with auto-generated changelog (`gh release create --generate-notes`)

All steps are idempotent. Reruns skip whatever already exists. Release repair
mode: if npm + tag exist but GitHub Release is missing, only the release is created.

## Scope rules

- Touch ONLY `packages/release/`.
- Do NOT modify other plugin packages or the root `nx.json`.
- The plugin MUST never mutate the consuming package's `package.json` on disk
  outside of `npm version --no-git-tag-version` (which is the standard stamp).

## TDD workflow

1. Write failing `*.spec.ts` (vitest). Mock `node:child_process` for `spawnSync`.
   Use real `mkdtempSync` for the temp dir in executor tests. Use `memfs` for
   generator tests.
2. `bun test` → RED.
3. Implement the smallest change that makes the test pass.
4. `bun run build` → GREEN.
5. Commit.

## Verification commands

```bash
cd packages/release
bun test
bun run build
```
