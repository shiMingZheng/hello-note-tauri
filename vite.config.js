// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: 'src/index.html',
      },
    },
  },
  server: {
    port: 1420,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});