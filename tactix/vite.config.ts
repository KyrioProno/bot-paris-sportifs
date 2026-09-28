import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// TACTIX — configuration Vite.
// host 0.0.0.0 + allowedHosts pour fonctionner derrière le proxy de prévisualisation.
// SINGLE=1 produit un fichier HTML unique et autonome (utilisable hors ligne).
const single = process.env.SINGLE === '1';

export default defineConfig({
  plugins: [react(), ...(single ? [viteSingleFile()] : [])],
  // Chemins relatifs : le build fonctionne aussi bien sur un domaine racine
  // que dans un sous-dossier (GitHub Pages, partage de fichier…).
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    hmr: { clientPort: 443 },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  build: {
    outDir: single ? 'dist-single' : 'dist',
    sourcemap: false,
    // Le fichier unique doit aussi s'ouvrir par double-clic (file://) :
    // on produit un script classique, sans module ES externe.
    target: 'es2018',
    rollupOptions: single
      ? { output: { format: 'iife' as const, inlineDynamicImports: true } }
      : undefined,
  },
});
