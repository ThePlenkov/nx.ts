import { basename, dirname, relative, resolve } from 'node:path'
import type {
  CreateNodesResult,
  CreateNodesV2,
  TargetConfiguration,
} from '@nx/devkit'

import type { NxDevkitTypescriptOptions } from './types.js'
import { shouldSkipPath, logDebug, isVerbose, resetCachedEnv } from '@nx-devkit/internal'
import { globMatch } from './glob.js'
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
export { globMatch } from './glob.js'
export { inferTypecheckTarget } from './targets/typecheck.js'
export { inferVitestTargets } from './targets/vitest.js'
export { inferNativeTestTargets } from './targets/native-test.js'
export { inferOxlintTarget, inferEslintTarget } from './targets/lint.js'
export { inferBiomeTargets } from './targets/format.js'
export { inferTsdownBuildTarget, inferTsdownWatchTarget } from './targets/build.js'

const PLUGIN_SCOPE = 'nx-typescript'

export const createNodesV2: CreateNodesV2<NxDevkitTypescriptOptions> = [
  '**/tsconfig*.json',
  (configFiles, options = {}, context) => {
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

    logDebug(PLUGIN_SCOPE, `Detected ${filteredConfigFiles.length} ${configFileName} files`)

    return filteredConfigFiles
      .map((configFile) => {
        const projectRoot = dirname(configFile)

        if (shouldSkipPath(projectRoot, workspaceRoot)) {
          logDebug(PLUGIN_SCOPE, `Skipping ${projectRoot}`)
          return null
        }

        const projectKey = (
          relative(workspaceRoot, resolve(workspaceRoot, projectRoot)) || '.'
        ).replace(/\\/g, '/')

        logDebug(PLUGIN_SCOPE, `Registering targets for ${projectKey}`)

        const relProjectRoot = projectKey

        const hasNativePreview = checkNativePreview(projectRoot, workspaceRoot)

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

        const vitestConfigPath = findVitestConfig(projectRoot, workspaceRoot)
        if (vitestConfigPath) {
          Object.assign(targets, inferVitestTargets(relProjectRoot, vitestConfigPath))
        } else {
          const absProjectRoot = resolve(workspaceRoot, projectRoot)
          const hasTestFiles =
            globMatch(absProjectRoot, testGlob) || globMatch(absProjectRoot, specGlob)
          if (hasTestFiles) {
            Object.assign(
              targets,
              inferNativeTestTargets(relProjectRoot, { tap, coverage, testGlob, specGlob }),
            )
          }
        }

        const oxlintrcPath = findConfigFile(projectRoot, workspaceRoot, OXLINTRC_NAMES)
        const oxlintOwnsLint = oxlint && oxlintrcPath !== null
        if (oxlintOwnsLint) {
          targets.lint = inferOxlintTarget(relProjectRoot)
        }

        if (!oxlintOwnsLint && eslint) {
          const eslintConfigPath = findConfigFile(projectRoot, workspaceRoot, ESLINT_CONFIG_NAMES)
          if (eslintConfigPath) {
            targets.lint = inferEslintTarget(relProjectRoot)
          }
        }

        if (biome) {
          const biomeConfigPath = findConfigFile(projectRoot, workspaceRoot, BIOME_CONFIG_NAMES)
          if (biomeConfigPath) {
            const biomeProvidesLint = !oxlintOwnsLint && !('lint' in targets && targets.lint)
            Object.assign(targets, inferBiomeTargets(relProjectRoot, biomeProvidesLint))
          }
        }

        if (tsdown) {
          const tsdownConfigPath = findConfigFile(projectRoot, workspaceRoot, TSDOWN_CONFIG_NAMES)
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
      })
      .filter((result): result is [string, CreateNodesResult] => result !== null)
  },
]
