# Design: @nx-devkit/skillspector

## Architecture

```
packages/skillspector/
├── package.json              # @nx-devkit/skillspector
├── tsdown.config.ts          # entry: src/index.ts
├── vitest.config.ts
├── executors.json
├── src/
│   ├── index.ts              # re-exports createNodesV2 + executor
│   ├── plugin.ts             # createNodesV2 — SKILL.md → scan target
│   ├── executors/
│   │   └── scan/
│   │       ├── executor.ts   # run SkillSpector, emit annotations + SARIF
│   │       └── schema.json   # executor options schema
│   └── lib/
│       ├── skillspector.ts   # CLI wrapper (spawn skillspector scan)
│       ├── mapping.ts        # JSON findings → SARIF 2.1.0
│       ├── annotations.ts    # JSON findings → GitHub ::error/::warning
│       └── sarif.ts          # SARIF 2.1.0 types
├── test/
│   ├── plugin.spec.ts
│   └── executor.spec.ts
├── README.md
└── AGENTS.md
```

## Plugin: createNodesV2

```ts
export const createNodesV2: CreateNodesV2<NxDevkitSkillspectorOptions> = [
  '**/SKILL.md',
  (configFiles, options = {}, context) => {
    const opts = { ...defaultOptions, ...options };
    return configFiles
      .map((skillFile) => {
        const skillDir = dirname(skillFile);
        const projectName = basename(skillDir);
        const projectRoot = relative(context.workspaceRoot, resolve(context.workspaceRoot, skillDir))
          .replace(/\\/g, '/');

        if (shouldSkipPath(projectRoot, context.workspaceRoot)) return null;

        const targets: Record<string, TargetConfiguration> = {
          [opts.scanTargetName]: {
            executor: '@nx-devkit/skillspector:scan',
            cache: true,
            inputs: ['skill', '^production'],
            options: {
              path: projectRoot,
              ...(opts.sarif ? { sarif: opts.sarif } : {}),
              ...(opts.baseline ? { baseline: opts.baseline } : {}),
            },
          },
        };

        return [skillFile, { projects: { [projectRoot]: { name: projectName, root: projectRoot, targets } } }];
      })
      .filter((r): r is [string, CreateNodesResult] => r !== null);
  },
];
```

## Scan executor

The executor runs SkillSpector on a single skill directory:

1. **Spawn** `skillspector scan <path> --no-llm --format json` (configurable via options)
2. **Parse** JSON output → `SkillspectorDoc` (issues array)
3. **Rewrite** issue.location.file to workspace-relative paths
4. **Filter** issues into code findings (`.ts/.js/.py/.sh/.yml/.json`) and doc findings (`.md`)
5. **Emit** GitHub Actions annotations for code findings (via shared file to avoid Nx stdout prefixing)
6. **Build** SARIF 2.1.0 report preserving category, confidence, remediation, code_snippet
7. **Write** per-skill findings JSON for step summary aggregation
8. **Return** `{ success: boolean }` based on fail-on-error policy

### SARIF mapping

Each SkillSpector issue maps to a SARIF result:
- `ruleId` ← `issue.id`
- `level` ← severity mapping (HIGH/CRITICAL → error, MEDIUM/WARNING → warning, else → note)
- `message.text` ← `issue.explanation`
- `locations[0].physicalLocation.artifactLocation.uri` ← workspace-relative `issue.location.file`
- `locations[0].physicalLocation.region.startLine` ← `issue.location.start_line`
- `properties` ← `{ category, confidence, remediation, code_snippet, intent, tags }`

### Annotation mapping

Code findings become `::error file=<path>,line=<n>::<rule_id>: <message>` workflow commands. Doc findings are excluded from annotations (they appear in the step summary only).

## Coexistence with @nx-devkit/skill

Both plugins trigger on `**/SKILL.md`. Nx merges targets from multiple plugins for the same project. Result:

```
project: act
targets:
  build:       @nx-devkit/skill:build
  lint:        nx:run-commands (markdownlint)
  validate:    nx:run-commands (validate-skill)
  os-check:    nx:run-commands (check-os-independence)
  size-check:  nx:run-commands (check-skill-size)
  scan:        @nx-devkit/skillspector:scan  ← this plugin
```

`nx affected -t build scan` runs both build and scan for changed skills.

## Migration path

1. Publish `@nx-devkit/skillspector` to npm (placeholder first).
2. `theplenkov-ai/skills` PR: replace `file:./actions/skillspector/nx-skillspector` with `@nx-devkit/skillspector`, remove old source.
3. `ThePlenkov/skills` PR: add `@nx-devkit/skillspector` devDependency.
4. Both repos: `nx affected -t scan` works.

## Risks

- **SkillSpector not installed**: the executor calls `skillspector` CLI. If not installed, it fails with a clear error. CI workflows must install it via `pip install git+https://github.com/NVIDIA/SkillSpector`. Document in README.
- **Nx stdout prefixing**: Nx prefixes worker output with ANSI-colored project names, breaking GitHub workflow commands. Mitigation: executor writes annotations to a shared file (`/tmp/nx-skillspector-annotations.log`), outer workflow step cats the file.
- **SARIF multi-run merge**: GitHub code-scanning rejects SARIF with multiple runs sharing a category. Mitigation: per-skill SARIF files are merged into one run by the workflow step (not the executor).

## TDD plan

1. Write failing test: plugin infers `scan` target for SKILL.md directory.
2. Write failing test: executor runs skillspector and parses JSON output (mock spawn).
3. Write failing test: executor maps issues to SARIF correctly.
4. Write failing test: executor maps code findings to annotations, doc findings excluded.
5. Write failing test: fail-on-error policy (high/critical → failure).
6. Implement, refactor, verify.
