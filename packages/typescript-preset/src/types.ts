export interface NxDevkitTypescriptOptions {
  tsgo?: boolean
  configFile?: string
  clean?: boolean
  /** Infer `test:tap` target using the TAP reporter. Default: false. */
  tap?: boolean
  /** Infer `test:coverage` target for the native Node test runner. Default: false. */
  coverage?: boolean
  /** Infer `lint` target from `.oxlintrc.*`. Default: true. */
  oxlint?: boolean
  /** Infer `lint` target from `eslint.config.*`. Default: true. */
  eslint?: boolean
  /** Infer `format`/`format-check`/`lint` from `biome.json`. Default: true. */
  biome?: boolean
  /** Infer `build` target from `tsdown.config.ts`. Default: true. */
  tsdown?: boolean
  /** Glob for native test files. Default: double-star-slash-star.test.ts-js-mts-mjs. */
  testGlob?: string
  /** Glob for spec files. Default: double-star-slash-star.spec.ts-js-mts-mjs. */
  specGlob?: string
}
