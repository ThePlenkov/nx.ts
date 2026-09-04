# Proposal: @nx-devkit/skillspector — Nx executor for SkillSpector security scanning

## Why

Agent skills need security scanning with NVIDIA SkillSpector. Today the Nx executor for this lives inside `theplenkov-ai/skills/actions/skillspector/nx-skillspector/` as a `file:` dependency (`@theplenkov/nx-skillspector`) and is not published to npm. Both the private source repo and the public distribution repo (`ThePlenkov/skills`) need `nx affected -t scan` to work — but neither can install the executor from npm.

Publishing as `@nx-devkit/skillspector` makes it available to any repo that contains `SKILL.md` directories and wants SkillSpector scanning via Nx.

This is a **separate package** from `@nx-devkit/skill` (the discovery plugin). The skill plugin owns project inference and build/lint/validate targets. This package owns only the `scan` executor and its `createNodesV2` registration.

## What Changes

### NEW package: `packages/skillspector/`

- **Scope**: `@nx-devkit/skillspector`
- **Trigger file**: `**/SKILL.md` (same marker as `@nx-devkit/skill`)
- **API**: `createNodesV2` (infers `scan` target) + custom `scan` executor
- **Inferred target**:

| Target | Executor | Cache | Description |
|---|---|---|---|
| `scan` | `@nx-devkit/skillspector:scan` (custom executor) | true | Run SkillSpector on skill directory, emit SARIF + annotations |

### Custom executor: `scan`

The `scan` executor:
1. Runs `skillspector scan <skill-dir> --no-llm --format json` (configurable)
2. Maps JSON findings to GitHub Actions annotations (`::error file=...`)
3. Builds SARIF 2.1.0 report preserving per-issue metadata
4. Writes per-skill findings to shared files for step summary aggregation
5. Optionally writes SARIF to a path for code-scanning upload

Executor source moves from `theplenkov-ai/skills/actions/skillspector/nx-skillspector/src/` into `packages/skillspector/src/`.

### Plugin options

```ts
export interface NxDevkitSkillspectorOptions {
  /** Marker filename. Default: "SKILL.md" */
  skillMarker?: string;
  /** Target name for scan. Default: "scan" */
  scanTargetName?: string;
  /** Pass --no-llm to skillspector. Default: true */
  noLlm?: boolean;
  /** Baseline file for suppression. Default: "" (none) */
  baseline?: string;
  /** SARIF output path. Default: "" (no SARIF) */
  sarif?: string;
  /** Emit GitHub Actions annotations. Default: true */
  annotations?: boolean;
  /** Fail on high/critical findings. Default: true */
  failOnError?: boolean;
  /** SkillSpector CLI binary. Default: "skillspector" */
  skillspectorBin?: string;
}
```

### Named inputs

```json
{
  "namedInputs": {
    "skill": [
      "{projectRoot}/SKILL.md",
      "{projectRoot}/scripts/**/*",
      "{projectRoot}/references/**/*",
      "{projectRoot}/assets/**/*"
    ]
  }
}
```

### Migration from `theplenkov-ai/skills`

- `theplenkov-ai/skills` replaces `"@theplenkov/nx-skillspector": "file:./actions/skillspector/nx-skillspector"` with `"@nx-devkit/skillspector": "^x.y.z"`.
- `theplenkov-ai/skills/actions/skillspector/nx-skillspector/` is removed (source moves to nx.ts monorepo).
- `ThePlenkov/skills` adds `"@nx-devkit/skillspector"` as devDependency.
- Both repos update `nx.json`:
  ```json
  {
    "plugins": [
      { "plugin": "@nx-devkit/skill" },
      { "plugin": "@nx-devkit/skillspector", "options": { "scanTargetName": "scan" } }
    ]
  }
  ```

### Coexistence with `@nx-devkit/skill`

Both plugins use `**/SKILL.md` as trigger. Nx's `createNodesV2` merges targets from multiple plugins for the same project. `@nx-devkit/skill` adds `build`/`lint`/`validate`/`os-check`/`size-check`; `@nx-devkit/skillspector` adds `scan`. No conflict.

## Capabilities

### New Capabilities

- `skillspector-executor`: Custom Nx executor that runs SkillSpector on a skill and emits SARIF + GitHub annotations.
- `skillspector-plugin`: Nx plugin that infers `scan` target for every `SKILL.md` directory.

## Non-goals

- Does NOT include skill discovery for build/lint/validate (that's `@nx-devkit/skill`).
- Does NOT include TypeScript tooling (that's `@nx-devkit/typescript`).
- Does NOT install SkillSpector itself — the consumer or CI workflow must install it (`pip install git+https://github.com/NVIDIA/SkillSpector`).
- Does NOT include the composite GitHub Action — that lives in the consumer repo.

## Impact

- **New package**: `packages/skillspector/` with `src/plugin.ts`, `src/executors/scan/`, `src/lib/`, `executors.json`, `package.json`, `tsdown.config.ts`, `vitest.config.ts`, `README.md`, `AGENTS.md`.
- **Source migration**: executor + lib source moves from `theplenkov-ai/skills/actions/skillspector/nx-skillspector/src/` to `packages/skillspector/src/`.
- **npm publish**: `@nx-devkit/skillspector` published via the existing `prepare-for-release` + OIDC pipeline.
- **Consumer migration**: both `theplenkov-ai/skills` and `ThePlenkov/skills` switch from `file:` dep to npm.
