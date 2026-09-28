import { writeFileSync } from 'node:fs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { applyFormat, applyPitch, createDemoExercise, createTactic, createExercise, setGoalConfig } from '../src/domain/doc';
import { docToSvg } from '../src/export/svg';


const demo = createDemoExercise();
writeFileSync('/tmp/p1-demo-step1.svg', docToSvg(demo, { stepIndex: 0, title: demo.name, subtitle: 'Étape 1 — mise en place' }));
writeFileSync('/tmp/p2-demo-step4.svg', docToSvg(demo, { stepIndex: 4, title: demo.name, subtitle: 'Étape 5 — course et finition' }));

const tactic = createTactic('4-3-3 contre 4-4-2');
writeFileSync('/tmp/p3-tactic.svg', docToSvg(tactic, { stepIndex: 0, title: tactic.name, subtitle: 'Terrain complet · 11 contre 11' }));

let reduced = createExercise('Jeu réduit 4 contre 4');
reduced = applyFormat(reduced, '4v4');
writeFileSync('/tmp/p4-reduced.svg', docToSvg(reduced, { stepIndex: 0, title: reduced.name, subtitle: 'Demi-terrain · 2 petits buts' }));

const full = setGoalConfig(createTactic('Sortie de balle'), 'twoLarge');
const vertical = { ...full, pitch: { ...full.pitch, orientation: 'vertical' as const } };
writeFileSync('/tmp/p5-vertical.svg', docToSvg(vertical, { stepIndex: 0, title: 'Terrain vertical — 11v11', subtitle: 'Coordonnées recalculées' }));

const lastThird = applyPitch(createExercise('Dernier tiers — 3 contre 2'), 'finalThird', 'horizontal');
writeFileSync('/tmp/p6-finalthird.svg', docToSvg(lastThird, { stepIndex: 0, title: lastThird.name, subtitle: 'Dernier tiers · 3 contre 2' }));
// Aperçus PNG (même pipeline que l'export image de l'application)
mkdirSync('preview', { recursive: true });
const files = [
  'p1-demo-step1',
  'p2-demo-step4',
  'p3-tactic',
  'p4-reduced',
  'p5-vertical',
  'p6-finalthird',
];
for (const name of files) {
  const svg = readFileSync(`/tmp/${name}.svg`, 'utf8');
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1400 }, background: '#07110D' });
  writeFileSync(`preview/${name}.png`, resvg.render().asPng());
}
console.log(`${files.length} aperçus écrits dans preview/`);
