# @nx-devkit/skill

Nx plugin for [agent skills](https://agentskills.io/specification): any directory containing `SKILL.md` becomes a project with a full skill lifecycle — `build`, `lint`, `validate`, `os-check`, `size-check`. No `project.json` needed.

Part of [nx-devkit](https://github.com/nx-devkit/nx.ts).

## Install

```bash
bun add -D @nx-devkit/skill
```

Requires `@nx/devkit` `^22 || ^23` (peer). The inferred commands also need their tools on the workspace: `lint` runs `markdownlint-cli2`, and `validate`/`os-check`/`size-check` run `tsx` — add whichever you use:

```bash
bun add -D markdownlint-cli2 tsx
```

## Register

```jsonc
// nx.json
{ "plugins": ["@nx-devkit/skill"] }
```

## What it infers

<!-- target table consistent with src/plugin.ts infer* functions and executors.json -->

| Target | Runs | Purpose |
|---|---|---|
| `build` | `@nx-devkit/skill:build` executor — skills-compiler via `execFile`, no shell | Compiles the skill to a distribution target. |
| `lint` | `markdownlint-cli2 '{projectRoot}/**/*.md' --config .markdownlint.json` | Lints all skill Markdown. |
| `validate` | `tsx scripts/validate-skill.ts --skill '{projectRoot}'` | Validates `SKILL.md` frontmatter and structure. |
| `os-check` | `tsx scripts/check-os-independence.ts --skill '{projectRoot}'` | Flags OS-specific commands/paths that break cross-platform portability. |
| `size-check` | `tsx scripts/check-skill-size.ts --skill '{projectRoot}'` | Enforces size budgets on the skill directory. |

The `build` target's `inputs` are an explicit list — `SKILL.md`, `**/*.md`, `scripts/`, `references/`, `assets/`, `agents/` under the project root, plus `^production` — extended by any `skillInputs` you add. The four `nx:run-commands` targets run with `cwd` = workspace root (the tools expect workspace-relative paths); `{projectRoot}` in commands is the Nx macro, expanded safely — never interpolated into a shell string.

## Inspect

```bash
npx nx show projects
npx nx show project <name>
npx nx run <name>:build
```

## Project naming

Project names are derived from the skill directory slug plus a 12-hex-char SHA-256 suffix of the project root — collision-resistant in practice (birthday bound applies, it's not a guarantee), so two `SKILL.md` files whose directory names collapse to the same slug still get distinct project names.

## Options

<!-- option reference consistent with src/plugin.ts NxDevkitSkillOptions -->

```jsonc
{
  "plugins": [
    ["@nx-devkit/skill", {
      "buildTargetName": "build",
      "lintTargetName": "lint",
      "validateTargetName": "validate",
      "osCheckTargetName": "os-check",
      "sizeCheckTargetName": "size-check",
      "skillInputs": []
    }]
  ]
}
```

| Option | Default | Effect |
|---|---|---|
| `buildTargetName` | `build` | Name of the build target. |
| `lintTargetName` | `lint` | Name of the lint target. |
| `validateTargetName` | `validate` | Name of the validate target. |
| `osCheckTargetName` | `os-check` | Name of the OS-independence check target. |
| `sizeCheckTargetName` | `size-check` | Name of the size-check target. |
| `skillInputs` | `[]` | Extra input globs merged into the `build` target's inputs. |

All five target names must be non-empty and unique — on an empty or duplicate name the plugin logs a warning and skips that skill's project (other skills are unaffected).

## Skip rules

- `SKILL.md` inside `node_modules` is skipped.
- `SKILL.md` at the workspace root is skipped — skills live in nested directories.
- `SKILL.md` escaping the workspace root is skipped.

## Pairing with skillspector

For security scanning of skills, add [`@nx-devkit/skillspector`](../skillspector/README.md) alongside — it infers a `scan` target from the same `SKILL.md` trigger.

## License

MIT
