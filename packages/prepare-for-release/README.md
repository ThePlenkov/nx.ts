# @nx-devkit/prepare-for-release

Nx plugin + executor for bootstrapping npm packages: publishes a `0.0.0` placeholder tarball for every workspace package that doesn't exist on the registry yet, so the package name is claimed before you wire up [OIDC trusted publishing](https://docs.npmjs.com/trusted-publishers). Idempotent — already-published packages are skipped.

Part of [nx-devkit](https://github.com/nx-devkit/nx.ts).

## Install

```bash
bun add -D @nx-devkit/prepare-for-release
```

Requires `@nx/devkit` `^22 || ^23` (peer).

## Bootstrap

Run the `init` generator — it registers the plugin in `nx.json` and creates a `tools` project with the `prepare-for-release` target:

```bash
npx nx g @nx-devkit/prepare-for-release:init
```

<!-- sym:generators.json → generators.init.factory,schema -->

Or do it manually:

1. Register the plugin in `nx.json` so `createNodesV2` can detect release-bootstrap projects:

```jsonc
{ "plugins": ["@nx-devkit/prepare-for-release"] }
```

2. Create `tools/project.json` wired to the executor:

```jsonc
{
  "name": "tools",
  "targets": {
    "prepare-for-release": {
      "executor": "@nx-devkit/prepare-for-release:publish-placeholder"
    }
  }
}
```

The plugin's `createNodesV2` scans `**/project.json` for projects whose targets reference its executor and surfaces them on the graph.

Then run:

```bash
npx nx run tools:prepare-for-release
```

## What the executor does

For each package under `packages/*` (or your `scope` filter):

1. Checks the registry for an existing version of the package.
2. If the name is unclaimed, builds a minimal placeholder tarball **in a temp dir** — your source `package.json` is never mutated.
3. Publishes it with `npm publish --tag placeholder`.
4. Optionally runs `npm trust github` to bind OIDC trusted publishing to your repo.

Already-published packages are skipped on every run.

## Options

<!-- option reference consistent with src/executors/publish-placeholder/schema.json -->

```jsonc
// tools/project.json → targets.prepare-for-release.options
{
  "scope": ["@nx-devkit"],
  "placeholderTag": "placeholder",
  "placeholderVersion": "0.0.0",
  "registry": "https://registry.npmjs.org/",
  "dryRun": false,
  "trust": false,
  "trustRepo": "owner/repo"
}
```

| Option | Default | Effect |
|---|---|---|
| `scope` | every package in `packages/*` | Package scope prefixes to check. |
| `placeholderTag` | `placeholder` | npm dist-tag applied to the placeholder publish. |
| `placeholderVersion` | `0.0.0` | Version written into the temporary placeholder manifest. |
| `registry` | `https://registry.npmjs.org/` | npm registry URL. |
| `dryRun` | `false` | Report what would happen — no `npm pack`, no publish. |
| `trust` | `false` | Run `npm trust github` for every checked package — including already-published (skipped) ones — not just newly published (requires MFA). With `dryRun: true` the trust commands are printed, not run. |
| `trustRepo` | `NPM_TRUST_REPO` or `GITHUB_REPOSITORY` env, else `nx-devkit/nx.ts` | `owner/repo` slug for the `npm trust github` command. |

## Why placeholders

npm OIDC trusted publishing requires the package to already exist before you can configure a trust relationship — but publishing the real package first defeats the point. Placeholders claim the name with throwaway `0.0.0` content under a `placeholder` tag (not `latest`), so users never install a stub by accident. The first real release lands under your normal version.

## Security notes

- The executor invokes `npm` via `spawnSync` with an argv array — no shell interpolation of package names, paths, or registry URLs.
- `npm trust github` runs only when `trust: true` and may prompt for MFA — it's a real-world side effect, not idempotent in the same sense.

## License

MIT
