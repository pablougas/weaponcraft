import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
          three: ['three'],
        },
      },
    },
    // Rapier-compat inlines its WASM (~4.3 MB, ~1.6 MB gzipped) so it needs no extra request.
    chunkSizeWarningLimit: 4500,
  },
});
