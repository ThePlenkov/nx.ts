# @nx-devkit/prepare-for-release

Bootstraps a workspace of packages onto the npm registry by publishing minimal `0.0.0` placeholders. Built so any Nx monorepo can use it.

## What it does

| Surface | Kind | Purpose |
|---|---|---|
| `@nx-devkit/prepare-for-release:publish-placeholder` | Executor | Scans `packages/*`, publishes a `0.0.0` placeholder for any package not yet on the registry. |
| `@nx-devkit/prepare-for-release:init` | Generator | Adds the plugin to `nx.json`, creates a `tools` project with a `prepare-for-release` target, prints the post-setup checklist. |
| `@nx-devkit/prepare-for-release` (createNodesV2) | Plugin | Detects a `tools/project.json` referencing the executor and re-affirms the `prepare-for-release` target. |

The executor is idempotent — already-published packages are skipped — and never modifies the source `package.json` (the placeholder tarball is built in a temp directory). Use `dryRun: true` to preview.

## Install

```bash
bun add -D @nx-devkit/prepare-for-release
```

## Register in nx.json

```jsonc
{
  "plugins": ["@nx-devkit/prepare-for-release"]
}
```

Or run the generator:

```bash
bunx nx g @nx-devkit/prepare-for-release:init
```

## Run

```bash
bunx nx run tools:prepare-for-release
# or with options
bunx nx run tools:prepare-for-release --placeholderTag=alpha --placeholderVersion=0.0.1 --dryRun
```

## Options

```ts
export interface NxPrepareForReleaseOptions {
  scope?: string[];             // default: derived from packages/* names
  placeholderTag?: string;      // default: "placeholder"
  placeholderVersion?: string;  // default: "0.0.0"
  registry?: string;            // default: "https://registry.npmjs.org/"
  dryRun?: boolean;             // default: false
  trustRepo?: string;           // default: "ThePlenkov/nx.ts" (override with NPM_TRUST_REPO env var)
}
```

## Example output

```text
> nx run tools:prepare-for-release

[@nx-devkit/prepare-for-release] Checking 4 packages
[@nx-devkit/prepare-for-release] @nx-devkit/tsdown: 404 → publishing 0.0.0 placeholder
[@nx-devkit/prepare-for-release] @nx-devkit/oxlint: 404 → publishing 0.0.0 placeholder
[@nx-devkit/prepare-for-release] @nx-devkit/biome: 0.5.0 already on registry, skipping
[@nx-devkit/prepare-for-release] @nx-devkit/typescript: 404 → publishing 0.0.0 placeholder

Published: @nx-devkit/tsdown, @nx-devkit/oxlint, @nx-devkit/typescript
Skipped:   @nx-devkit/biome

Run these locally (requires MFA) to enable GitHub OIDC trusted publishing:

  npm trust github @nx-devkit/tsdown --file release.yml --repo your-org/your-repo --allow-publish
  npm trust github @nx-devkit/oxlint --file release.yml --repo your-org/your-repo --allow-publish
  npm trust github @nx-devkit/typescript --file release.yml --repo your-org/your-repo --allow-publish
```

## When to use

- Adding a brand new Nx plugin package to a workspace that hasn't shipped to npm yet.
- Bootstrapping a multi-package monorepo so that downstream `nx release` + OIDC trusted publishing can take over from there.
- You want the placeholder publish to be idempotent and offline-friendly (it just shells out to `npm view` and `npm publish`).

## Why not `bun publish`?

`bun publish` does not yet support npm OIDC trusted publishing. The CI release workflow uses `npx nx release publish` (which uses the npm CLI). The executor also calls the npm CLI directly to keep the bootstrap flow consistent.

## License

MIT