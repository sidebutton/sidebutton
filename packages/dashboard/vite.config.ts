import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  build: {
    outDir: 'dist',
    emptyDirBeforeWrite: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:9876',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:9876',
        ws: true,
      },
      '/mcp': {
        target: 'http://localhost:9876',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:9876',
        changeOrigin: true,
      },
    },
  },
});
