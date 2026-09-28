import type { Action, ActionType, Point, SceneObject, TactixDoc } from './types';
import { actionDescriptor, createAction, findReceiver } from './actions';
import { ballAt, ballOwnerAt } from './steps';
import { makeBall } from './team';
import { clamp, simplifyPath } from './geometry';

// ─────────────────────────────────────────────────────────────
// Tracé au doigt → action intelligente.
// Toute l'intelligence est ici, hors interface : réduction du tracé,
// détection du joueur concerné et du destinataire, possession du ballon.
// ─────────────────────────────────────────────────────────────

export interface DrawOutcome {
  action: Action;
  /** Ballon créé au passage (si le terrain n'en avait aucun). */
  newBall?: SceneObject;
  /** Nouveau porteur du ballon pour l'étape de départ. */
  ballOwner?: { ballId: string; ownerId: string | null };
  receiver?: SceneObject;
  /** Longueur du tracé nettoyé, en mètres. */
  length: number;
}

export interface DrawInput {
  doc: TactixDoc;
  stepIndex: number;
  rawPoints: Point[];
  type: ActionType;
  ownerId: string;
  /** Position « live » d'un objet à l'étape courante. */
  resolve: (id: string) => Point;
}

/** Distance minimale d'un tracé pour être accepté (mètres). */
export const MIN_DRAW_LENGTH = 2;

export function cleanDrawnPoints(doc: TactixDoc, rawPoints: Point[]): Point[] {
  const tolerance = clamp(doc.pitch.view.w / 140, 0.35, 2.2);
  let points = simplifyPath(rawPoints, tolerance);
  if (points.length < 2 && rawPoints.length >= 2) {
    points = [rawPoints[0], rawPoints[rawPoints.length - 1]];
  }
  return points;
}

export function pathLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}

/**
 * Transforme un tracé brut en action prête à être appliquée.
 * Ne modifie pas le document : l'appelant décide quoi persister.
 */
export function resolveDrawnAction(input: DrawInput): DrawOutcome | null {
  const { doc, stepIndex, rawPoints, type, ownerId, resolve } = input;
  if (rawPoints.length < 2) return null;
  const desc = actionDescriptor(type);

  let points = cleanDrawnPoints(doc, rawPoints);
  if (points.length < 2) return null;
  const ownerPos = resolve(ownerId);
  points = [{ ...ownerPos }, ...points.slice(1)];
  const length = pathLength(points);
  if (length < MIN_DRAW_LENGTH) return null;

  let newBall: SceneObject | undefined;
  let ballOwner: { ballId: string; ownerId: string | null } | undefined;
  let ballId: string | null = null;

  if (desc.ball) {
    const ball = ballAt(doc, stepIndex);
    if (ball) {
      ballId = ball.id;
      if (ballOwnerAt(doc, stepIndex, ball.id) !== ownerId) {
        ballOwner = { ballId: ball.id, ownerId };
      }
    } else {
      newBall = makeBall(ownerPos.x, ownerPos.y, ownerId);
      ballId = newBall.id;
      ballOwner = { ballId: newBall.id, ownerId };
    }
  }

  let receiver: SceneObject | undefined;
  let receiverId: string | null = null;

  if (type === 'pass') {
    const end = points[points.length - 1];
    const candidates = doc.objects
      .filter((o) => o.kind === 'player' && o.id !== ownerId)
      .map((o) => ({ id: o.id, ...resolve(o.id) }));
    receiverId = findReceiver(end, candidates, Math.max(7, doc.pitch.view.w * 0.1), ownerId);
    if (receiverId) {
      receiver = doc.objects.find((o) => o.id === receiverId);
      const rp = resolve(receiverId);
      // La passe se termine réellement sur le receveur.
      points = [...points.slice(0, -1), { x: rp.x, y: rp.y }];
    }
  }

  const action = createAction(type, ownerId, points, {
    stepIndex,
    ballId,
    receiverId,
    style: desc.style,
  });

  return { action, newBall, ballOwner, receiver, length };
}

/** Joueur le plus proche d'un point (utile quand rien n'est sélectionné). */
export function nearestPlayer(
  doc: TactixDoc,
  point: Point,
  resolve: (id: string) => Point,
  maxDistance = 12,
): SceneObject | null {
  let best: { player: SceneObject; d: number } | null = null;
  for (const o of doc.objects) {
    if (o.kind !== 'player') continue;
    const p = resolve(o.id);
    const d = Math.hypot(p.x - point.x, p.y - point.y);
    if (!best || d < best.d) best = { player: o, d };
  }
  return best && best.d <= maxDistance ? best.player : null;
}
