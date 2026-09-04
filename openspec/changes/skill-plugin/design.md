# Design: @nx-devkit/skill

## Architecture

```
packages/skill/
├── package.json              # @nx-devkit/skill
├── tsdown.config.ts          # entry: src/index.ts
├── vitest.config.ts
├── executors.json
├── src/
│   ├── index.ts              # re-exports createNodesV2 + executor
│   ├── plugin.ts             # createNodesV2 — SKILL.md → targets
│   ├── executors/
│   │   └── build/
│   │       ├── executor.ts   # compile skill to distribution target
│   │       └── schema.json   # executor options schema
│   └── lib/
│       ├── discovery.ts      # skill directory discovery helpers
│       └── compiler.ts       # thin wrapper over skills-compiler
├── test/
│   ├── plugin.spec.ts
│   └── executor.spec.ts
├── README.md
└── AGENTS.md
```

## Plugin: createNodesV2

```ts
export const createNodesV2: CreateNodesV2<NxDevkitSkillOptions> = [
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
          [opts.buildTargetName]: {
            executor: '@nx-devkit/skill:build',
            outputs: [`{workspaceRoot}/.build/skills/${projectName}`],
            options: { target: 'skills-sh', outDir: `.build/skills/${projectName}` },
            cache: true,
            inputs: ['skill', '^production'],
          },
          [opts.lintTargetName]: {
            executor: 'nx:run-commands',
            cache: true,
            inputs: ['{projectRoot}/**/*.md', '{workspaceRoot}/.markdownlint.json'],
            options: {
              command: `npx markdownlint-cli2 '{projectRoot}/**/*.md' --config .markdownlint.json`,
              cwd: projectRoot,
            },
          },
          [opts.validateTargetName]: {
            executor: 'nx:run-commands',
            cache: true,
            inputs: [
              '{projectRoot}/SKILL.md',
              '{projectRoot}/agents/openai.yaml',
              '{workspaceRoot}/.github/skill-schema.json',
              '{workspaceRoot}/.github/openai-metadata-schema.json',
            ],
            options: {
              command: `npx tsx scripts/validate-skill.ts ${projectRoot}`,
              cwd: '{workspaceRoot}',
            },
          },
          [opts.osCheckTargetName]: {
            executor: 'nx:run-commands',
            cache: true,
            inputs: ['{projectRoot}/**/*'],
            options: {
              command: `npx tsx scripts/check-os-independence.ts --skill ${projectRoot}`,
              cwd: '{workspaceRoot}',
            },
          },
          [opts.sizeCheckTargetName]: {
            executor: 'nx:run-commands',
            cache: true,
            inputs: ['{projectRoot}/**/*'],
            options: {
              command: `npx tsx scripts/check-skill-size.ts --skill ${projectRoot}`,
              cwd: '{workspaceRoot}',
            },
          },
        };

        return [skillFile, { projects: { [projectRoot]: { name: projectName, root: projectRoot, targets } } }];
      })
      .filter((r): r is [string, CreateNodesResult] => r !== null);
  },
];
```

## Build executor

The build executor wraps the skills compiler. It accepts `target` (skills-sh, claude, codex, agents, obsidian) and `outDir`. The compiler itself is imported from `@theplenkov/skills-compiler` (published separately) or inlined as a thin wrapper.

```ts
export default async function buildExecutor(
  options: BuildExecutorOptions,
  context: ExecutorContext,
): Promise<{ success: boolean }> {
  const skillPath = path.resolve(context.root, options.path ?? context.projectName);
  const outDir = path.resolve(context.root, options.outDir);
  const result = await compileSkill({
    skillPath,
    target: options.target,
    outDir,
  });
  return { success: result.success };
}
```

## Migration path

1. Publish `@nx-devkit/skill` to npm (placeholder first via `prepare-for-release`).
2. `theplenkov-ai/skills` PR: replace `file:./tools/nx-skill` with `@nx-devkit/skill`, remove `tools/nx-skill/`.
3. `ThePlenkov/skills` PR: add `@nx-devkit/skill` devDependency, add `nx.json` with plugin.
4. Both repos: `nx affected -t build lint validate os-check size-check` works.

## Risks

- **Compiler dependency**: the build executor needs the skills compiler. Either publish `@theplenkov/skills-compiler` to npm or inline the compiler call. Decision: publish compiler separately, executor depends on it.
- **Validate/os-check scripts**: these reference scripts in the consumer repo (`scripts/validate-skill.ts` etc.). The plugin infers the target but the script must exist in the consumer. Document this as a consumer responsibility.
- **Project name collisions**: two skills with the same directory name in different categories. Mitigation: use full relative path as project name (e.g. `code-review-act` instead of `act`).

## TDD plan

1. Write failing test: workspace with `skills/code-review/act/SKILL.md` → expect project `act` with `build`, `lint`, `validate`, `os-check`, `size-check` targets.
2. Write failing test: workspace root `SKILL.md` is skipped.
3. Write failing test: `node_modules/` SKILL.md is skipped.
4. Write failing test: build executor compiles a skill to skills-sh format.
5. Implement, refactor, verify.
