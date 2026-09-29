import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // The tree-shaken Three.js vendor chunk is about 617 kB raw and 159 kB gzip.
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/')) return 'three';
        },
      },
    },
  },
});
