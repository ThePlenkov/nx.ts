import { createHash } from 'node:crypto'
import { dirname, relative, resolve } from 'node:path'
import {
  type CreateNodesResult,
  type CreateNodesV2,
  type TargetConfiguration,
  logger,
} from '@nx/devkit'
import { shouldSkipPath } from '@nx-devkit/internal'
export { shouldSkipPath }

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

const PLUGIN_SCOPE = 'nx-devkit/skill'

/**
 * Compute an injective project name from a project root.
 *
 * The slug replaces `/` with `-` and appends the first 12 hex chars of a
 * SHA-256 hash of the original (forward-slash) project root. This guarantees
 * that `skills/a-b` and `skills/a/b` — which would both slug to `skills-a-b`
 * — receive distinct project names.
 */
export function computeProjectName(projectRoot: string): string {
  const slug = projectRoot.replace(/\//g, '-')
  const hash = createHash('sha256').update(projectRoot).digest('hex').slice(0, 12)
  return `${slug}-${hash}`
}

function inferBuildTarget(projectRoot: string, projectName: string, additionalInputs: string[]) {
  return {
    executor: '@nx-devkit/skill:build',
    cache: true,
    outputs: [`{workspaceRoot}/.build/skills/${projectName}`],
    options: {
      target: 'skills-sh',
      outDir: `.build/skills/${projectName}`,
      path: projectRoot,
    },
    inputs: [
      `{projectRoot}/SKILL.md`,
      `{projectRoot}/**/*.md`,
      `{projectRoot}/scripts/**/*`,
      `{projectRoot}/references/**/*`,
      `{projectRoot}/assets/**/*`,
      `{projectRoot}/agents/**/*`,
      ...additionalInputs,
      '^production',
    ],
  }
}

function inferLintTarget() {
  return {
    executor: 'nx:run-commands',
    cache: true,
    options: {
      command: `markdownlint-cli2 '{projectRoot}/**/*.md' --config .markdownlint.json`,
      cwd: '{workspaceRoot}',
    },
    inputs: ['{projectRoot}/**/*.md', '{workspaceRoot}/.markdownlint.json'],
  }
}

function inferValidateTarget() {
  return {
    executor: 'nx:run-commands',
    cache: true,
    options: {
      command: 'tsx scripts/validate-skill.ts --skill {projectRoot}',
      cwd: '{workspaceRoot}',
    },
    inputs: ['{projectRoot}/SKILL.md', '{projectRoot}/agents/openai.yaml'],
  }
}

function inferOsCheckTarget() {
  return {
    executor: 'nx:run-commands',
    cache: true,
    options: {
      command: 'tsx scripts/check-os-independence.ts --skill {projectRoot}',
      cwd: '{workspaceRoot}',
    },
    inputs: ['{projectRoot}/**/*'],
  }
}

function inferSizeCheckTarget() {
  return {
    executor: 'nx:run-commands',
    cache: true,
    options: {
      command: 'tsx scripts/check-skill-size.ts --skill {projectRoot}',
      cwd: '{workspaceRoot}',
    },
    inputs: ['{projectRoot}/**/*'],
  }
}

export const createNodesV2: CreateNodesV2<NxDevkitSkillOptions> = [
  '**/SKILL.md',
  (configFiles, options = {}, context) => {
    const workspaceRoot = context.workspaceRoot
    const buildTargetName = options.buildTargetName ?? 'build'
    const lintTargetName = options.lintTargetName ?? 'lint'
    const validateTargetName = options.validateTargetName ?? 'validate'
    const osCheckTargetName = options.osCheckTargetName ?? 'os-check'
    const sizeCheckTargetName = options.sizeCheckTargetName ?? 'size-check'
    const additionalInputs = options.skillInputs ?? []

    return configFiles
      .map((configFile) => {
        const dir = dirname(configFile)
        const dirAbs = resolve(workspaceRoot, dir)

        if (shouldSkipPath(dir, workspaceRoot)) {
          logger.info(`[${PLUGIN_SCOPE}] Skipping ${dir}`)
          return null
        }

        const projectRoot = relative(workspaceRoot, dirAbs).replace(/\\/g, '/')
        const projectName = computeProjectName(projectRoot)

        const targetNames = [
          buildTargetName,
          lintTargetName,
          validateTargetName,
          osCheckTargetName,
          sizeCheckTargetName,
        ]
        const emptyName = targetNames.find((n) => !n || n.trim() === '')
        if (emptyName !== undefined) {
          logger.warn(`[${PLUGIN_SCOPE}] Skipping ${projectRoot}: empty target name`)
          return null
        }
        const uniqueNames = new Set(targetNames)
        if (uniqueNames.size !== targetNames.length) {
          logger.warn(`[${PLUGIN_SCOPE}] Skipping ${projectRoot}: duplicate target names`)
          return null
        }

        logger.info(`[${PLUGIN_SCOPE}] Registering targets for ${projectRoot}`)

        const targets: Record<string, TargetConfiguration> = {
          [buildTargetName]: inferBuildTarget(projectRoot, projectName, additionalInputs),
          [lintTargetName]: inferLintTarget(),
          [validateTargetName]: inferValidateTarget(),
          [osCheckTargetName]: inferOsCheckTarget(),
          [sizeCheckTargetName]: inferSizeCheckTarget(),
        }

        const result: [string, CreateNodesResult] = [
          configFile,
          {
            projects: {
              [projectName]: {
                targets,
              },
            },
          },
        ]
        return result
      })
      .filter((result): result is [string, CreateNodesResult] => result !== null)
  },
]
