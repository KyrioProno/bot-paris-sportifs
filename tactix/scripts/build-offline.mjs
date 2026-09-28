/**
 * TACTIX — build « fichier unique ».
 * Produit un seul fichier HTML autonome (JS + CSS inclus), utilisable
 * hors ligne, par double-clic ou servi par n'importe quel hébergeur.
 *
 *   node scripts/build-offline.mjs            → docs/tactix.html
 */
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, '../docs/tactix.html');

console.log('› build du fichier unique…');
execSync('npx vite build', { cwd: root, stdio: 'inherit', env: { ...process.env, SINGLE: '1' } });

const source = resolve(root, 'dist-single/index.html');
let html = readFileSync(source, 'utf8');

// 1. Script classique (et non module ES) : le fichier s'ouvre alors
//    directement par double-clic, même en file://.
html = html.replace('<script type="module" crossorigin>', '<script>');

// 2. Un script classique placé dans <head> s'exécute avant que la page
//    soit analysée : on le déplace à la fin du <body> pour qu'il trouve
//    bien son conteneur #root (les scripts des fenêtres d'impression
//    restent en place).
const start = html.indexOf('<script>');
const end = html.indexOf('<\/script>', start);
if (start === -1 || end === -1) throw new Error('script principal introuvable');
const script = html.slice(start, end + '<\/script>'.length);
html = html.slice(0, start) + html.slice(start + script.length);
html = html.replace('</body>', `    ${script}\n  </body>`);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`› ${out} (${(html.length / 1024).toFixed(0)} Ko)`);
void copyFileSync;
