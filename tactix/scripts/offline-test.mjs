/**
 * TACTIX — test du fichier unique (docs/tactix.html).
 * Charge réellement le fichier HTML autonome dans un DOM, exécute son
 * script et vérifie que l'application se monte et réagit aux clics.
 *
 *   node scripts/offline-test.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = resolve(root, process.argv[2] ?? '../docs/tactix.html');
const html = readFileSync(file, 'utf8');

let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`   ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failed += 1;
};

console.log('\nTACTIX — test du fichier autonome');

const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (e) => errors.push(e.message));
virtualConsole.on('error', (...args) => errors.push(args.join(' ')));

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://exemple.test/',
  virtualConsole,
});

const { window } = dom;
const doc = window.document;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(600);

const rootEl = doc.getElementById('root');
check('le fichier ne référence aucune ressource externe', !/(src|href)="(https?:)?\/\//.test(html));
check('le script est en ligne (aucun fichier à côté)', html.includes('<script>'));
check('un conteneur #root est présent', !!rootEl);
check(
  'l’application se monte dans le navigateur',
  (rootEl?.innerHTML ?? '').length > 2000,
  `contenu : ${(rootEl?.innerHTML ?? '').length} caractères`,
);
check('le titre TACTIX est affiché', (rootEl?.textContent ?? '').includes('TACTIX'));
check('l’accueil affiche les créations rapides', (rootEl?.textContent ?? '').includes('Nouvelle tactique'));
check('la navigation est en place', (rootEl?.textContent ?? '').includes('Bibliothèque'));

// Navigation réelle : clic sur « Bibliothèque »
const navButtons = [...doc.querySelectorAll('.nav__item, button')];
const libraryTab = navButtons.find((b) => (b.textContent ?? '').trim().startsWith('Bibliothèque'));
if (libraryTab) {
  libraryTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(400);
  const text = doc.getElementById('root')?.textContent ?? '';
  check(
    'la navigation par onglet fonctionne',
    text.includes('Mes tactiques') && text.includes('Mes exercices'),
  );
} else {
  check('la navigation par onglet fonctionne', false, 'onglet introuvable');
}

// Création d'un exercice depuis l'accueil : clic sur « Nouvelle tactique »
const backHome = [...doc.querySelectorAll('button')].find((b) =>
  (b.textContent ?? '').trim().startsWith('Accueil'),
);
backHome?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await wait(300);
const createTactic = [...doc.querySelectorAll('button')].find((b) =>
  (b.textContent ?? '').includes('Nouvelle tactique'),
);
if (createTactic) {
  createTactic.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(600);
  const text = doc.getElementById('root')?.textContent ?? '';
  check('la création d’une tactique ouvre l’éditeur', text.includes('Configuration rapide') || text.includes('Étape 1'));
  check('le terrain vectoriel est rendu', !!doc.querySelector('svg'));
} else {
  check('la création d’une tactique ouvre l’éditeur', false, 'bouton introuvable');
}

check('aucune erreur d’exécution', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(
  failed === 0
    ? '\n   Le fichier autonome fonctionne.\n'
    : `\n   ${failed} problème(s).\n`,
);
process.exit(failed === 0 ? 0 : 1);
