import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.js'],
    exclude: [
      'test/proxy.test.js', // uses node:test + live SSI server
      'test/session-timeout.test.js', // uses node:test + live SSI server + time delays
    ],
  },
})
