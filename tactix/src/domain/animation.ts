import type { Action, Point, TactixDoc } from './types';
import { actionLength, actionPointAt } from './actions';
import { easeInOut, clamp } from './geometry';
import { ballOwnerAt, stepPosition } from './steps';

// ─────────────────────────────────────────────────────────────
// Moteur d'animation.
// À partir d'une étape et d'un temps normalisé (0 → 1), calcule la
// position animée de chaque objet et de chaque ballon, en suivant
// réellement le tracé des trajectoires.
// ─────────────────────────────────────────────────────────────

export interface BallState {
  pos: Point;
  ownerId: string | null;
  /** Distance parcourue sur sa trajectoire de passe (null si porté). */
  flight: number | null;
}

export interface FrameState {
  /** Temps normalisé dans l'étape (0 = début, 1 = fin). */
  t: number;
  /** Phase d'attente (lecture de la position) ou de transition. */
  phase: 'hold' | 'transition';
  /** Position de chaque objet (hors ballons). */
  positions: Record<string, Point>;
  /** État de chaque ballon. */
  balls: Record<string, BallState>;
  /** Avancement (0 → 1) de chaque action. */
  progress: Record<string, number>;
  /** Action la plus avancée par objet (pour le menu contextuel). */
  activeActions: string[];
}

export function stepDuration(step: { holdMs: number; transitionMs: number }, speed = 1): number {
  return Math.max(260, (step.holdMs + step.transitionMs) / Math.max(0.1, speed));
}

interface Windowed {
  action: Action;
  start: number;
  end: number;
  length: number;
}

/** Répartit les actions d'un même objet en fenêtres temporelles chaînées. */
function windowsFor(actions: Action[]): Windowed[] {
  const lengths = actions.map((a) => Math.max(0.5, actionLength(a)));
  const total = lengths.reduce((s, l) => s + l, 0) || 1;
  let cum = 0;
  return actions.map((action, i) => {
    const start = cum / total;
    cum += lengths[i];
    return { action, start, end: cum / total, length: lengths[i] };
  });
}

function progressInWindow(w: Windowed, eased: number): number {
  if (eased <= w.start) return 0;
  if (eased >= w.end) return 1;
  return (eased - w.start) / Math.max(1e-6, w.end - w.start);
}

export function computeFrame(
  doc: TactixDoc,
  stepIndex: number,
  t: number,
  speed = 1,
): FrameState {
  const step = doc.steps[clamp(stepIndex, 0, doc.steps.length - 1)];
  const total = Math.max(1, stepDuration(step, speed));
  const holdFrac = clamp(step.holdMs / total, 0, 0.9);
  const tc = clamp(t, 0, 1);
  const raw = tc <= holdFrac ? 0 : (tc - holdFrac) / (1 - holdFrac);
  const eased = easeInOut(clamp(raw, 0, 1));
  const phase: 'hold' | 'transition' = tc <= holdFrac ? 'hold' : 'transition';

  const positions: Record<string, Point> = {};
  for (const o of doc.objects) positions[o.id] = stepPosition(doc, stepIndex, o.id);

  const progress: Record<string, number> = {};
  const activeActions: string[] = [];

  // 1. Objets (joueurs, matériel) pilotés par leurs trajectoires.
  const byOwner = new Map<string, Action[]>();
  for (const a of step.actions) {
    const list = byOwner.get(a.ownerId) ?? [];
    list.push(a);
    byOwner.set(a.ownerId, list);
  }
  for (const [ownerId, actions] of byOwner) {
    const windows = windowsFor(actions);
    for (const w of windows) {
      progress[w.action.id] = progressInWindow(w, eased);
    }
    // On se place sur la dernière action atteinte.
    let chosen = windows[0];
    for (const w of windows) {
      if (eased >= w.start) chosen = w;
    }
    const p = progressInWindow(chosen, eased);
    positions[ownerId] = actionPointAt(chosen.action, p * chosen.length);
    if (p > 0 && p < 1) activeActions.push(chosen.action.id);
  }

  // 2. Ballons.
  const balls: Record<string, BallState> = {};
  const ballObjects = doc.objects.filter((o) => o.kind === 'ball');
  for (const ball of ballObjects) {
    const flight = step.actions.find(
      (a) =>
        (a.type === 'pass' || a.type === 'shot' || a.type === 'dribble') &&
        (a.ballId ? a.ballId === ball.id : true) &&
        ballOwnerAt(doc, stepIndex, ball.id) === a.ownerId,
    );
    const ownerId = ballOwnerAt(doc, stepIndex, ball.id);
    if (flight) {
      const w = windowsFor([flight])[0];
      progress[flight.id] = progressInWindow(w, eased);
      const p = progressInWindow(w, eased);
      if (p > 0 && p < 1) activeActions.push(flight.id);
      if (p <= 0) {
        balls[ball.id] = {
          pos: positions[ownerId ?? ''] ?? stepPosition(doc, stepIndex, ball.id),
          ownerId,
          flight: null,
        };
      } else if (p >= 1) {
        balls[ball.id] = {
          pos: actionPointAt(flight, w.length),
          ownerId: flight.receiverId ?? null,
          flight: w.length,
        };
      } else {
        balls[ball.id] = {
          pos: actionPointAt(flight, p * w.length),
          ownerId: null,
          flight: p * w.length,
        };
      }
    } else if (ownerId && positions[ownerId]) {
      balls[ball.id] = { pos: positions[ownerId], ownerId, flight: null };
    } else {
      balls[ball.id] = {
        pos: stepPosition(doc, stepIndex, ball.id),
        ownerId: null,
        flight: null,
      };
    }
  }

  return { t: tc, phase, positions, balls, progress, activeActions };
}

/** Position d'un ballon à l'écran : léger décalage quand il est porté. */
export function ballScreenOffset(state: BallState | undefined): Point {
  if (!state || !state.ownerId) return { x: 0, y: 0 };
  return { x: 0.9, y: 0.9 };
}
