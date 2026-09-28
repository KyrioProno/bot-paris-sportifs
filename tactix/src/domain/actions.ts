import type { Action, ActionType, LineStyle, Point } from './types';
import {
  catmullRomPath,
  dist,
  pointAtDistance,
  polylineLength,
} from './geometry';

// ─────────────────────────────────────────────────────────────
// Trajectoires intelligentes.
// Une trajectoire n'est pas un simple trait : c'est une ACTION.
// Elle porte un joueur, un type, et elle pilote la position du
// joueur à l'étape suivante (voir domain/steps.ts).
// ─────────────────────────────────────────────────────────────

export interface ActionDescriptor {
  type: ActionType;
  label: string;
  emoji: string;
  color: string;
  style: LineStyle;
  /** L'action concerne le ballon (passe, dribble, frappe). */
  ball: boolean;
  /** L'action déplace le joueur. */
  moves: boolean;
  hint: string;
}

export const ACTIONS: ActionDescriptor[] = [
  {
    type: 'pass',
    label: 'Passe',
    emoji: '➡️',
    color: '#3D8BFF',
    style: 'solid',
    ball: true,
    moves: false,
    hint: 'Le ballon part vers un partenaire',
  },
  {
    type: 'run',
    label: 'Course',
    emoji: '🏃',
    color: '#20E67A',
    style: 'solid',
    ball: false,
    moves: true,
    hint: 'Le joueur gagne de la profondeur',
  },
  {
    type: 'call',
    label: 'Appel',
    emoji: '🙋',
    color: '#FFAA3D',
    style: 'dashed',
    ball: false,
    moves: true,
    hint: 'Appel de balle, décrochage',
  },
  {
    type: 'dribble',
    label: 'Dribble',
    emoji: '🌀',
    color: '#A78BFA',
    style: 'solid',
    ball: true,
    moves: true,
    hint: 'Le porteur élimine avec le ballon',
  },
  {
    type: 'press',
    label: 'Pressing',
    emoji: '🛡️',
    color: '#FF4D5A',
    style: 'dashed',
    ball: false,
    moves: true,
    hint: 'Le défenseur vient presser',
  },
  {
    type: 'move',
    label: 'Déplacement',
    emoji: '↔️',
    color: '#F4F7F5',
    style: 'dotted',
    ball: false,
    moves: true,
    hint: 'Replacement, décalage',
  },
  {
    type: 'shot',
    label: 'Frappe',
    emoji: '🎯',
    color: '#FF6B4A',
    style: 'solid',
    ball: true,
    moves: false,
    hint: 'Frappe au but',
  },
];

export const ACTION_LABEL: Record<ActionType, string> = {
  pass: 'Passe',
  run: 'Course',
  call: 'Appel',
  dribble: 'Dribble',
  press: 'Pressing',
  move: 'Déplacement',
  shot: 'Frappe',
};

export function actionDescriptor(type: ActionType): ActionDescriptor {
  return ACTIONS.find((a) => a.type === type) ?? ACTIONS[0];
}

export function actionColor(a: Action): string {
  return a.color ?? actionDescriptor(a.type).color;
}

export const ARROW_SIZES = { head: 1.9 };

let seq = 0;
export function uid(prefix = 'o'): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36)}`;
}

export function createAction(
  type: ActionType,
  ownerId: string,
  points: Point[],
  opts: Partial<Action> = {},
): Action {
  const desc = actionDescriptor(type);
  return {
    id: uid('a'),
    type,
    ownerId,
    points,
    stepIndex: 0,
    style: desc.style,
    curved: false,
    arrow: true,
    ballId: null,
    receiverId: null,
    ...opts,
  };
}

/**
 * Points réellement utilisés pour le rendu et l'animation.
 * `curved` transforme une droite en arc de cercle propre (passe enroulée).
 */
export function actionPath(a: Action): Point[] {
  if (a.points.length < 2) return a.points.slice();
  if (!a.curved) return a.points.slice();
  if (a.points.length === 2) {
    const [p0, p1] = a.points;
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const bend = Math.min(len * 0.22, 12);
    const mid = {
      x: (p0.x + p1.x) / 2 + nx * bend,
      y: (p0.y + p1.y) / 2 + ny * bend,
    };
    const out: Point[] = [];
    const n = 24;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const mt = 1 - t;
      out.push({
        x: mt * mt * p0.x + 2 * mt * t * mid.x + t * t * p1.x,
        y: mt * mt * p0.y + 2 * mt * t * mid.y + t * t * p1.y,
      });
    }
    return out;
  }
  // Tracé déjà courbe : on garde la courbe lissée d'origine.
  return a.points.slice();
}

export function actionPathD(a: Action): string {
  return catmullRomPath(actionPath(a), a.curved ? 0.5 : 0.2);
}

export function actionLength(a: Action): number {
  return polylineLength(actionPath(a));
}

export function actionStart(a: Action): Point {
  return a.points[0] ?? { x: 0, y: 0 };
}

export function actionEnd(a: Action): Point {
  return a.points[a.points.length - 1] ?? { x: 0, y: 0 };
}

export function actionPointAt(a: Action, d: number): Point {
  return pointAtDistance(actionPath(a), d);
}

/** Durée d'animation d'une action (ms), avant application de la vitesse. */
export function actionDuration(a: Action): number {
  const len = actionLength(a);
  const base = a.type === 'run' || a.type === 'press' ? 95 : 80;
  return Math.max(480, Math.min(1800, len * base));
}

/** Distance d'une passe, affichée sur la flèche (info clé pour le coach). */
export function actionDistanceLabel(a: Action): string | undefined {
  if (a.type !== 'pass' && a.type !== 'shot') return undefined;
  const d = actionLength(a);
  if (d < 1) return undefined;
  return `${d.toFixed(1)} m`;
}

/** Le joueur ciblé par une passe : le plus proche de l'extrémité. */
export function findReceiver(
  end: Point,
  candidates: { id: string; x: number; y: number }[],
  maxDist = 9,
  excludeId?: string,
): string | null {
  let best: string | null = null;
  let bestD = maxDist;
  for (const c of candidates) {
    if (c.id === excludeId) continue;
    const d = dist(end, { x: c.x, y: c.y });
    if (d < bestD) {
      bestD = d;
      best = c.id;
    }
  }
  return best;
}
