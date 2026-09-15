import { basename, dirname, relative, resolve } from 'node:path'
import type { CreateNodesResult, CreateNodesV2, TargetConfiguration } from '@nx/devkit'

import type { NxDevkitTypescriptOptions } from './types.js'
import {
  shouldSkipPath,
  logDebug,
  isVerbose,
  resetCachedEnv,
  mapWithConcurrency,
} from '@nx-devkit/internal'
import { globMatchAsync } from './glob.js'
import {
  BIOME_CONFIG_NAMES,
  ESLINT_CONFIG_NAMES,
  OXLINTRC_NAMES,
  TSDOWN_CONFIG_NAMES,
  checkNativePreview,
  findConfigFile,
  findVitestConfig,
} from './config.js'
import { inferTypecheckTarget } from './targets/typecheck.js'
import { inferVitestTargets } from './targets/vitest.js'
import { inferNativeTestTargets } from './targets/native-test.js'
import { inferOxlintTarget, inferEslintTarget } from './targets/lint.js'
import { inferBiomeTargets } from './targets/format.js'
import { inferTsdownBuildTarget, inferTsdownWatchTarget } from './targets/build.js'

// Re-export everything for backward compatibility
export type { NxDevkitTypescriptOptions }
export { shouldSkipPath, isVerbose, resetCachedEnv, logDebug }
export { globMatch, globMatchAsync, globToRegExp, expandBraces } from './glob.js'
export { inferTypecheckTarget } from './targets/typecheck.js'
export { inferVitestTargets } from './targets/vitest.js'
export { inferNativeTestTargets } from './targets/native-test.js'
export { inferOxlintTarget, inferEslintTarget } from './targets/lint.js'
export { inferBiomeTargets } from './targets/format.js'
export { inferTsdownBuildTarget, inferTsdownWatchTarget } from './targets/build.js'

const PLUGIN_SCOPE = 'nx-typescript'

export const createNodesV2: CreateNodesV2<NxDevkitTypescriptOptions> = [
  '**/tsconfig*.json',
  async (configFiles, options = {}, context) => {
    const configFileName = options.configFile ?? 'tsconfig.json'
    const tsgo = options.tsgo ?? true
    const clean = options.clean ?? false
    const tap = options.tap ?? false
    const coverage = options.coverage ?? false
    const oxlint = options.oxlint ?? true
    const eslint = options.eslint ?? true
    const biome = options.biome ?? true
    const tsdown = options.tsdown ?? true
    const testGlob = options.testGlob ?? '**/*.test.{ts,js,mts,mjs}'
    const specGlob = options.specGlob ?? '**/*.spec.{ts,js,mts,mjs}'
    const workspaceRoot = context.workspaceRoot

    const filteredConfigFiles = configFiles.filter(
      (configFile) => basename(configFile) === configFileName,
    )

    // Root project semantics: the workspace root is a real project when
    // `includeRoot` is set, or automatically when it is the only config
    // detected (single-package repo). Auto-mode self-corrects — when
    // nested projects appear later, the root is skipped again without
    // any stale flag left in nx.json. An explicit `false` always wins.
    const hasNestedProjects = filteredConfigFiles.some(
      (configFile) => resolve(workspaceRoot, dirname(configFile)) !== resolve(workspaceRoot),
    )
    const effectiveIncludeRoot =
      options.includeRoot === true ||
      (options.includeRoot === undefined && !hasNestedProjects)

    logDebug(PLUGIN_SCOPE, `Detected ${filteredConfigFiles.length} ${configFileName} files`)

    // Bound concurrency: each project issues several fs probes and up to
    // two recursive glob scans, so an unbounded Promise.all over every
    // detected tsconfig would flood the fs on a large monorepo.
    const results = await mapWithConcurrency(
      filteredConfigFiles,
      8,
      async (configFile) => {
        const projectRoot = dirname(configFile)
        const isWorkspaceRoot =
          resolve(workspaceRoot, projectRoot) === resolve(workspaceRoot)

        // The workspace root is only a project when includeRoot applies
        // (explicit or single-package auto). Other skip reasons
        // (node_modules, escaping the root) still apply regardless.
        if (shouldSkipPath(projectRoot, workspaceRoot) && !(effectiveIncludeRoot && isWorkspaceRoot)) {
          logDebug(PLUGIN_SCOPE, `Skipping ${projectRoot}`)
          return null
        }

        const projectKey = (
          relative(workspaceRoot, resolve(workspaceRoot, projectRoot)) || '.'
        ).replace(/\\/g, '/')

        logDebug(PLUGIN_SCOPE, `Registering targets for ${projectKey}`)

        const relProjectRoot = projectKey

        const hasNativePreview = await checkNativePreview(projectRoot, workspaceRoot)

        const typecheckTarget = inferTypecheckTarget(
          relProjectRoot,
          {
            tsgo,
            configFile: configFileName,
            clean,
          },
          hasNativePreview,
        )

        const targets: Record<string, TargetConfiguration> = {
          typecheck: typecheckTarget,
        }

        const vitestConfigPath = await findVitestConfig(projectRoot, workspaceRoot)
        if (vitestConfigPath) {
          Object.assign(targets, inferVitestTargets(relProjectRoot, vitestConfigPath))
        } else {
          const absProjectRoot = resolve(workspaceRoot, projectRoot)
          const hasTestFiles =
            (await globMatchAsync(absProjectRoot, testGlob)) ||
            (await globMatchAsync(absProjectRoot, specGlob))
          if (hasTestFiles) {
            Object.assign(
              targets,
              inferNativeTestTargets(relProjectRoot, { tap, coverage, testGlob, specGlob }),
            )
          }
        }

        // Lint-family configs fall back to the workspace root: a root
        // .oxlintrc/eslint.config/biome.json applies lint/format to every
        // project (the tools themselves walk up for config discovery).
        // When the fallback is used, the root config becomes a cache
        // input so edits invalidate the lint/format caches.
        const projectOxlintrc = await findConfigFile(
          projectRoot,
          workspaceRoot,
          OXLINTRC_NAMES,
        )
        const oxlintrcPath =
          projectOxlintrc ?? (await findConfigFile('.', workspaceRoot, OXLINTRC_NAMES))
        const oxlintOwnsLint = oxlint && oxlintrcPath !== null
        if (oxlintOwnsLint) {
          targets.lint = inferOxlintTarget(relProjectRoot)
          if (!projectOxlintrc) {
            targets.lint.inputs.push('{workspaceRoot}/.oxlintrc.*')
          }
        }

        if (!oxlintOwnsLint && eslint) {
          const projectEslintConfig = await findConfigFile(
            projectRoot,
            workspaceRoot,
            ESLINT_CONFIG_NAMES,
          )
          const eslintConfigPath =
            projectEslintConfig ??
            (await findConfigFile('.', workspaceRoot, ESLINT_CONFIG_NAMES))
          if (eslintConfigPath) {
            targets.lint = inferEslintTarget(relProjectRoot)
            if (!projectEslintConfig) {
              targets.lint.inputs.push('{workspaceRoot}/eslint.config.*')
            }
          }
        }

        if (biome) {
          const projectBiomeConfig = await findConfigFile(
            projectRoot,
            workspaceRoot,
            BIOME_CONFIG_NAMES,
          )
          const biomeConfigPath =
            projectBiomeConfig ?? (await findConfigFile('.', workspaceRoot, BIOME_CONFIG_NAMES))
          if (biomeConfigPath) {
            const biomeProvidesLint = !oxlintOwnsLint && !('lint' in targets && targets.lint)
            const inferred = inferBiomeTargets(relProjectRoot, biomeProvidesLint)
            if (!projectBiomeConfig) {
              // Copy before extending — inferBiomeTargets shares the
              // module-level BIOME_INPUTS array across targets/projects.
              for (const t of Object.values(inferred)) {
                t.inputs = [
                  ...t.inputs,
                  '{workspaceRoot}/biome.json',
                  '{workspaceRoot}/biome.jsonc',
                ]
              }
            }
            Object.assign(targets, inferred)
          }
        }

        if (tsdown) {
          const tsdownConfigPath = await findConfigFile(
            projectRoot,
            workspaceRoot,
            TSDOWN_CONFIG_NAMES,
          )
          if (tsdownConfigPath) {
            targets.build = inferTsdownBuildTarget(relProjectRoot)
            targets['build:watch'] = inferTsdownWatchTarget(relProjectRoot)
          }
        }

        const result: [string, CreateNodesResult] = [
          configFile,
          {
            projects: {
              [projectKey]: {
                targets,
              },
            },
          },
        ]
        return result
      },
    )

    return results.filter((r): r is [string, CreateNodesResult] => r !== null)
  },
]
