import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,       // opzionale: usa describe/it/expect senza import
    environment: 'node',  // 'jsdom' se testi codice che tocca il DOM
    include: ['src/**/*.{test,spec}.{js,ts}'],
  },
})