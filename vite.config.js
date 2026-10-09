import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    port: 5173,
    // In development, forward /api calls to the Express server so the browser
    // sees one origin (no CORS, and cookies work).
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
  // Two pages, so we tell the build about both (the dev server finds them on its own).
  build: {
    rollupOptions: {
      input: {
        login: 'index.html',
        register: 'register.html',
      },
    },
  },
  // Only run the frontend unit tests from here. The server will have its own.
  test: {
    include: ['src/**/*.test.ts'],
  },
});
