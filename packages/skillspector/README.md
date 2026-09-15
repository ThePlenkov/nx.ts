# @nx-devkit/skillspector

Nx plugin for [SkillSpector](https://github.com/skilllens/skillspector) security scanning: any directory containing `SKILL.md` becomes a project with a `scan` target that analyzes skill code for vulnerabilities, secrets, and risky patterns. No `project.json` needed.

Part of [nx-devkit](https://github.com/nx-devkit/nx.ts).

## Install

```bash
bun add -D @nx-devkit/skillspector
```

Requires `@nx/devkit` `^22 || ^23` (peer) and a `skillspector` binary reachable on `PATH` — or point the `skillspectorBin` option at any install.

## Register

```jsonc
// nx.json
{ "plugins": ["@nx-devkit/skillspector"] }
```

## What it infers

<!-- target table consistent with src/plugin.ts createNodesV2 and executors.json -->

| Trigger | Target | Executor |
|---|---|---|
| `SKILL.md` | `scan` | `@nx-devkit/skillspector:scan` — spawns the `skillspector` binary via `execFile`, no shell |

## Inspect

```bash
npx nx show projects
npx nx show project <name>
npx nx run <name>:scan
```

## Options

<!-- option reference consistent with src/plugin.ts NxDevkitSkillspectorOptions and executors/scan/schema.json -->

```jsonc
{
  "plugins": [
    ["@nx-devkit/skillspector", {
      "scanTargetName": "scan",
      "noLlm": true,
      "annotations": true,
      "failOnError": true,
      "skillspectorBin": "skillspector",
      "sarif": "reports/skillspector.sarif",
      "baseline": ".skillspector-baseline.json"
    }]
  ]
}
```

| Option | Default | Effect |
|---|---|---|
| `scanTargetName` | `scan` | Name of the inferred scan target. |
| `noLlm` | `true` | Disable LLM-based analysis (static checks only). |
| `annotations` | `true` | Emit GitHub Actions `::error`/`::warning` workflow annotations for findings. |
| `failOnError` | `true` | Fail the target when HIGH or CRITICAL findings are present. |
| `skillspectorBin` | `skillspector` | Binary to invoke — override for local dev or vendored installs. |
| `sarif` | — | Write a SARIF 2.1.0 report to this path (feed the Security tab or convert to annotations). |
| `baseline` | — | Path to a baseline file suppressing known findings. |

## CI integration

- **Annotations** — with `annotations: true` (default), findings appear inline on pull requests as GitHub workflow annotations.
- **SARIF** — set `sarif` to a path and upload it with `github/codeql-action/upload-sarif`, or convert to annotations with a SARIF-to-annotations step.
- **Gating** — `failOnError` fails CI on HIGH/CRITICAL; use `baseline` to ratchet down existing debt.

## Skip rules

- `SKILL.md` inside `node_modules` is skipped.
- `SKILL.md` at the workspace root is skipped.
- `SKILL.md` escaping the workspace root is skipped.

## Project naming

Like [`@nx-devkit/skill`](../skill/README.md), project names are slug + SHA-256 hash of the project root — collision-free across identically named directories.

## License

MIT
