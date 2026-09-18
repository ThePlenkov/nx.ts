# nx-cloud-rotate Specification

## Purpose
Rotates a workspace's Nx Cloud binding: creates a fresh organization + workspace via the create-org-and-workspace API and rebinds `nx.json` to it. Exposed as an inferred `nx-cloud-rotate` target on the workspace-root project.
## Requirements
### Requirement: nx.json triggers root-project inference
The plugin MUST use `createNodesV2` with trigger file `nx.json` and infer a target only for the workspace-root `nx.json` (directory `.`). Nested `nx.json` files MUST be ignored.

#### Scenario: Root nx.json discovered
- **WHEN** a workspace contains `nx.json` at the root
- **THEN** a project with root `.` is inferred carrying an `nx-cloud-rotate` target with executor `@nx-devkit/nx-cloud:rotate`

#### Scenario: Nested nx.json ignored
- **WHEN** `packages/lib/nx.json` exists
- **THEN** no project is inferred for it

### Requirement: Custom target name via options
The plugin MUST accept a `targetName` option overriding the default `nx-cloud-rotate` target name.

#### Scenario: Custom target name
- **WHEN** `targetName: "cloud:rotate"` is set
- **THEN** the inferred target is named `cloud:rotate`

### Requirement: Executor creates org + workspace via v2 endpoint
The `rotate` executor MUST `POST {cloudUrl}/nx-cloud/v2/create-org-and-workspace` with a JSON body containing `workspaceName`, `installationSource`, and `nxInitDate`, and on success write the returned `nxCloudId` into `nx.json`, removing any stale `nxCloudAccessToken`.

#### Scenario: v2 rotation
- **WHEN** the v2 endpoint responds with `{ nxCloudId: "ws_new", url: "..." }`
- **THEN** `nx.json` contains `nxCloudId: "ws_new"` and no `nxCloudAccessToken`, and the executor reports `success: true` with the onboarding `url` and the previous binding

#### Scenario: Stale access token removed
- **WHEN** `nx.json` contains `nxCloudAccessToken: "old"` before rotation
- **THEN** after a v2 rotation `nx.json` contains the new `nxCloudId` and no `nxCloudAccessToken`

### Requirement: v1 fallback on HTTP 404
When the v2 endpoint responds with HTTP 404, the executor MUST call `{cloudUrl}/nx-cloud/create-org-and-workspace` and write the returned `token` as `nxCloudAccessToken`, removing any stale `nxCloudId`. The 404 check MUST run before the message-body failure rule, so a 404 response whose body contains a `message` still triggers the fallback rather than failing.

#### Scenario: v1 fallback
- **WHEN** the v2 endpoint returns 404 and v1 returns `{ token: "abc", url: "..." }`
- **THEN** `nx.json` contains `nxCloudAccessToken: "abc"` and no `nxCloudId`

#### Scenario: 404 with message body still falls back
- **WHEN** the v2 endpoint returns 404 with body `{ message: "unknown route" }`
- **THEN** the executor calls the v1 endpoint instead of throwing

### Requirement: Error propagation
The executor MUST fail when the API returns a non-404 HTTP error or a response body containing a `message` string — except a v2 HTTP 404, which triggers the v1 fallback — and MUST NOT modify `nx.json` in that case.

#### Scenario: Server error
- **WHEN** the v2 endpoint returns HTTP 500 or a body `{ message: "boom" }`
- **THEN** the executor throws and `nx.json` is unchanged

### Requirement: dryRun leaves nx.json untouched
With `dryRun: true` the executor MUST still call the API but MUST NOT write `nx.json`.

#### Scenario: Dry run
- **WHEN** the executor runs with `dryRun: true`
- **THEN** the API is called and `nx.json` on disk is byte-identical

### Requirement: Option and env resolution
`workspaceName` defaults to the root `package.json` `name`; `cloudUrl` resolves from the option, then `NX_CLOUD_API`, then `NRWL_API`, then `https://cloud.nx.app`. When the resolved `cloudUrl` differs from the default, the executor MUST persist it as `nxCloudUrl` in `nx.json`; when it equals the default, the executor MUST remove any stale `nxCloudUrl`. This write is skipped under `dryRun`.

#### Scenario: Custom cloud URL via env
- **WHEN** `NX_CLOUD_API=https://onprem.example.com` is set
- **THEN** the request goes to `https://onprem.example.com/...` and `nx.json` gains `nxCloudUrl: "https://onprem.example.com"`

#### Scenario: Custom cloud URL via option
- **WHEN** the executor runs with `cloudUrl: "https://onprem.example.com"`
- **THEN** `nx.json` gains `nxCloudUrl: "https://onprem.example.com"`

#### Scenario: Stale nxCloudUrl removed on default URL
- **WHEN** `nx.json` contains `nxCloudUrl` and the resolved `cloudUrl` is the default
- **THEN** `nx.json` no longer contains `nxCloudUrl`

### Requirement: nxInitDate provenance
`nxInitDate` MUST be the oldest `git log --follow` author date of `nx.json`, falling back to the current time when git fails.

#### Scenario: Not a git repo
- **WHEN** `git log` exits non-zero
- **THEN** the request body still carries a valid ISO `nxInitDate`

### Requirement: No organization deletion
The plugin MUST NOT attempt to delete organizations — no public API exists. It SHOULD surface the previous binding so a human can remove the old organization manually.

#### Scenario: Previous binding reported
- **WHEN** a workspace bound to `ws_old` is rotated
- **THEN** the result includes a masked `previousBinding` (e.g. `ws_o…`) for manual cleanup — the raw binding is never returned or logged

### Requirement: init generator registers the plugin
The `init` generator MUST add `{ plugin: "@nx-devkit/nx-cloud", options: {} }` to `nx.json` plugins without duplicating an existing entry and without dropping other entries.

#### Scenario: Registration
- **WHEN** `init` runs on a workspace without the plugin
- **THEN** `nx.json` plugins contains the plugin entry alongside pre-existing entries

#### Scenario: Idempotent rerun
- **WHEN** `init` runs twice
- **THEN** the plugin entry appears exactly once

