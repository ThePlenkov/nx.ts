# @nx-devkit/nx-cloud

Zero-config Nx plugin that puts an `nx-cloud-rotate` target on the workspace **root project**. The target creates a fresh Nx Cloud organization + workspace (same name, new binding — `nxCloudId`, or `nxCloudAccessToken` on the v1 fallback) and rebinds `nx.json` — the escape hatch for when your Nx Cloud quota is exhausted and you want to roll over to a new org.

## Install

```bash
bun add -D @nx-devkit/nx-cloud
bunx nx g @nx-devkit/nx-cloud:init   # registers the plugin in nx.json
```

or register manually:

```jsonc
// nx.json
{ "plugins": ["@nx-devkit/nx-cloud"] }
```

## Usage

```bash
bunx nx run <root-project>:nx-cloud-rotate
# or with options
bunx nx run <root-project>:nx-cloud-rotate --workspaceName=my-workspace --dryRun
```

What it does:

1. Reads the current binding (`nxCloudId` / `nxCloudAccessToken`) from `nx.json`.
2. `POST {cloudUrl}/nx-cloud/v2/create-org-and-workspace` — the same endpoint `nx connect-to-nx-cloud` calls (`{cloudUrl}` defaults to `https://cloud.nx.app`, override via option or env). Falls back to `{cloudUrl}/nx-cloud/create-org-and-workspace` (v1) on HTTP 404.
3. Writes the returned `nxCloudId` (or `nxCloudAccessToken` on v1) into `nx.json`, removing the stale counterpart key.
4. Prints the onboarding URL so you can claim the org in the Nx Cloud dashboard.

## Deleting the old organization

There is **no public API or CLI command** to delete an Nx Cloud organization — the server swagger was removed from the docs explicitly. Delete it manually at https://cloud.nx.app (organization settings → danger zone), or leave it: an exhausted free org costs nothing. The previous binding is printed once, masked, at rotation time and is not persisted anywhere — copy it before closing the terminal if you need it to identify the old org.

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `workspaceName` | string | root `package.json` `name` | Name sent to create-org-and-workspace |
| `cloudUrl` | string | `NX_CLOUD_API`/`NRWL_API` env or `https://cloud.nx.app` | Nx Cloud instance URL |
| `installationSource` | string | `nx-devkit-nx-cloud` | Telemetry tag sent with the request |
| `dryRun` | boolean | `false` | Call the API but do not rewrite `nx.json` |

## Notes

- Works unauthenticated — same trust level as `nx connect-to-nx-cloud`. The created org is *unclaimed* until you open the onboarding URL.
- If your old org was GitHub-connected, the replacement is a standard org; VCS integration must be re-linked in the dashboard.
- Committing `nx.json` after rotation points CI at the new org immediately. **Warning:** the default `nxCloudId` grants `read-write` remote-cache access to anyone holding it — on public repos the committed ID is world-visible, so anyone can read and write your Nx Cloud cache. If that matters, rotate the org's access-level in the Nx Cloud dashboard or keep the repo private.
