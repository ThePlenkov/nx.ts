import { defineWorkspace } from 'vitest/config'

export default defineWorkspace({
  test: {
    projects: ['./packages/*/src', './packages/*/test'],
  },
})
