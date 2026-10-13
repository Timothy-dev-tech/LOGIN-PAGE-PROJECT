import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
  // Three pages, so tell the build about both (the dev server finds them on its own).
  build: {
    rollupOptions: {
      input: {
        login: 'index.html',
        register: 'register.html',
        terms: 'terms.html',
      },
    },
  },
  // Only run the frontend unit tests from here. The server will have its own.
  test: {
    include: ['src/**/*.test.ts'],
  },
});