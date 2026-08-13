import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    coverage: {
      reporter: ['text', 'html'],
      include: ['cloudfunctions/api/src/**/*.ts', 'miniprogram/**/*.ts'],
      exclude: ['miniprogram/vendor/**', '**/types.ts', '**/*.d.ts'],
    },
  },
})

