---
name: nx-skill
description: Manage SKILL.md lifecycle through Nx — build, lint, validate, os-check, size-check, and security scan targets inferred from SKILL.md files. Covers @nx-devkit/skill and @nx-devkit/skillspector.
---

# nx-skill

Two Nx plugins that turn `SKILL.md` files into first-class Nx projects with build, lint, validate, and security scan targets — no `project.json` required.

## @nx-devkit/skill — lifecycle targets

Scans for `**/SKILL.md` and infers 5 targets per skill:

| Target | What it does | Executor |
|---|---|---|
| `build` | Compiles SKILL.md → skills-sh / claude / codex / agents / obsidian formats | `@nx-devkit/skill:build` (wraps `npx skills-compiler`, `shell: false`) |
| `lint` | Runs `markdownlint-cli2` on all markdown in the skill dir | `nx:run-commands` |
| `validate` | Validates SKILL.md frontmatter and structure | `nx:run-commands` |
| `os-check` | Checks OS-independence (no hardcoded paths, no platform-specific commands) | `nx:run-commands` |
| `size-check` | Checks skill size is within limits | `nx:run-commands` |

### Injective project naming

Each skill gets a unique project name: `${slug}-${sha256(projectRoot).slice(0,12)}` where slug is the path with `/` → `-`. This guarantees `skills/a-b` and `skills/a/b` get distinct names.

### Install

```bash
bun add -D @nx-devkit/skill
```

```jsonc
{ "plugins": ["@nx-devkit/skill"] }
```

### Options

```ts
export interface NxDevkitSkillOptions {
  buildTargetName?: string    // default "build"
  lintTargetName?: string     // default "lint"
  validateTargetName?: string // default "validate"
  osCheckTargetName?: string  // default "os-check"
  sizeCheckTargetName?: string// default "size-check"
  skillInputs?: string[]      // additional input globs for build
}
```

### Usage

```sh
npx nx run skills-my-skill-a1b2c3d4e5f6:build
npx nx run-many -t lint --projects="skills-*"
npx nx run-many -t validate
```

## @nx-devkit/skillspector — security scanning

Scans for `**/SKILL.md` and infers a `scan` target per skill:

| Target | What it does | Executor |
|---|---|---|
| `scan` | Runs `skillspector scan` with JSON output, writes SARIF, emits GitHub annotations | `@nx-devkit/skillspector:scan` (`shell: false`) |

Fails on HIGH/CRITICAL findings. Annotation escaping is security-critical (`%` → `%25`, newlines encoded, `::` removed).

### Install

```bash
bun add -D @nx-devkit/skillspector
```

```jsonc
{ "plugins": ["@nx-devkit/skillspector"] }
```

### Options

```ts
export interface NxDevkitSkillspectorOptions {
  scanTargetName?: string     // default "scan"
  noLlm?: boolean             // default true
  annotations?: boolean       // default true (disables caching when on)
  failOnError?: boolean       // default true
  skillspectorBin?: string    // default "skillspector"
  sarif?: string              // SARIF output path prefix
  baseline?: string           // baseline file path
}
```

## Using both together

Register both plugins to get lifecycle + security targets on every skill:

```jsonc
{
  "plugins": ["@nx-devkit/skill", "@nx-devkit/skillspector"]
}
```

Each skill gets 6 targets: `build`, `lint`, `validate`, `os-check`, `size-check`, `scan`.

## Source references

- `@nx-devkit/skill`: [`packages/skill/src/plugin.ts`](../../packages/skill/src/plugin.ts)
- `@nx-devkit/skillspector`: [`packages/skillspector/src/plugin.ts`](../../packages/skillspector/src/plugin.ts)
