// Vite config for building the canvas as a static bundle for the Chrome extension.
// This bundles the canvas React components (no Next.js, no server) into a single
// JS+CSS that sidepanel.html / newtab.html can load.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  css: {
    postcss: { plugins: [] },
  },
  build: {
    outDir: 'extension/content',
    emptyOutDir: true,
    rollupOptions: {
      input: 'extension/entry.jsx',
      output: {
        entryFileNames: 'canvas-bundle.js',
        assetFileNames: 'styles.css',
      },
    },
    cssCodeSplit: false,
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
});
