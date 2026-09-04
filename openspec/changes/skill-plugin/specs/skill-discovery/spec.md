# Spec: skill-discovery

## ADDED Requirements

### Requirement: SKILL.md triggers project inference
The plugin MUST use `createNodesV2` with trigger file `**/SKILL.md`. For each `SKILL.md` found, a project is inferred with the directory name as project name and the directory as project root.

#### Scenario: Skill discovered
- **WHEN** a workspace contains `skills/code-review/act/SKILL.md`
- **THEN** a project named `act` is inferred with root `skills/code-review/act`

### Requirement: Build target inferred
The plugin MUST infer a `build` target for each skill project using the `@nx-devkit/skill:build` executor with `target: "skills-sh"` and `outDir: ".build/skills/{projectName}"` defaults.

#### Scenario: Build target
- **WHEN** a skill project is discovered
- **THEN** a `build` target exists with executor `@nx-devkit/skill:build`, cache enabled, outputs `{workspaceRoot}/.build/skills/{projectName}`

### Requirement: Lint target inferred
The plugin MUST infer a `lint` target using `npx markdownlint-cli2` with markdownlint config.

#### Scenario: Lint target
- **WHEN** a skill project is discovered
- **THEN** a `lint` target exists with command `npx markdownlint-cli2 '{projectRoot}/**/*.md' --config .markdownlint.json`, cache enabled

### Requirement: Validate target inferred
The plugin MUST infer a `validate` target that checks SKILL.md frontmatter and metadata schemas.

#### Scenario: Validate target
- **WHEN** a skill project is discovered
- **THEN** a `validate` target exists with cache enabled, inputs including `SKILL.md` and `agents/openai.yaml`

### Requirement: OS-check target inferred
The plugin MUST infer an `os-check` target that verifies no hardcoded absolute paths or OS-specific commands.

#### Scenario: OS-check target
- **WHEN** a skill project is discovered
- **THEN** an `os-check` target exists with cache enabled

### Requirement: Size-check target inferred
The plugin MUST infer a `size-check` target that verifies the skill stays within a size budget.

#### Scenario: Size-check target
- **WHEN** a skill project is discovered
- **THEN** a `size-check` target exists with cache enabled

### Requirement: Workspace root skipped
The plugin MUST NOT infer a project for a `SKILL.md` at the workspace root.

#### Scenario: Root SKILL.md ignored
- **WHEN** `SKILL.md` exists at the workspace root (not in a subdirectory)
- **THEN** no project is inferred for it

### Requirement: node_modules skipped
The plugin MUST NOT infer projects for `SKILL.md` files inside `node_modules/`.

#### Scenario: node_modules SKILL.md ignored
- **WHEN** `node_modules/some-pkg/SKILL.md` exists
- **THEN** no project is inferred for it

### Requirement: Custom target names via options
The plugin MUST accept options to override default target names (`buildTargetName`, `lintTargetName`, `validateTargetName`, `osCheckTargetName`, `sizeCheckTargetName`).

#### Scenario: Custom build target name
- **WHEN** `buildTargetName: "compile"` is set
- **THEN** the build target is named `compile` instead of `build`

## ADDED Requirements (build executor)

### Requirement: Build executor compiles skills
The `@nx-devkit/skill:build` executor MUST compile a skill directory to a specified distribution target (skills-sh, claude, codex, agents, obsidian).

#### Scenario: Compile to skills-sh
- **WHEN** the build executor runs with `target: "skills-sh"` and `outDir: "./dist/act"`
- **THEN** the skill is compiled and written to `./dist/act/` in skills-sh format

#### Scenario: Invalid target fails
- **WHEN** the build executor runs with `target: "invalid"`
- **THEN** the executor returns `{ success: false }`
