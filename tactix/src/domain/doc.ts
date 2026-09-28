import type {
  Action,
  ExerciseInfo,
  GoalConfigId,
  Orientation,
  PitchSpec,
  PitchTemplateId,
  PlayerRole,
  Point,
  SceneObject,
  Step,
  TactixDoc,
  Team,
} from './types';
import { createPitch, CUSTOM_DEFAULT, viewForTemplate } from './pitch/dimensions';
import { buildGoals, configNeedsKeeper, keeperPosition } from './goals';
import {
  applyFormation as applyFormationImpl,
  ballsOf,
  formationPositions,
  makeBall,
  makePlayer,
  nextFreeNumber,
  playersOf,
  resetStepZero,
} from './team';
import { genericFormation, formationById, withKeeper } from './formations';
import { applyActions, cloneDoc, ensureSteps, makeStep } from './steps';
import { createAction, uid } from './actions';
import { clamp } from './geometry';
import { formatById } from './formats';

// ─────────────────────────────────────────────────────────────
// Fabrique de documents : tactiques, exercices, démonstration,
// changement de terrain / buts / format sans casser l'exercice.
// ─────────────────────────────────────────────────────────────

export function emptyInfo(): ExerciseInfo {
  return {
    objective: '',
    category: null,
    subcategory: null,
    players: '',
    ageGroup: 'Seniors',
    durationMin: 15,
    intensity: 3,
    material: [],
    instructions: '',
    keyPoints: [],
    variants: '',
  };
}

function baseDoc(kind: TactixDoc['kind'], name: string, pitch: PitchSpec): TactixDoc {
  const now = new Date().toISOString();
  const step0: Step = makeStep(0);
  return {
    id: uid(kind === 'tactic' ? 'tac' : 'exo'),
    kind,
    name,
    createdAt: now,
    updatedAt: now,
    favorite: false,
    pitch,
    goalConfig: 'none',
    format: '4v4',
    formation: 'auto',
    objects: [],
    steps: [step0],
    info: emptyInfo(),
    assistantLog: [],
  };
}

// ── Création rapide ──────────────────────────────────────────

export function createTactic(name = 'Nouvelle tactique'): TactixDoc {
  const pitch = createPitch('full', 'horizontal');
  let doc = baseDoc('tactic', name, pitch);
  doc.goalConfig = 'twoLarge';
  doc.format = '11v11';
  doc.objects = [...homeTeam(11), ...awayTeam(11)];
  doc = applyPitchGoals(doc);
  doc = addBallToFirstCentral(doc);
  doc = withFormations(doc, '4-3-3', '4-4-2');
  return doc;
}

export function createExercise(name = 'Nouvel exercice'): TactixDoc {
  const pitch = createPitch('half', 'horizontal');
  let doc = baseDoc('exercise', name, pitch);
  doc.goalConfig = 'twoSmall';
  doc.format = '4v4';
  doc.objects = [...homeTeam(4), ...awayTeam(4)];
  doc.info = { ...doc.info, category: 'Technique', subcategory: 'Passe' };
  doc = applyPitchGoals(doc);
  doc = addBallToFirstCentral(doc);
  doc = withFormations(doc, 'auto', 'auto');
  return doc;
}

// ── Équipes ──────────────────────────────────────────────────

// Numérotation par équipe (1 → 11), comme sur un terrain : les deux
// équipes utilisent la même plage, c'est la couleur qui les distingue.
function homeTeam(n: number): SceneObject[] {
  return Array.from({ length: n }, (_, i) => makePlayer('home', i + 1, 0, 0, { role: 'MC' }));
}

function awayTeam(n: number): SceneObject[] {
  return Array.from({ length: n }, (_, i) => makePlayer('away', i + 1, 0, 0, { role: 'DC' }));
}

export function withFormations(doc: TactixDoc, home: string, away: string): TactixDoc {
  let next = doc;
  next = applyFormationForTeam(next, home, 'home');
  next = applyFormationForTeam(next, away, 'away');
  return next;
}

function applyFormationForTeam(doc: TactixDoc, id: string, team: Team): TactixDoc {
  return applyFormationImpl(doc, id, team);
}

export function addBallToFirstCentral(doc: TactixDoc): TactixDoc {
  if (ballsOf(doc).length > 0) return doc;
  const players = playersOf(doc, 'home');
  const owner = players[Math.floor(players.length / 2)];
  if (!owner) return doc;
  const ball = makeBall(owner.x, owner.y, owner.id);
  const next = { ...doc, objects: [...doc.objects, ball] };
  return resetStepZero(next);
}

// ── Buts ─────────────────────────────────────────────────────

export function applyPitchGoals(doc: TactixDoc): TactixDoc {
  const withoutGoals = doc.objects.filter((o) => o.kind !== 'goal');
  const goals = buildGoals(doc.goalConfig, doc.pitch);
  const objects = [...withoutGoals, ...goals];
  let next: TactixDoc = { ...doc, objects };
  // Gardien automatique demandé par la configuration.
  const keepers = objects.filter((o) => o.kind === 'player' && o.keeper);
  if (configNeedsKeeper(doc.goalConfig) && keepers.length === 0) {
    const pos = keeperPosition(doc.pitch);
    const gk = makePlayer('away', 1, pos.x, pos.y, {
      role: 'GK',
      keeper: true,
      showName: false,
    });
    next = { ...next, objects: [...next.objects, gk] };
  }
  return next;
}

// ── Transformation de terrain ────────────────────────────────

function mapDocPoints(doc: TactixDoc, fn: (p: Point) => Point): TactixDoc {
  const next = cloneDoc(doc);
  next.objects = next.objects.map((o) => {
    const p = fn({ x: o.x, y: o.y });
    return { ...o, x: p.x, y: p.y };
  });
  next.steps = next.steps.map((step) => ({
    ...step,
    positions: Object.fromEntries(
      Object.entries(step.positions).map(([k, v]) => [k, fn(v)]),
    ),
    actions: step.actions.map((a) => ({ ...a, points: a.points.map(fn) })),
  }));
  return next;
}

/**
 * Change le modèle de terrain et/ou l'orientation.
 * Les objets sont re-projetés proportionnellement : rien n'est perdu,
 * l'exercice reste cohérent (règle : « changer sans casser »).
 */
export function applyPitch(
  doc: TactixDoc,
  template: PitchTemplateId,
  orientation: Orientation,
  custom: { length: number; width: number } = CUSTOM_DEFAULT,
): TactixDoc {
  const oldPitch = doc.pitch;
  const newPitch = createPitch(template, orientation, custom);
  const sameView =
    oldPitch.view.w === newPitch.view.w &&
    oldPitch.view.h === newPitch.view.h &&
    oldPitch.view.x === newPitch.view.x &&
    oldPitch.view.y === newPitch.view.y;

  let next: TactixDoc = { ...doc, pitch: newPitch };
  if (!sameView) {
    const sx = newPitch.view.w / Math.max(1e-6, oldPitch.view.w);
    const sy = newPitch.view.h / Math.max(1e-6, oldPitch.view.h);
    next = mapDocPoints(next, (p) => ({
      x: clamp(newPitch.view.x + (p.x - oldPitch.view.x) * sx, newPitch.view.x, newPitch.view.x + newPitch.view.w),
      y: clamp(newPitch.view.y + (p.y - oldPitch.view.y) * sy, newPitch.view.y, newPitch.view.y + newPitch.view.h),
    }));
  }
  return applyPitchGoals(next);
}

export function setOrientation(doc: TactixDoc, orientation: Orientation): TactixDoc {
  return applyPitch(doc, doc.pitch.template, orientation, {
    length: doc.pitch.length,
    width: doc.pitch.width,
  });
}

export function setGoalConfig(doc: TactixDoc, config: GoalConfigId): TactixDoc {
  let next: TactixDoc = { ...doc, goalConfig: config };
  if (!configNeedsKeeper(config)) {
    // On retire le gardien automatique s'il n'est plus demandé.
    const autoKeepers = next.objects.filter((o) => o.kind === 'player' && o.keeper);
    for (const gk of autoKeepers) {
      next = {
        ...next,
        objects: next.objects.filter((o) => o.id !== gk.id),
      };
    }
  }
  return applyPitchGoals(next);
}

/**
 * Inverse le sens de jeu : tout est reflété dans l'axe du terrain
 * (joueurs, buts, matériel, trajectoires et étapes).
 */
export function reverseDirection(doc: TactixDoc): TactixDoc {
  const v = doc.pitch.view;
  const mirror = (p: Point): Point => ({ x: v.x + v.w - (p.x - v.x), y: p.y });
  const next = mapDocPoints(doc, mirror);
  // Les buts pivots : la bouche doit rester tournée vers le terrain.
  next.objects = next.objects.map((o) =>
    o.kind === 'goal'
      ? { ...o, rotation: ((180 - (o.rotation ?? 0)) % 360 + 360) % 360 }
      : o,
  );
  return next;
}

// ── Format de jeu ────────────────────────────────────────────

export function teamHasKeeper(doc: TactixDoc, team: Team): boolean {
  return playersOf(doc, team).some((p) => p.role === 'GK' || p.keeper);
}

/** Ajoute des joueurs intelligemment : les places libres d'une formation. */
export function addPlayersSmart(doc: TactixDoc, team: Team, count: number): TactixDoc {
  if (count <= 0) return doc;
  let next = doc;
  const existing = playersOf(next, team);
  const total = existing.length + count;
  const hasGK = teamHasKeeper(next, team);
  let formation = genericFormation(Math.max(1, hasGK ? total - 1 : total));
  if (hasGK) formation = withKeeper(formation);
  const slots = formationPositions(next.pitch, formation, team, total);

  const placed: Point[] = existing.map((p) => ({ x: p.x, y: p.y }));
  const newPlayers: SceneObject[] = [];
  const usedSlots = new Set<number>();
  for (let i = 0; i < count; i++) {
    let bestSlot = -1;
    let bestScore = -1;
    slots.forEach((slot, idx) => {
      if (usedSlots.has(idx)) return;
      const nearest = placed.length
        ? Math.min(...placed.map((p) => Math.hypot(p.x - slot.x, p.y - slot.y)))
        : 999;
      if (nearest > bestScore) {
        bestScore = nearest;
        bestSlot = idx;
      }
    });
    if (bestSlot < 0) bestSlot = i % Math.max(1, slots.length);
    usedSlots.add(bestSlot);
    const slot = slots[bestSlot];
    const player = makePlayer(team, nextFreeNumber(next, team), slot.x, slot.y, {
      role: formation.slots[bestSlot]?.role ?? 'MC',
    });
    newPlayers.push(player);
    placed.push({ x: slot.x, y: slot.y });
    next = { ...next, objects: [...next.objects, player] };
  }
  return resetStepZero(next);
}

/**
 * Applique un format de jeu (1v1 → 11v11) sans casser l'exercice :
 * - les joueurs en trop sont retirés (leurs trajectoires aussi) ;
 * - les joueurs manquants sont placés sur les postes libres ;
 * - les gardiens sont conservés.
 */
export function applyFormat(doc: TactixDoc, formatId: string): TactixDoc {
  const fmt = formatById(formatId);
  if (!fmt) return doc;
  let next: TactixDoc = { ...doc, format: formatId };

  // Les nombres du format comptent tous les joueurs sur le terrain
  // (gardiens compris) : 11v11 = 11 joueurs par équipe, rien n'est perdu.
  for (const team of ['home', 'away'] as Team[]) {
    next = syncTeamCount(next, team, team === 'home' ? fmt.home : fmt.away);
  }
  // La configuration « grand but + gardien » garantit un gardien.
  if (configNeedsKeeper(next.goalConfig) && !teamHasKeeper(next, 'away')) {
    next = applyPitchGoals(next);
  }
  // Si l'équipe a désormais un gardien et assez de joueurs, la formation
  // automatique intègre le poste de gardien.
  return next;
}

export function syncTeamCount(doc: TactixDoc, team: Team, target: number): TactixDoc {
  let next = doc;
  const players = playersOf(next, team);
  if (players.length > target) {
    // Les joueurs de champ sont conservés en priorité, le gardien en dernier.
    const ordered = [...players].sort((a, b) => {
      const ak = a.role === 'GK' || a.keeper ? 1 : 0;
      const bk = b.role === 'GK' || b.keeper ? 1 : 0;
      if (ak !== bk) return ak - bk;
      return (a.number ?? 0) - (b.number ?? 0);
    });
    const remove = ordered.slice(target);
    for (const p of remove) {
      next = {
        ...next,
        objects: next.objects.filter((o) => o.id !== p.id),
        steps: next.steps.map((s) => ({
          ...s,
          actions: s.actions.filter((a) => a.ownerId !== p.id),
          positions: Object.fromEntries(
            Object.entries(s.positions).filter(([k]) => k !== p.id),
          ),
          ballOwners: Object.fromEntries(
            Object.entries(s.ballOwners).map(([k, v]) => [k, v === p.id ? null : v]),
          ),
        })),
      };
    }
  } else if (players.length < target) {
    next = addPlayersSmart(next, team, target - players.length);
  }
  return next;
}

// ── Exercice de démonstration : « Finition — 3e homme » ──────

export function createDemoExercise(): TactixDoc {
  let doc = createExercise('Finition — 3e homme');
  doc.pitch = createPitch('half', 'horizontal');
  doc.goalConfig = 'oneLargeKeeper';
  doc.format = '3v2';
  doc.info = {
    ...emptyInfo(),
    objective:
      'Fixer, remiser et finir par le 3e homme : enchaîner passe, remise et finition rapide dans le dernier tiers.',
    category: 'Tactique',
    subcategory: 'Transition offensive',
    players: '3 attaquants · 2 défenseurs · 1 gardien',
    ageGroup: 'Seniors',
    durationMin: 15,
    intensity: 4,
    material: ['Grand but', 'Gardien', 'Ballons', 'Plots', 'Coupelles'],
    instructions:
      "3 attaquants contre 2 défenseurs + gardien. Départ du ballon chez le joueur 4. Rechercher la remise puis la fixation pour finir dans la profondeur. Rejouer immédiatement après chaque finition.",
    keyPoints: [
      'Qualité de la passe : appui solide, pied ouvert',
      'Remise en une touche pour accélérer le jeu',
      'Course de 11 déclenchée dès la remise de 8',
      'Finition en deux touches maximum',
    ],
    variants:
      'Ajouter un défenseur (3v3) · Limiter à 2 touches · Finition obligatoire en une touche',
  };

  // Joueurs
  const p4 = makePlayer('home', 4, 68, 40, { role: 'MC', showName: true, name: 'Relayeur' });
  const p8 = makePlayer('home', 8, 78, 53, { role: 'MOC', showName: true, name: 'Remiseur' });
  const p11 = makePlayer('home', 11, 86, 19, { role: 'AC', showName: true, name: 'Finisseur' });
  const d3 = makePlayer('away', 3, 84, 42, { role: 'DC' });
  const d5 = makePlayer('away', 5, 90, 27, { role: 'DC' });
  const gk = makePlayer('away', 1, 100, 34, { role: 'GK', keeper: true });

  const ball = makeBall(p4.x, p4.y, p4.id);
  doc.objects = [p4, p8, p11, d3, d5, gk, ball];

  doc = applyPitchGoals(doc);

  // Mise en place (étape 0)
  doc = ensureSteps(doc, 1);
  doc = resetStepZero(doc);

  const deep: Point = { x: 95, y: 26 };
  const goalShot: Point = { x: 103.5, y: 33 };
  const press4: Point = { x: 73, y: 41 };
  const track11: Point = { x: 92, y: 27 };
  const gkStep: Point = { x: 98, y: 32 };

  const actions: Action[] = [
    createAction('pass', p4.id, [{ x: p4.x, y: p4.y }, { x: p8.x, y: p8.y }], {
      stepIndex: 0,
      receiverId: p8.id,
      ballId: ball.id,
      label: '4 → 8',
    }),
    createAction('pass', p8.id, [{ x: p8.x, y: p8.y }, { x: p4.x, y: p4.y }], {
      stepIndex: 1,
      receiverId: p4.id,
      ballId: ball.id,
      label: '8 → 4',
      curved: true,
    }),
    createAction('move', d3.id, [{ x: d3.x, y: d3.y }, press4], { stepIndex: 1 }),
    createAction('pass', p4.id, [{ x: p4.x, y: p4.y }, { x: p11.x, y: p11.y }], {
      stepIndex: 2,
      receiverId: p11.id,
      ballId: ball.id,
      label: '4 → 11',
    }),
    createAction('run', p11.id, [{ x: p11.x, y: p11.y }, deep], { stepIndex: 3 }),
    createAction('move', d5.id, [{ x: d5.x, y: d5.y }, track11], { stepIndex: 3 }),
    createAction('shot', p11.id, [deep, goalShot], {
      stepIndex: 4,
      ballId: ball.id,
      receiverId: null,
    }),
    createAction('move', gk.id, [{ x: gk.x, y: gk.y }, gkStep], { stepIndex: 4 }),
  ];

  doc = applyActions(doc, actions).doc;

  const titles = [
    '1. Mise en place — 4 porte le ballon',
    '2. Passe 4 → 8',
    '3. Remise de 8 vers 4',
    '4. Renversement 4 → 11',
    '5. Course de 11 dans la profondeur',
    '6. Finition de 11',
    '7. But',
  ];
  doc.steps = doc.steps.map((s, i) => ({ ...s, title: titles[i] ?? `Étape ${i + 1}` }));
  doc.format = '3v2';
  return doc;
}

// ── Divers ───────────────────────────────────────────────────

export function setInfo(doc: TactixDoc, patch: Partial<ExerciseInfo>): TactixDoc {
  return { ...doc, info: { ...doc.info, ...patch } };
}

export function countPlayersOf(doc: TactixDoc): { home: number; away: number; neutral: number } {
  const home = playersOf(doc, 'home').length;
  const away = playersOf(doc, 'away').length;
  const neutral = playersOf(doc, 'neutral').length;
  return { home, away, neutral };
}

export function formatCounts(doc: TactixDoc): string {
  const c = countPlayersOf(doc);
  return `${c.home}v${c.away}${c.neutral ? ` +${c.neutral}` : ''}`;
}

export function totalDuration(doc: TactixDoc): number {
  return doc.info.durationMin;
}

export function suggestedPitchFor(formatId: string): PitchTemplateId {
  return formatById(formatId)?.recommendedPitch ?? 'half';
}

export function pitchLabel(template: PitchTemplateId, orientation: Orientation, pitch: PitchSpec): string {
  const t = viewForTemplate(template, { length: pitch.length, width: pitch.width });
  const w = Math.round(t.view.w);
  const h = Math.round(t.view.h);
  return `${w} × ${h} m · ${orientation === 'horizontal' ? 'horizontal' : 'vertical'}`;
}

export function roleLabel(role?: PlayerRole): string {
  if (!role) return '';
  return role;
}

export function formationLabelOf(doc: TactixDoc): string {
  const f = formationById(doc.formation);
  return f ? f.label : 'Auto';
}
