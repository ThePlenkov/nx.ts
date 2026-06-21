import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/plugin.ts'],
  format: 'esm',
  clean: true,
  dts: true,
})
