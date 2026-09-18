# @nx-devkit/nx-cloud

Agent guide for working in `packages/nx-cloud/`. Touch ONLY this directory unless the bead body says otherwise.

## File layout

```
packages/nx-cloud/
├── package.json            # @nx-devkit/nx-cloud
├── tsdown.config.ts        # entry: index, plugin, executors/rotate/executor, generators/init/generator
├── vitest.config.ts
├── tsconfig.json
├── executors.json
├── generators.json
├── src/
│   ├── index.ts            # public surface
│   ├── plugin.ts           # createNodesV2: `nx.json` → `nx-cloud-rotate` target on the root project
│   ├── plugin.spec.ts
│   ├── executors/
│   │   └── rotate/
│   │       ├── executor.ts
│   │       ├── rotate.spec.ts
│   │       ├── schema.json
│   │       └── schema.d.ts
│   └── generators/
│       └── init/
│           ├── generator.ts
│           └── schema.json
├── README.md
└── AGENTS.md
```

## Standard options interface

```ts
export interface NxCloudRotateOptions {
  workspaceName?: string;      // default: root package.json `name`
  cloudUrl?: string;           // default: NX_CLOUD_API/NRWL_API env or https://cloud.nx.app
  installationSource?: string; // default: "nx-devkit-nx-cloud"
  dryRun?: boolean;            // default: false — call the API but do not rewrite nx.json
}
```

## What the executor does

1. Read `nx.json` and record the previous binding (`nxCloudId` or `nxCloudAccessToken`).
2. Derive `workspaceName` (option or root `package.json` name) and `nxInitDate` (first `git log` date of `nx.json`, falls back to now).
3. `POST {cloudUrl}/nx-cloud/v2/create-org-and-workspace` → `{ nxCloudId, url }`.
   On HTTP 404 falls back to v1 `/nx-cloud/create-org-and-workspace` → `{ token, url }`.
4. Write `nxCloudId` (v2) or `nxCloudAccessToken` (v1) into `nx.json`, removing the stale counterpart key. Sets `nxCloudUrl` when `NX_CLOUD_API`/`NRWL_API` is set.
5. Print the onboarding `url` and remind that deleting the old organization is manual — there is no public delete API.

## Scope rules

- Touch ONLY `packages/nx-cloud/`.
- Do NOT modify other plugin packages or the root `nx.json`.
- The executor MUST NOT delete organizations — no public API exists; it only prints the previous binding for manual cleanup.
- Use global `fetch` for HTTP (Node >= 22), no axios dependency. Mock by assigning `globalThis.fetch` in specs (the suite also runs under `bun test`, which has no `vi.stubGlobal`).
- Mock `node:child_process` `spawnSync` for the `git log` nxInitDate probe.

## TDD workflow

1. Write failing `*.spec.ts` (vitest). Mock `fetch` and `spawnSync`; use real `mkdtempSync` workspaces.
2. `bun test` → RED.
3. Implement the smallest change in `executor.ts` / `generator.ts` / `plugin.ts` that makes the test pass.
4. `bun run build` → GREEN.
5. Commit.

## Verification commands

```bash
cd packages/nx-cloud
bun test
bun run build
```
