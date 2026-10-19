import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,       // optional: use describe/it/expect without imports
    environment: 'node',  // 'jsdom' if testing code that touches the DOM
    include: ['src/**/*.{test,spec}.{js,ts}'],
  },
})