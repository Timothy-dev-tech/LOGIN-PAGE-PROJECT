import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    // In development, forward /api calls to the Express server so the browser
    // sees one origin (no CORS, and cookies work).
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
