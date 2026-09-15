# @nx-devkit/skill

Zero-config Nx plugin that infers skill lifecycle targets from `SKILL.md` files.

## What it does

Scans the workspace for any file matching `**/SKILL.md`. For each match (outside the workspace root and `node_modules`), it injects a project with five targets — `build`, `lint`, `validate`, `os-check`, and `size-check` — into the project graph. No `project.json` required.

| Trigger file | Inferred targets | Executors |
| --- | --- | --- |
| `**/SKILL.md` | `build`, `lint`, `validate`, `os-check`, `size-check` | `@nx-devkit/skill:build`, `nx:run-commands` |

### Injective project naming

Each skill is registered under an injective project name derived from its root:

```
${projectRoot.replace(/\//g, '-')}-${sha256(projectRoot).slice(0,8)}
```

This guarantees that `skills/a-b/SKILL.md` and `skills/a/b/SKILL.md` — which would both slug to `skills-a-b` — receive distinct project names via the hash suffix.

## Install

```bash
bun add -D @nx-devkit/skill
```

## Register in nx.json

```jsonc
{
  "plugins": ["@nx-devkit/skill"]
}
```

## Options

```ts
export interface NxDevkitSkillOptions {
  /** Override the build target name. Default: "build". */
  buildTargetName?: string
  /** Override the lint target name. Default: "lint". */
  lintTargetName?: string
  /** Override the validate target name. Default: "validate". */
  validateTargetName?: string
  /** Override the os-check target name. Default: "os-check". */
  osCheckTargetName?: string
  /** Override the size-check target name. Default: "size-check". */
  sizeCheckTargetName?: string
  /** Additional input globs appended to the build target inputs. */
  skillInputs?: string[]
}
```

Pass options via the plugin registration:

```jsonc
{
  "plugins": [
    ["@nx-devkit/skill", { "buildTargetName": "compile" }]
  ]
}
```

## Targets generated

For a skill at `skills/code-review/act/` with a `SKILL.md`:

```bash
npx nx show project skills-code-review-act-<hash>
```

reports:

```jsonc
{
  "targets": {
    "build": {
      "executor": "@nx-devkit/skill:build",
      "cache": true,
      "outputs": ["{workspaceRoot}/.build/skills/<projectName>"],
      "options": {
        "target": "skills-sh",
        "outDir": ".build/skills/<projectName>",
        "path": "skills/code-review/act"
      },
      "inputs": [
        "{projectRoot}/**/*.md",
        "{projectRoot}/SKILL.md",
        "{projectRoot}/agents/**/*",
        "^production"
      ]
    },
    "lint": {
      "executor": "nx:run-commands",
      "cache": true,
      "options": {
        "command": "markdownlint-cli2 '{projectRoot}/**/*.md' --config .markdownlint.json",
        "cwd": "{workspaceRoot}"
      },
      "inputs": [
        "{projectRoot}/**/*.md",
        "{workspaceRoot}/.markdownlint.json"
      ]
    },
    "validate": {
      "executor": "nx:run-commands",
      "cache": true,
      "options": {
        "command": "npx tsx scripts/validate-skill.ts --skill {projectRoot}",
        "cwd": "{workspaceRoot}"
      },
      "inputs": [
        "{projectRoot}/SKILL.md",
        "{projectRoot}/agents/openai.yaml"
      ]
    },
    "os-check": {
      "executor": "nx:run-commands",
      "cache": true,
      "options": {
        "command": "npx tsx scripts/check-os-independence.ts --skill {projectRoot}",
        "cwd": "{workspaceRoot}"
      },
      "inputs": ["{projectRoot}/**/*"]
    },
    "size-check": {
      "executor": "nx:run-commands",
      "cache": true,
      "options": {
        "command": "npx tsx scripts/check-skill-size.ts --skill {projectRoot}",
        "cwd": "{workspaceRoot}"
      },
      "inputs": ["{projectRoot}/**/*"]
    }
  }
}
```

Run them:

```bash
npx nx build skills-code-review-act-<hash>
npx nx lint skills-code-review-act-<hash>
npx nx validate skills-code-review-act-<hash>
npx nx os-check skills-code-review-act-<hash>
npx nx size-check skills-code-review-act-<hash>
```

## Build executor

The `build` target uses the `@nx-devkit/skill:build` executor, which wraps the `skills-compiler` CLI. It invokes `npx skills-compiler` via `execFile` (no shell) to avoid shell injection.

Supported targets: `skills-sh`, `claude`, `codex`, `agents`, `obsidian`.

## Skip rules

- The workspace root (where `SKILL.md` lives at `./`) is skipped.
- Paths inside `node_modules` are skipped.
- Paths that traverse outside the workspace (`..`) are skipped.

## License

MIT
