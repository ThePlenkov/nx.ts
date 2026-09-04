# Proposal: @nx-devkit/skill — Nx plugin for agent skill discovery

## Why

Agent skills (`SKILL.md` directories) need Nx targets for build, lint, validate, os-check, and size-check. Today this logic lives inside `theplenkov-ai/skills` as a `file:` dependency (`@theplenkov/nx-skill`) and is not published to npm. Both the private source repo and the public distribution repo (`ThePlenkov/skills`) need `nx affected -t build` / `nx affected -t lint` to work — but neither can install the plugin from npm.

Publishing as `@nx-devkit/skill` makes it available to any repo that contains `SKILL.md` directories, including both `theplenkov-ai/skills` and `ThePlenkov/skills`.

## What Changes

### NEW package: `packages/skill/`

- **Scope**: `@nx-devkit/skill`
- **Trigger file**: `**/SKILL.md`
- **API**: `createNodesV2` (Nx 22+ / 23+)
- **Inferred targets**:

| Target | Executor | Cache | Description |
|---|---|---|---|
| `build` | `@nx-devkit/skill:build` (custom executor) | true | Compile skill to skills-sh/claude/codex/agents/obsidian target |
| `lint` | `nx:run-commands` (`npx markdownlint-cli2`) | true | Markdown linting |
| `validate` | `nx:run-commands` | true | Validate SKILL.md frontmatter + schema |
| `os-check` | `nx:run-commands` | true | Check OS-independence (no hardcoded paths) |
| `size-check` | `nx:run-commands` | true | Check skill size budget |

### Custom executor: `build`

The `build` executor wraps the skills compiler (from `theplenkov-ai/skills` `tools/compiler`). It takes `target` (skills-sh, claude, codex, agents, obsidian) and `outDir` options. The executor source moves from `theplenkov-ai/skills/tools/nx-skill/src/executors/build/executor.ts` into `packages/skill/src/executors/build/executor.ts`.

### Plugin options

```ts
export interface NxDevkitSkillOptions {
  /** Marker filename that identifies a skill directory. Default: "SKILL.md" */
  skillMarker?: string;
  /** Target name for build. Default: "build" */
  buildTargetName?: string;
  /** Target name for lint. Default: "lint" */
  lintTargetName?: string;
  /** Target name for validate. Default: "validate" */
  validateTargetName?: string;
  /** Target name for os-check. Default: "os-check" */
  osCheckTargetName?: string;
  /** Target name for size-check. Default: "size-check" */
  sizeCheckTargetName?: string;
  /** Additional named inputs for skill content. */
  skillInputs?: string[];
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

- `theplenkov-ai/skills` replaces `"@theplenkov/nx-skill": "file:./tools/nx-skill"` with `"@nx-devkit/skill": "^x.y.z"`.
- `theplenkov-ai/skills/tools/nx-skill/` is removed (source moves to nx.ts monorepo).
- `ThePlenkov/skills` adds `"@nx-devkit/skill"` as devDependency.
- Both repos update `nx.json`:
  ```json
  { "plugins": [{ "plugin": "@nx-devkit/skill" }] }
  ```

## Capabilities

### New Capabilities

- `skill-discovery`: Nx plugin that discovers `SKILL.md` directories and infers build/lint/validate/os-check/size-check targets.
- `skill-build-executor`: Custom Nx executor that compiles agent skills to distribution targets.

## Non-goals

- Does NOT include SkillSpector scanning (that's `@nx-devkit/skillspector`).
- Does NOT include TypeScript tooling (that's `@nx-devkit/typescript`).
- Does NOT depend on `@nx-devkit/typescript` or any other nx-devkit plugin.

## Impact

- **New package**: `packages/skill/` with `src/plugin.ts`, `src/executors/build/`, `executors.json`, `package.json`, `tsdown.config.ts`, `vitest.config.ts`, `README.md`, `AGENTS.md`.
- **Source migration**: build executor source moves from `theplenkov-ai/skills/tools/nx-skill/` to `packages/skill/src/executors/build/`.
- **npm publish**: `@nx-devkit/skill` published via the existing `prepare-for-release` + OIDC pipeline.
- **Consumer migration**: `theplenkov-ai/skills` and `ThePlenkov/skills` switch from `file:` dep to npm.
