import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/plugin.ts'],
  format: 'esm',
  clean: true,
  dts: true,
  deps: {
    neverBundle: ['nx', '@nx/devkit'],
  },
})
