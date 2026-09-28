import type { Action, Point, SceneObject, Step, TactixDoc } from './types';
import { actionDescriptor, actionEnd, actionLength, uid } from './actions';
import { clamp } from './geometry';

// ─────────────────────────────────────────────────────────────
// ÉTAPES — le cœur intelligent de TACTIX.
//
// Règle fondamentale :
//   position finale d'une étape = position initiale de l'étape suivante.
//
// Une trajectoire ne se contente donc pas d'être dessinée : elle
// pilote la position du joueur (et la possession du ballon) dans
// l'étape suivante, automatiquement.
// ─────────────────────────────────────────────────────────────

export function makeStep(index: number, holdMs = 550, transitionMs = 1100): Step {
  return {
    id: uid('s'),
    title: `Étape ${index + 1}`,
    note: '',
    holdMs,
    transitionMs,
    positions: {},
    ballOwners: {},
    actions: [],
    derived: [],
    derivedOwners: [],
  };
}

// ── Lecture de l'état ────────────────────────────────────────

/** Position effective d'un objet au début d'une étape (héritage en cascade). */
export function stepPosition(doc: TactixDoc, stepIndex: number, objectId: string): Point {
  const idx = Math.max(0, Math.min(stepIndex, doc.steps.length - 1));
  for (let k = idx; k >= 0; k--) {
    const p = doc.steps[k]?.positions?.[objectId];
    if (p) return p;
  }
  const obj = doc.objects.find((o) => o.id === objectId);
  if (obj) return { x: obj.x, y: obj.y };
  return { x: 0, y: 0 };
}

/** Propriétaire du ballon au début d'une étape. */
export function ballOwnerAt(
  doc: TactixDoc,
  stepIndex: number,
  ballId: string,
): string | null {
  const idx = Math.max(0, Math.min(stepIndex, doc.steps.length - 1));
  for (let k = idx; k >= 0; k--) {
    const step = doc.steps[k];
    if (step && step.ballOwners && ballId in step.ballOwners) {
      return step.ballOwners[ballId];
    }
  }
  const ball = doc.objects.find((o) => o.id === ballId);
  return ball?.ownerId ?? null;
}

export function ownerPlayer(doc: TactixDoc, ballId: string, stepIndex: number): SceneObject | undefined {
  const owner = ballOwnerAt(doc, stepIndex, ballId);
  if (!owner) return undefined;
  return doc.objects.find((o) => o.id === owner);
}

/** Toutes les positions de départ d'une étape (objets existants). */
export function stepStartPositions(doc: TactixDoc, stepIndex: number): Record<string, Point> {
  const out: Record<string, Point> = {};
  for (const o of doc.objects) out[o.id] = stepPosition(doc, stepIndex, o.id);
  return out;
}

export function stepStartOwners(doc: TactixDoc, stepIndex: number): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const o of doc.objects) {
    if (o.kind === 'ball') out[o.id] = ballOwnerAt(doc, stepIndex, o.id);
  }
  return out;
}

// ── Structure des étapes ─────────────────────────────────────

export function cloneStep(step: Step): Step {
  return {
    ...step,
    positions: { ...step.positions },
    ballOwners: { ...step.ballOwners },
    actions: step.actions.map((a) => ({ ...a, points: a.points.map((p) => ({ ...p })) })),
    derived: [...(step.derived ?? [])],
    derivedOwners: [...(step.derivedOwners ?? [])],
  };
}

export function cloneDoc(doc: TactixDoc): TactixDoc {
  return {
    ...doc,
    pitch: { ...doc.pitch, view: { ...doc.pitch.view } },
    objects: doc.objects.map((o) => ({ ...o })),
    steps: doc.steps.map(cloneStep),
    info: {
      ...doc.info,
      material: [...doc.info.material],
      keyPoints: [...doc.info.keyPoints],
    },
    assistantLog: [...doc.assistantLog],
  };
}

/** Garantit l'existence d'au moins `count` étapes. */
export function ensureSteps(doc: TactixDoc, count: number): TactixDoc {
  const steps = doc.steps.map(cloneStep);
  while (steps.length < count) steps.push(makeStep(steps.length));
  return { ...doc, steps };
}

/**
 * État à la FIN d'une étape : positions de départ + application des
 * actions de l'étape. C'est la base d'une étape insérée ou dupliquée.
 */
export function stateAfterStep(
  doc: TactixDoc,
  index: number,
): { positions: Record<string, Point>; ballOwners: Record<string, string | null> } {
  const positions = stepStartPositions(doc, index);
  const ballOwners = stepStartOwners(doc, index);
  const step = doc.steps[index];
  if (!step) return { positions, ballOwners };
  for (const a of step.actions) {
    positions[a.ownerId] = actionEnd(a);
    if (a.type === 'pass' || a.type === 'dribble' || a.type === 'shot') {
      const ballId = a.ballId ?? doc.objects.find((o) => o.kind === 'ball')?.id ?? null;
      if (ballId) {
        ballOwners[ballId] = a.type === 'pass' ? a.receiverId ?? null : null;
        if (a.type === 'pass' && a.receiverId) delete positions[ballId];
        else positions[ballId] = actionEnd(a);
      }
    }
  }
  return { positions, ballOwners };
}

/**
 * Insère une étape après `index`.
 * La nouvelle étape démarre exactement sur l'état de fin de la précédente
 * (position finale = position initiale suivante).
 */
export function insertStepAfter(doc: TactixDoc, index: number): TactixDoc {
  const working = ensureSteps(cloneDoc(doc), index + 1);
  const next = makeStep(index + 1);
  const after = stateAfterStep(working, index);
  next.positions = after.positions;
  next.ballOwners = after.ballOwners;
  working.steps.splice(index + 1, 0, next);
  return recomputeFrom(working, index);
}

/**
 * Duplique une étape : la copie reprend l'état de fin de la source (état
 * figé, sans trajectoire) pour que le coach puisse enchaîner librement.
 */
export function duplicateStep(doc: TactixDoc, index: number): TactixDoc {
  const working = cloneDoc(doc);
  const src = working.steps[index];
  if (!src) return doc;
  const after = stateAfterStep(working, index);
  const copy = cloneStep(src);
  copy.id = uid('s');
  copy.title = `${src.title || `Étape ${index + 1}`} (copie)`;
  copy.positions = { ...after.positions };
  copy.ballOwners = { ...after.ballOwners };
  copy.actions = [];
  copy.derived = [];
  copy.derivedOwners = [];
  working.steps.splice(index + 1, 0, copy);
  return recomputeFrom(working, index);
}

export function removeStep(doc: TactixDoc, index: number): TactixDoc {
  if (doc.steps.length <= 1) return doc;
  const working = cloneDoc(doc);
  working.steps.splice(index, 1);
  return recomputeFrom(working, Math.max(0, index - 1));
}

export function moveStep(doc: TactixDoc, from: number, to: number): TactixDoc {
  const working = cloneDoc(doc);
  if (from < 0 || from >= working.steps.length) return doc;
  const [step] = working.steps.splice(from, 1);
  working.steps.splice(clamp(to, 0, working.steps.length), 0, step);
  return recomputeFrom(working, 0);
}

/**
 * Recalcule, à partir de l'étape `index`, toutes les positions et
 * possessions dérivées des trajectoires.
 */
export function recomputeFrom(doc: TactixDoc, index: number): TactixDoc {
  const working = cloneDoc(doc);
  for (let k = index + 1; k < working.steps.length; k++) {
    const prev = working.steps[k - 1];
    const step = working.steps[k];
    const derived = new Set(step.derived ?? []);
    const derivedOwners = new Set(step.derivedOwners ?? []);

    // 1. Nettoyage : ce qui n'est plus piloté par une action reprend
    //    sa position héritée.
    for (const id of derived) {
      if (!prev.actions.some((a) => a.ownerId === id)) {
        delete step.positions[id];
        derived.delete(id);
      }
    }
    for (const id of derivedOwners) {
      if (!prev.actions.some((a) => ballOwnerDriven(a, id))) {
        delete step.ballOwners[id];
        derivedOwners.delete(id);
      }
    }

    // 2. Application des actions de l'étape précédente.
    for (const a of prev.actions) {
      const end = actionEnd(a);
      step.positions[a.ownerId] = { ...end };
      derived.add(a.ownerId);
      if (a.type === 'pass' || a.type === 'dribble' || a.type === 'shot') {
        const ballId = resolveBallId(working, a);
        if (ballId) {
          if (a.receiverId) {
            step.ballOwners[ballId] = a.receiverId;
            derivedOwners.add(ballId);
            // le ballon est porté par le receveur
            delete step.positions[ballId];
            derived.delete(ballId);
          } else {
            step.ballOwners[ballId] = null;
            derivedOwners.add(ballId);
            step.positions[ballId] = { ...end };
            derived.add(ballId);
          }
        }
      }
    }
    step.derived = [...derived];
    step.derivedOwners = [...derivedOwners];
  }
  return working;
}

function ballOwnerDriven(a: Action, ballId: string): boolean {
  if (a.type !== 'pass' && a.type !== 'dribble' && a.type !== 'shot') return false;
  return !a.ballId || a.ballId === ballId;
}

function resolveBallId(doc: TactixDoc, a: Action): string | null {
  if (a.ballId) return a.ballId;
  const balls = doc.objects.filter((o) => o.kind === 'ball');
  if (balls.length === 0) return null;
  const owned = balls.find((b) => b.ownerId === a.ownerId);
  return (owned ?? balls[0]).id;
}

// ── Application d'actions (création de trajectoire) ──────────

export interface ApplyResult {
  doc: TactixDoc;
  createdStep: boolean;
}

/**
 * Applique des actions : chaque action est enregistrée dans son étape
 * et pilote automatiquement la position de l'étape suivante (créée si
 * nécessaire), ainsi que la possession du ballon.
 */
export function applyActions(doc: TactixDoc, actions: Action[]): ApplyResult {
  if (actions.length === 0) return { doc, createdStep: false };
  let working = ensureSteps(cloneDoc(doc), Math.max(...actions.map((a) => a.stepIndex)) + 2);
  const before = doc.steps.length;

  const sorted = [...actions].sort((a, b) => a.stepIndex - b.stepIndex);
  for (const raw of sorted) {
    const i = clamp(raw.stepIndex, 0, working.steps.length - 2);
    const step = working.steps[i];
    const start = stepPosition(working, i, raw.ownerId);
    const action: Action = {
      ...raw,
      stepIndex: i,
      points: [{ ...start }, ...raw.points.slice(1).map((p) => ({ ...p }))],
    };
    const end = actionEnd(action);

    // 1. La trajectoire est stockée dans l'étape courante.
    step.actions = [...step.actions, action];

    // 2. Elle pilote l'étape suivante.
    const next = working.steps[i + 1];
    next.positions[action.ownerId] = { ...end };
    next.derived = [...new Set([...(next.derived ?? []), action.ownerId])];

    // 3. Conséquence sur le ballon.
    if (action.type === 'pass' || action.type === 'dribble' || action.type === 'shot') {
      const ballId = resolveBallId(working, action);
      if (ballId) {
        step.ballOwners[ballId] = action.ownerId;
        step.derivedOwners = [...new Set([...(step.derivedOwners ?? []), ballId])];
        if (action.receiverId && action.type === 'pass') {
          next.ballOwners[ballId] = action.receiverId;
          next.derivedOwners = [...new Set([...(next.derivedOwners ?? []), ballId])];
          delete next.positions[ballId];
          next.derived = (next.derived ?? []).filter((d) => d !== ballId);
        } else {
          next.ballOwners[ballId] = null;
          next.derivedOwners = [...new Set([...(next.derivedOwners ?? []), ballId])];
          next.positions[ballId] = { ...end };
          next.derived = [...new Set([...(next.derived ?? []), ballId])];
        }
        // Le ballon objet mémorise son porteur courant.
        working.objects = working.objects.map((o) =>
          o.id === ballId
            ? { ...o, ownerId: action.receiverId && action.type === 'pass' ? action.receiverId : null }
            : o,
        );
      }
    }
  }
  working = recomputeFrom(working, 0);
  return { doc: working, createdStep: working.steps.length > before };
}

/** Supprime des actions et remet à jour la chaîne. */
export function removeActions(doc: TactixDoc, actionIds: string[]): TactixDoc {
  const working = cloneDoc(doc);
  let from = working.steps.length;
  for (const step of working.steps) {
    const keep = step.actions.filter((a) => !actionIds.includes(a.id));
    if (keep.length !== step.actions.length) {
      from = Math.min(from, working.steps.indexOf(step));
      step.actions = keep;
    }
  }
  return recomputeFrom(working, Math.max(0, from - 1));
}

/** Met à jour une action existante (points, type, destinataire…). */
export function updateAction(doc: TactixDoc, actionId: string, patch: Partial<Action>): TactixDoc {
  const working = cloneDoc(doc);
  let from = working.steps.length;
  for (const step of working.steps) {
    const idx = step.actions.findIndex((a) => a.id === actionId);
    if (idx >= 0) {
      const prev = step.actions[idx];
      step.actions[idx] = { ...prev, ...patch };
      from = Math.min(from, working.steps.indexOf(step));
    }
  }
  return recomputeFrom(working, Math.max(0, from - 1));
}

// ── Objets ───────────────────────────────────────────────────

export function upsertObject(doc: TactixDoc, obj: SceneObject): TactixDoc {
  const exists = doc.objects.some((o) => o.id === obj.id);
  const objects = exists
    ? doc.objects.map((o) => (o.id === obj.id ? obj : o))
    : [...doc.objects, obj];
  return { ...doc, objects };
}

/** Met à jour une position d'objet : base + étape courante. */
export function setObjectPosition(
  doc: TactixDoc,
  objectId: string,
  point: Point,
  stepIndex: number,
): TactixDoc {
  const working = cloneDoc(doc);
  if (stepIndex <= 0) {
    working.objects = working.objects.map((o) =>
      o.id === objectId ? { ...o, x: point.x, y: point.y } : o,
    );
    const step0 = working.steps[0];
    if (step0) {
      step0.positions[objectId] = { ...point };
      step0.derived = (step0.derived ?? []).filter((d) => d !== objectId);
    }
    return working;
  }
  const step = working.steps[clamp(stepIndex, 0, working.steps.length - 1)];
  step.positions[objectId] = { ...point };
  step.derived = (step.derived ?? []).filter((d) => d !== objectId);
  return working;
}

/** Le ballon est-il porté par ce joueur ? */
export function playerHasBall(doc: TactixDoc, stepIndex: number, playerId: string): SceneObject | undefined {
  return doc.objects.find(
    (o) => o.kind === 'ball' && ballOwnerAt(doc, stepIndex, o.id) === playerId,
  );
}

export function ballAt(doc: TactixDoc, stepIndex: number): SceneObject | undefined {
  const balls = doc.objects.filter((o) => o.kind === 'ball');
  if (balls.length === 0) return undefined;
  // Priorité au ballon « actif » (celui qui a un porteur à cette étape).
  const owned = balls.find((b) => ballOwnerAt(doc, stepIndex, b.id));
  return owned ?? balls[0];
}

/**
 * Supprime un objet. Les trajectoires liées sont supprimées si demandé.
 */
export function deleteObject(doc: TactixDoc, objectId: string, deleteActions = true): TactixDoc {
  const working = cloneDoc(doc);
  let from = working.steps.length;
  working.objects = working.objects.filter((o) => o.id !== objectId);
  for (const step of working.steps) {
    delete step.positions[objectId];
    delete step.ballOwners[objectId];
    step.derived = (step.derived ?? []).filter((d) => d !== objectId);
    step.derivedOwners = (step.derivedOwners ?? []).filter((d) => d !== objectId);
    if (deleteActions) {
      const keep = step.actions.filter((a) => a.ownerId !== objectId);
      if (keep.length !== step.actions.length) from = Math.min(from, working.steps.indexOf(step));
      step.actions = keep;
    }
    // Un ballon ne peut plus être porté par un joueur supprimé.
    for (const key of Object.keys(step.ballOwners)) {
      if (step.ballOwners[key] === objectId) step.ballOwners[key] = null;
    }
  }
  working.objects = working.objects.map((o) =>
    o.kind === 'ball' && o.ownerId === objectId ? { ...o, ownerId: null } : o,
  );
  return recomputeFrom(working, Math.max(0, from - 1));
}

/** Nombre de trajectoires liées à un objet (pour la confirmation). */
export function countLinkedActions(doc: TactixDoc, objectId: string): number {
  return doc.steps.reduce(
    (n, s) => n + s.actions.filter((a) => a.ownerId === objectId).length,
    0,
  );
}

// ── Description lisible (instructions, export, assistant) ────

export function objectName(o: SceneObject): string {
  if (o.kind === 'player') {
    const team = o.team === 'away' ? 'Adversaire' : o.team === 'neutral' ? 'Neutre' : 'Joueur';
    const num = o.number ? ` ${o.number}` : '';
    const name = o.name ? ` ${o.name}` : '';
    return `${team}${num}${name}`;
  }
  if (o.kind === 'ball') return 'Ballon';
  return o.itemType ?? o.kind;
}

export function describeAction(action: Action, doc: TactixDoc): string {
  const desc = actionDescriptor(action.type);
  const owner = doc.objects.find((o) => o.id === action.ownerId);
  const ownerTxt = owner ? objectName(owner) : 'objet';
  const recv = action.receiverId ? doc.objects.find((o) => o.id === action.receiverId) : undefined;
  const len = actionLength(action).toFixed(1);
  if (action.type === 'pass' && recv) {
    return `${ownerTxt} → ${objectName(recv)} (${desc.label.toLowerCase()} ${len} m)`;
  }
  if (action.type === 'shot') {
    return `${ownerTxt} frappe au but (${len} m)`;
  }
  return `${ownerTxt} — ${desc.label.toLowerCase()} (${len} m)`;
}

export function describeSteps(doc: TactixDoc): { title: string; lines: string[] }[] {
  return doc.steps.map((step, i) => ({
    title: step.title || `Étape ${i + 1}`,
    lines: step.actions.map((a) => describeAction(a, doc)),
  }));
}

/** Texte complet d'instructions généré automatiquement (pratique à partager). */
export function autoInstructions(doc: TactixDoc): string {
  const lines: string[] = [];
  doc.steps.forEach((step, i) => {
    const acts = step.actions.map((a) => describeAction(a, doc));
    if (acts.length === 0 && !step.note) return;
    lines.push(`${i + 1}. ${step.title || `Étape ${i + 1}`}`);
    acts.forEach((a) => lines.push(`   • ${a}`));
    if (step.note) lines.push(`   ${step.note}`);
  });
  return lines.join('\n');
}

/** Nombre d'étapes jouables (avec transition). */
export function playableStepCount(doc: TactixDoc): number {
  return doc.steps.length;
}
