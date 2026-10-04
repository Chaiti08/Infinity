import { defineConfig } from 'vite';

// Relative base so the build works on GitHub Pages project URLs
// (https://<user>.github.io/<repo>/) as well as any static host.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
  },
  server: { host: true },
});
