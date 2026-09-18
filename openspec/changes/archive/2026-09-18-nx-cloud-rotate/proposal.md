# Proposal: @nx-devkit/nx-cloud — Nx Cloud organization rotation

## Why

Nx Cloud free-tier quota is scoped **per organization**. When it is exhausted the only self-service recovery is to create a fresh organization and rebind the workspace. Nx itself does this via `POST /nx-cloud/v2/create-org-and-workspace` (the same call `nx connect-to-nx-cloud` makes) and writes the returned `nxCloudId` into `nx.json`. There is no public API to *delete* an organization — the server swagger was removed from the docs ([nrwl/nx#22654](https://github.com/nrwl/nx/pull/22654)), and `nx-cloud onboard` exposes `orgs list`/`orgs create` but no delete.

Today that rotation is a manual curl + `nx.json` edit. Packaging it as a plugin makes it a one-command, CI-friendly operation.

## What Changes

### NEW package: `packages/nx-cloud/`

- **Scope**: `@nx-devkit/nx-cloud`
- **Trigger file**: `nx.json` (workspace root only)
- **API**: `createNodesV2` (Nx 22+ / 23+)
- **Inferred targets**:

| Target | Executor | Cache | Description |
|---|---|---|---|
| `nx-cloud-rotate` | `@nx-devkit/nx-cloud:rotate` | false | Create a fresh Nx Cloud org + workspace and rebind `nx.json` |

### `rotate` executor

1. Reads the previous binding (`nxCloudId` / `nxCloudAccessToken`) from `nx.json`.
2. Derives `workspaceName` (option or root `package.json` name) and `nxInitDate` (oldest `git log` date of `nx.json`, falls back to now).
3. `POST {cloudUrl}/nx-cloud/v2/create-org-and-workspace` → `{ nxCloudId, url }`. On HTTP 404 falls back to v1 `/nx-cloud/create-org-and-workspace` → `{ token, url }`.
4. Writes `nxCloudId` (v2) or `nxCloudAccessToken` (v1) into `nx.json`, deleting the stale counterpart key. Sets `nxCloudUrl` when `NX_CLOUD_API`/`NRWL_API` is set.
5. Prints the onboarding `url` and a reminder that deleting the old organization is manual — no public API exists.

### `init` generator

Registers `@nx-devkit/nx-cloud` (or a custom `pluginPath` for in-repo development) in `nx.json` plugins. The `nx-cloud-rotate` target is then inferred on the root project — no `project.json` needed.

### Plugin options

```ts
export interface NxCloudPluginOptions {
  /** Target name inferred on the root project. Default: "nx-cloud-rotate" */
  targetName?: string;
}
```

### Executor options

```ts
export interface NxCloudRotateOptions {
  workspaceName?: string;      // default: root package.json `name`
  cloudUrl?: string;           // default: NX_CLOUD_API/NRWL_API env or https://cloud.nx.app
  installationSource?: string; // default: "nx-devkit-nx-cloud"
  dryRun?: boolean;            // default: false — call the API but do not rewrite nx.json
}
```

## Capabilities

### New Capabilities

- `nx-cloud-rotate`: Nx plugin that infers an `nx-cloud-rotate` target on the workspace root project and an executor that creates a fresh Nx Cloud organization + workspace and rebinds `nx.json` to it.

## Non-goals

- Does NOT delete organizations — no public API or CLI command exists; the executor prints the previous binding for manual cleanup.
- Does NOT manage GitHub/VCS integration — a GitHub-connected org cannot be recreated self-service; the replacement is a standard org.
- Does NOT commit or push the updated `nx.json` — that stays a human/CI decision.

## Impact

- **New package**: `packages/nx-cloud/` with `src/plugin.ts`, `src/executors/rotate/`, `src/generators/init/`, `executors.json`, `generators.json`, `package.json`, `tsdown.config.ts`, `vitest.config.ts`, `tsconfig.json`, `README.md`, `AGENTS.md`.
- **Root `nx.json`**: registers `./packages/nx-cloud/src/plugin.ts` and adds `packages/nx-cloud` to `release.projects`.
- **npm publish**: `@nx-devkit/nx-cloud` published via the existing `prepare-for-release` + OIDC pipeline.
