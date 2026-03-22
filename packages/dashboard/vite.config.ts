import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { sentryVitePlugin } from '@sentry/vite-plugin';

export default defineConfig({
  plugins: [
    svelte(),
    sentryVitePlugin({
      org: 'aictpo',
      project: 'sidebutton-dashboard',
      authToken: process.env.SENTRY_AUTH_TOKEN,
    }),
  ],
  build: {
    outDir: '../server/dashboard',
    emptyOutDir: true,
    sourcemap: true,
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
