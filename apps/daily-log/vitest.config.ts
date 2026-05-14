import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://localhost/daily_log_test',
      PORT: '4114'
    },
    sequence: { concurrent: false }
  }
})
