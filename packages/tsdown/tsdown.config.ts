import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/plugin.ts'],
  format: ['esm'],
  dts: { eager: true },
  clean: true,
  deps: { alwaysBundle: ['@nx-devkit/internal'] },
})
