import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// TACTIX — configuration Vite.
// host 0.0.0.0 + allowedHosts pour fonctionner derrière le proxy de prévisualisation.
export default defineConfig({
  plugins: [react()],
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
    outDir: 'dist',
    sourcemap: false,
  },
});
