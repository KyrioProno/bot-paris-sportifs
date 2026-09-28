/**
 * TACTIX — autotest du moteur (domaine, intelligence des trajectoires,
 * terrains, formats, animation). Exécution : npx tsx scripts/selftest.ts
 */
import {
  createDemoExercise,
  createExercise,
  createTactic,
  applyFormat,
  applyPitch,
  reverseDirection,
  setGoalConfig,
  syncTeamCount,
} from '../src/domain/doc';
import {
  applyActions,
  ballOwnerAt,
  countLinkedActions,
  deleteObject,
  duplicateStep,
  insertStepAfter,
  moveStep,
  removeStep,
  stepPosition,
} from '../src/domain/steps';
import { createAction } from '../src/domain/actions';
import { computeFrame, stepDuration } from '../src/domain/animation';
import { buildMarkings } from '../src/domain/pitch/markings';
import { PITCH_TEMPLATES } from '../src/domain/pitch/dimensions';
import { screenToWorld, worldToScreen, screenBox } from '../src/domain/pitch/orientation';
import { GAME_FORMATS } from '../src/domain/formats';
import { playersOf, ballsOf } from '../src/domain/team';
import { buildScene } from '../src/render/scene';
import { docToSvg } from '../src/export/svg';
import { assistantCreate, assistantModify, parseIntent } from '../src/domain/assistant';
import { buildGoals, GOAL_CONFIGS } from '../src/domain/goals';
import { EQUIPMENT } from '../src/domain/equipment';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function approx(a: number, b: number, tol = 0.001) {
  return Math.abs(a - b) <= tol;
}

// ── 1. Document de démonstration ─────────────────────────────
const demo = createDemoExercise();
check('démo : 6 étapes minimum', demo.steps.length >= 6, `${demo.steps.length} étapes`);
const ball = ballsOf(demo)[0];
check('démo : un ballon présent', !!ball);
const p4 = demo.objects.find((o) => o.kind === 'player' && o.number === 4)!;
const p8 = demo.objects.find((o) => o.kind === 'player' && o.number === 8)!;
const p11 = demo.objects.find((o) => o.kind === 'player' && o.number === 11)!;
check('démo : joueurs 4, 8, 11 présents', !!p4 && !!p8 && !!p11);
check('démo : étape 1 — 4 possède le ballon', ballOwnerAt(demo, 0, ball.id) === p4.id);
check('démo : étape 2 — 8 reçoit le ballon', ballOwnerAt(demo, 1, ball.id) === p8.id);
check('démo : étape 3 — retour à 4', ballOwnerAt(demo, 2, ball.id) === p4.id);
check('démo : étape 4 — 11 reçoit le ballon', ballOwnerAt(demo, 3, ball.id) === p11.id);

// Position finale d'une action = position initiale de l'étape suivante
const pass1 = demo.steps[0].actions.find((a) => a.type === 'pass')!;
const endOfPass = pass1.points[pass1.points.length - 1];
const posAtStep1 = stepPosition(demo, 1, p4.id);
check(
  'règle position finale = position initiale suivante',
  approx(posAtStep1.x, endOfPass.x) && approx(posAtStep1.y, endOfPass.y),
  `attendu ${endOfPass.x.toFixed(1)},${endOfPass.y.toFixed(1)} obtenu ${posAtStep1.x.toFixed(1)},${posAtStep1.y.toFixed(1)}`,
);

// Le ballon suit réellement la trajectoire de la passe
const frameMid = computeFrame(demo, 0, 0.75, 1);
const ballMid = frameMid.balls[ball.id];
check('animation : le ballon est en mouvement pendant la passe', !!ballMid && ballMid.flight !== null);
const frameStart = computeFrame(demo, 0, 0, 1);
const ballStart = frameStart.balls[ball.id];
check(
  'animation : le ballon démarre sur son porteur',
  approx(ballStart.pos.x, p4.x, 0.6) && approx(ballStart.pos.y, p4.y, 0.6),
);
const frameEnd = computeFrame(demo, 0.5 + 0.5, 1, 1);
void frameEnd;
const frameAtEnd = computeFrame(demo, 0, 1, 1);
const ballEnd = frameAtEnd.balls[ball.id];
check(
  'animation : le ballon arrive sur le receveur (8)',
  approx(ballEnd.pos.x, p8.x, 0.8) && approx(ballEnd.pos.y, p8.y, 0.8),
  `${ballEnd.pos.x.toFixed(1)},${ballEnd.pos.y.toFixed(1)} vs ${p8.x},${p8.y}`,
);

// ── 2. Trajectoire → étape suivante (création) ───────────────
{
  const doc = createExercise('Test course');
  const player = playersOf(doc, 'home')[0];
  const target = { x: doc.pitch.view.x + doc.pitch.view.w * 0.8, y: doc.pitch.width * 0.4 };
  const action = createAction('run', player.id, [{ x: player.x, y: player.y }, target], { stepIndex: 0 });
  const result = applyActions(doc, [action]).doc;
  check('course : une étape est créée automatiquement', result.steps.length === 2, `${result.steps.length}`);
  const p = stepPosition(result, 1, player.id);
  check(
    'course : le joueur est automatiquement placé au point final',
    approx(p.x, target.x) && approx(p.y, target.y),
  );
  check('course : l’étape 0 contient bien l’action', result.steps[0].actions.length === 1);

  // Modification de la trajectoire → recalcul
  const newTarget = { x: target.x - 5, y: target.y + 2 };
  const moved = applyActions(
    result,
    [createAction('run', player.id, [{ x: player.x, y: player.y }, newTarget], { stepIndex: 0 })],
  ).doc;
  const p2 = stepPosition(moved, 1, player.id);
  check('course : la nouvelle trajectoire met à jour l’étape suivante', approx(p2.x, newTarget.x));
}

// ── 3. Passe intelligente (possession + destinataire) ────────
{
  const doc = createExercise('Test passe');
  const homes = playersOf(doc, 'home');
  const ballDoc = ballsOf(doc)[0];
  const ownerNow = ballOwnerAt(doc, 0, ballDoc.id);
  const passer = homes.find((h) => h.id === ownerNow)!;
  const receiver = homes.find((h) => h.id !== passer.id)!;
  const pass = createAction(
    'pass',
    passer.id,
    [{ x: passer.x, y: passer.y }, { x: receiver.x, y: receiver.y }],
    { stepIndex: 0, ballId: ballDoc.id, receiverId: receiver.id },
  );
  const result = applyActions(doc, [pass]).doc;
  check('passe : le ballon change de propriétaire à l’étape suivante', ballOwnerAt(result, 1, ballDoc.id) === receiver.id);
  check('passe : le ballon reste au passeur au début de l’étape', ballOwnerAt(result, 0, ballDoc.id) === passer.id);
}

// ── 3bis. Étapes : insertion et duplication ──────────────────
{
  const doc = createDemoExercise();
  const lastIndex = doc.steps.length - 1;
  const appended = insertStepAfter(doc, lastIndex);
  check('insertion : une étape est ajoutée', appended.steps.length === doc.steps.length + 1);
  // L'étape ajoutée démarre sur l'état de fin de la précédente
  const shooter = doc.objects.find((o) => o.kind === 'player' && o.number === 11)!;
  const shot = doc.steps[lastIndex - 1].actions.find((a) => a.type === 'shot')!;
  const shotEnd = shot.points[shot.points.length - 1];
  const posInNewStep = stepPosition(appended, appended.steps.length - 1, shooter.id);
  check(
    'insertion : l’étape démarre sur la position finale de la précédente',
    approx(posInNewStep.x, shotEnd.x, 0.01) && approx(posInNewStep.y, shotEnd.y, 0.01),
    `${posInNewStep.x.toFixed(1)},${posInNewStep.y.toFixed(1)} vs ${shotEnd.x.toFixed(1)},${shotEnd.y.toFixed(1)}`,
  );

  const duplicated = duplicateStep(doc, 1);
  check('duplication : une étape est ajoutée', duplicated.steps.length === doc.steps.length + 1);
  check('duplication : la copie conserve les objets', duplicated.objects.length === doc.objects.length);
  check('duplication : copie figée sur l’état de fin', duplicated.steps[2].actions.length === 0);
  const posInCopy = stepPosition(duplicated, 2, p8.id);
  const posInSource = stepPosition(doc, 2, p8.id);
  check(
    'duplication : la copie démarre au même endroit que la source',
    approx(posInCopy.x, posInSource.x, 0.01) && approx(posInCopy.y, posInSource.y, 0.01),
  );
  const removed = removeStep(doc, 2);
  check('suppression : une étape est retirée', removed.steps.length === doc.steps.length - 1);
  const moved = moveStep(doc, 0, 2);
  check('réorganisation : les étapes changent d’ordre', moved.steps[2].id === doc.steps[0].id);
}

// ── 4. Formats de jeu (1v1 → 11v11) ──────────────────────────
{
  check('18 formats disponibles', GAME_FORMATS.length === 18, `${GAME_FORMATS.length}`);
  check(
    'le 11v11 est présent',
    GAME_FORMATS.some((f) => f.id === '11v11'),
  );
  for (const format of GAME_FORMATS) {
    const doc = createTactic(`Format ${format.id}`);
    const applied = applyFormat(doc, format.id);
    const homes = playersOf(applied, 'home').length;
    const aways = playersOf(applied, 'away').length;
    check(
      `format ${format.id} appliqué`,
      homes === format.home && aways === format.away,
      `obtenu ${homes}v${aways}`,
    );
  }
}

// ── 5. Terrains + orientations ───────────────────────────────
{
  for (const template of PITCH_TEMPLATES) {
    for (const orientation of ['horizontal', 'vertical'] as const) {
      const doc = applyPitch(createExercise('T'), template.id, orientation);
      const markings = buildMarkings(doc.pitch);
      check(
        `marquages ${template.id}/${orientation}`,
        markings.lines.length > 2 && doc.pitch.orientation === orientation,
      );
      const box = screenBox(doc.pitch);
      check(`viewBox ${template.id}/${orientation} valide`, box.w > 0 && box.h > 0);
      // aller-retour de conversion monde ↔ écran
      const p = { x: doc.pitch.view.x + 10, y: doc.pitch.view.y + 8 };
      const back = screenToWorld(worldToScreen(p, doc.pitch), doc.pitch);
      check(
        `conversion de repère ${template.id}/${orientation}`,
        approx(back.x, p.x, 1e-6) && approx(back.y, p.y, 1e-6),
      );
      // rendu complet sans erreur, dans les deux orientations
      const frame = computeFrame(doc, 0, 0, 1);
      const scene = buildScene({ doc, stepIndex: 0, frame, progress: {} });
      check(`scène ${template.id}/${orientation} construite`, scene.world.length > 5);
      const svg = docToSvg(doc, { stepIndex: 0 });
      check(`export SVG ${template.id}/${orientation}`, svg.includes('<svg') && svg.includes('</svg>'));
    }
  }
}

// ── 6. Buts + gardiens ───────────────────────────────────────
{
  for (const config of GOAL_CONFIGS) {
    const doc = setGoalConfig(createExercise('B'), config.id);
    const goals = doc.objects.filter((o) => o.kind === 'goal').length;
    check(`buts « ${config.id} » présents`, goals > 0 || config.id === 'none');
    if (config.id === 'oneLargeKeeper') {
      check('gardien automatique ajouté', doc.objects.some((o) => o.keeper));
    }
  }
}

// ── 7. Matériel complet ──────────────────────────────────────
{
  check('bibliothèque de matériel complète', EQUIPMENT.length >= 20, `${EQUIPMENT.length} éléments`);
  const doc = createExercise('M');
  const objects = EQUIPMENT.map((item, i) => ({
    id: `eq_${i}`,
    kind: 'equipment' as const,
    itemType: item.id,
    x: 10 + (i % 6) * 5,
    y: 8 + Math.floor(i / 6) * 8,
    rotation: (i % 4) * 15,
    scale: 1,
  }));
  const withEquip = { ...doc, objects: [...doc.objects, ...objects] };
  const frame = computeFrame(withEquip, 0, 0, 1);
  const scene = buildScene({ doc: withEquip, stepIndex: 0, frame, progress: {} });
  check('tout le matériel se dessine', scene.world.length > 40, `${scene.world.length} formes`);
}

// ── 8. Suppression avec trajectoires liées ───────────────────
{
  const doc = createDemoExercise();
  const player = doc.objects.find((o) => o.kind === 'player' && o.number === 11)!;
  const linked = countLinkedActions(doc, player.id);
  check('trajectoires liées détectées', linked >= 2, `${linked}`);
  const cleaned = deleteObject(doc, player.id, true);
  check('joueur supprimé', !cleaned.objects.some((o) => o.id === player.id));
  check(
    'ses trajectoires sont supprimées',
    cleaned.steps.every((s) => s.actions.every((a) => a.ownerId !== player.id)),
  );
  const kept = deleteObject(doc, player.id, false);
  check(
    'option « garder les trajectoires » respectée',
    kept.steps.some((s) => s.actions.some((a) => a.ownerId === player.id)),
  );
}

// ── 9. Inversion de sens ─────────────────────────────────────
{
  const doc = createDemoExercise();
  const reversed = reverseDirection(doc);
  const goalBefore = doc.objects.find((o) => o.kind === 'goal')!;
  const goalAfter = reversed.objects.find((o) => o.id === goalBefore.id)!;
  check(
    'le but est reflété',
    approx(goalAfter.x, doc.pitch.view.x + doc.pitch.view.w - (goalBefore.x - doc.pitch.view.x), 0.01),
  );
  check('même nombre d’objets après inversion', reversed.objects.length === doc.objects.length);
}

// ── 10. Assistant intelligent ────────────────────────────────
{
  const intent = parseIntent(
    'Crée-moi un exercice de sortie de balle en 4 contre 3 avec un gardien, deux petits buts sur les côtés et une transition rapide.',
  );
  check('assistant : format compris', intent.format.home === 4 && intent.format.away === 3);
  check('assistant : terrain compris', intent.pitch === 'half');
  check('assistant : buts compris', intent.goals === 'twoSmallSides');
  check('assistant : thème compris', intent.theme === 'buildup');

  const { doc } = assistantCreate(
    'Crée-moi un exercice de sortie de balle en 4 contre 3 avec un gardien, deux petits buts sur les côtés et une transition rapide.',
  );
  check('assistant : joueurs générés', playersOf(doc, 'home').length === 4 && playersOf(doc, 'away').length === 3);
  check('assistant : étapes générées', doc.steps.length >= 3, `${doc.steps.length}`);
  check('assistant : trajectoires générées', doc.steps.some((s) => s.actions.length > 0));

  const modified = assistantModify(doc, 'Ajoute un défenseur');
  check('assistant : ajout de joueur', playersOf(modified.doc, 'away').length === 4);
  const fmtChange = assistantModify(modified.doc, 'Passe en 5 contre 4');
  check(
    'assistant : changement de format',
    playersOf(fmtChange.doc, 'home').length === 5 && playersOf(fmtChange.doc, 'away').length === 4,
    `${playersOf(fmtChange.doc, 'home').length}v${playersOf(fmtChange.doc, 'away').length}`,
  );
  const reversed = assistantModify(fmtChange.doc, 'Inverse le sens de l’exercice');
  check('assistant : inversion', reversed.replies.some((r) => r.includes('inversé')));
  const vertical = assistantModify(reversed.doc, 'Mets le terrain en vertical');
  check('assistant : orientation verticale', vertical.doc.pitch.orientation === 'vertical');
}

// ── 11. Animation fluide + durées ────────────────────────────
{
  const doc = createDemoExercise();
  const duration = stepDuration(doc.steps[0], 1);
  check('durée d’étape calculée', duration > 200);
  let monotone = true;
  let prev = -1;
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const frame = computeFrame(doc, 0, t, 1);
    const progress = Object.values(frame.progress)[0] ?? 0;
    if (progress < prev - 1e-9) monotone = false;
    prev = progress;
  }
  check('progression d’animation monotone', monotone);
  const localP4 = doc.objects.find((o) => o.kind === 'player' && o.number === 4)!;
  const last = computeFrame(doc, 0, 1, 1);
  const p8Pos = last.positions[localP4.id];
  const p8Next = stepPosition(doc, 1, localP4.id);
  check(
    'fin d’animation = début de l’étape suivante',
    approx(p8Pos.x, p8Next.x, 0.01) && approx(p8Pos.y, p8Next.y, 0.01),
  );
}

// ── 12. Clonage de sécurité (libération de propriété) ────────
{
  const doc = createDemoExercise();
  const team = syncTeamCount(doc, 'away', 5);
  check('équipe ajustée à 5 joueurs', playersOf(team, 'away').length === 5, `${playersOf(team, 'away').length}`);
  const down = syncTeamCount(team, 'away', 2);
  check('équipe réduite à 2 joueurs', playersOf(down, 'away').length === 2);
  void buildGoals;
}

// ── Résumé ───────────────────────────────────────────────────
console.log(`\nTACTIX — autotest du moteur`);
console.log(`   ✓ ${passed} vérifications réussies`);
if (failed > 0) {
  console.log(`   ✗ ${failed} échecs :`);
  failures.forEach((f) => console.log(`      - ${f}`));
  process.exit(1);
}
console.log('   Tout est vert.\n');
