import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // ffmpeg を実際に走らせる統合テストがあるため長めに取る。
    testTimeout: 60_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['server/**/*.ts'],
      // 起動処理と型定義だけのファイルは対象外。
      exclude: ['server/index.ts', 'server/**/types.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
})
