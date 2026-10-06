import { defineConfig } from 'vite';

function publicAssetBasePlugin() {
  let publicAssetBase = '/';
  return {
    name: 'ilmatila-public-asset-base',
    configResolved(config) {
      publicAssetBase = process.env.VITE_PUBLIC_ASSET_BASE_URL || config.base;
    },
    transformIndexHtml(html) {
      return html.replaceAll('%PUBLIC_ASSET_BASE_URL%', publicAssetBase);
    },
  };
}

export default defineConfig({
  plugins: [publicAssetBasePlugin()],
  build: {
    copyPublicDir: process.env.ILMATILA_COPY_PUBLIC_DIR !== 'false',
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
