import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/plugin.ts', 'src/generators/init/generator.ts', 'src/bin/init.ts'],
  format: ['esm'],
  dts: { eager: true },
  clean: true,
  deps: { alwaysBundle: ['@nx-devkit/internal'] },
})
