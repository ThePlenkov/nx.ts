# Spec: skillspector-executor

## ADDED Requirements

### Requirement: SKILL.md triggers scan target inference
The plugin MUST use `createNodesV2` with trigger file `**/SKILL.md`. For each `SKILL.md` found, a `scan` target is inferred using the `@nx-devkit/skillspector:scan` executor.

#### Scenario: Scan target inferred
- **WHEN** a workspace contains `skills/code-review/act/SKILL.md`
- **THEN** a `scan` target is inferred for project `act` with executor `@nx-devkit/skillspector:scan`

### Requirement: Scan executor runs SkillSpector CLI
The executor MUST spawn `skillspector scan <path>` with `--no-llm` by default and `--format json` to capture findings.

#### Scenario: Default invocation
- **WHEN** the scan executor runs with default options
- **THEN** it spawns `skillspector scan <skill-path> --no-llm --format json`

#### Scenario: LLM enabled
- **WHEN** `noLlm: false` is set
- **THEN** the executor does NOT pass `--no-llm`

#### Scenario: Baseline passed
- **WHEN** `baseline: ".skillspector-baseline.yaml"` is set
- **THEN** the executor passes `--baseline .skillspector-baseline.yaml`

### Requirement: SARIF 2.1.0 output
The executor MUST produce a SARIF 2.1.0 report when `sarif` option is set, preserving per-issue metadata (category, confidence, remediation, code_snippet) under `properties`.

#### Scenario: SARIF written
- **WHEN** `sarif: "report.sarif"` is set and findings exist
- **THEN** a SARIF 2.1.0 file is written with one run containing all findings as results

### Requirement: GitHub Actions annotations for code findings
The executor MUST emit `::error file=<path>,line=<n>::<message>` workflow commands for findings in code files (`.ts`, `.js`, `.py`, `.sh`, `.yml`, `.json`). Findings in documentation files (`.md`, `.txt`) MUST NOT be emitted as annotations.

#### Scenario: Code finding annotated
- **WHEN** a finding is in `scripts/foo.ts` at line 42
- **THEN** an annotation `::error file=scripts/foo.ts,line=42::SQP-1: <message>` is written to the shared annotations file

#### Scenario: Doc finding not annotated
- **WHEN** a finding is in `references/guide.md`
- **THEN** no annotation is emitted for this finding

### Requirement: Annotations written to shared file
The executor MUST write annotations to a shared file (default: `/tmp/nx-skillspector-annotations.log`) rather than stdout, because Nx prefixes stdout with ANSI-colored project names that break GitHub workflow command parsing.

#### Scenario: Annotations file path
- **WHEN** the executor runs with annotations enabled
- **THEN** annotations are appended to the file specified by `ANNOTATIONS_FILE` env var or `/tmp/nx-skillspector-annotations.log`

### Requirement: Fail-on-error policy
When `failOnError: true` (default), the executor MUST return `{ success: false }` if any HIGH or CRITICAL severity finding exists. Otherwise it returns `{ success: true }`.

#### Scenario: High finding fails
- **WHEN** findings include a HIGH severity issue and `failOnError: true`
- **THEN** the executor returns `{ success: false }`

#### Scenario: Low finding succeeds
- **WHEN** findings include only LOW/MEDIUM severity issues and `failOnError: true`
- **THEN** the executor returns `{ success: true }`

### Requirement: Workspace root skipped
The plugin MUST NOT infer a scan target for `SKILL.md` at the workspace root.

#### Scenario: Root SKILL.md ignored
- **WHEN** `SKILL.md` exists at the workspace root
- **THEN** no scan target is inferred for it

### Requirement: Coexistence with @nx-devkit/skill
The plugin MUST coexist with `@nx-devkit/skill` when both are registered. `@nx-devkit/skill` adds `build`/`lint`/`validate`/`os-check`/`size-check` targets; `@nx-devkit/skillspector` adds `scan`. No target name conflicts.

#### Scenario: Both plugins registered
- **WHEN** `nx.json` registers both `@nx-devkit/skill` and `@nx-devkit/skillspector`
- **THEN** each skill project has `build`, `lint`, `validate`, `os-check`, `size-check`, AND `scan` targets

### Requirement: Custom scan target name
The plugin MUST accept `scanTargetName` option to override the default `scan` target name.

#### Scenario: Custom target name
- **WHEN** `scanTargetName: "security-scan"` is set
- **THEN** the scan target is named `security-scan` instead of `scan`
