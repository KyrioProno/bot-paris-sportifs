import type { PitchSpec, Point } from '../types';
import { FIFA } from './dimensions';

// ─────────────────────────────────────────────────────────────
// Moteur de terrain vectoriel.
// Les marquages sont calculés en mètres dans le repère du terrain
// complet, puis la fenêtre visible (`pitch.view`) les découpe.
// Résultat : des proportions toujours justes, y compris sur un
// demi-terrain ou un dernier tiers.
// ─────────────────────────────────────────────────────────────

export interface MarkingDrawing {
  /** Traits blancs (polylignes). */
  lines: Point[][];
  /** Points (point central, points de penalty). */
  spots: Point[];
  /** Zones légèrement ombrées (surfaces). */
  shades: { points: Point[] }[];
}

export function circlePoints(
  cx: number,
  cy: number,
  r: number,
  from = 0,
  to = Math.PI * 2,
  segments = 72,
): Point[] {
  const pts: Point[] = [];
  const span = to - from;
  const n = Math.max(2, Math.round((Math.abs(span) / (Math.PI * 2)) * segments));
  for (let i = 0; i <= n; i++) {
    const a = from + (span * i) / n;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

/** Surfaces adaptées : proportions FIFA, bornées pour les terrains réduits. */
export function areasFor(pitch: PitchSpec) {
  const small = pitch.marking === 'smallSided';
  const L = pitch.length;
  const W = pitch.width;
  const penaltyDepth = small ? Math.min(9, L * 0.22) : Math.min(FIFA.penaltyAreaDepth, L * 0.3);
  const penaltyWidth = small ? Math.min(W * 0.62, W - 2) : Math.min(FIFA.penaltyAreaWidth, W - 1);
  const goalAreaDepth = small ? penaltyDepth * 0.42 : Math.min(FIFA.goalAreaDepth, penaltyDepth * 0.6);
  const goalAreaWidth = small ? penaltyWidth * 0.5 : Math.min(FIFA.goalAreaWidth, W - 4);
  const centerRadius = small
    ? Math.min(W * 0.18, L * 0.14)
    : Math.min(FIFA.centerCircleRadius, W * 0.22);
  const penaltySpot = small ? penaltyDepth * 0.65 : Math.min(FIFA.penaltySpot, penaltyDepth * 0.75);
  const cornerRadius = small ? 0 : FIFA.cornerRadius;
  return {
    penaltyDepth,
    penaltyWidth,
    goalAreaDepth,
    goalAreaWidth,
    centerRadius,
    penaltySpot,
    cornerRadius,
    /** Rayon de l'arc de surface (9,15 m en norme). */
    arcRadius: small ? 0 : FIFA.centerCircleRadius,
    /** Le terrain réduit affiche-t-il des surfaces ? */
    withAreas: !small || L >= 34,
  };
}

export function buildMarkings(pitch: PitchSpec): MarkingDrawing {
  const L = pitch.length;
  const W = pitch.width;
  const cy = W / 2;
  const a = areasFor(pitch);
  const lines: Point[][] = [];
  const spots: Point[] = [];
  const shades: { points: Point[] }[] = [];

  // ── Limites du terrain ──
  lines.push([
    { x: 0, y: 0 },
    { x: L, y: 0 },
    { x: L, y: W },
    { x: 0, y: W },
    { x: 0, y: 0 },
  ]);

  // ── Ligne médiane ──
  lines.push([
    { x: L / 2, y: 0 },
    { x: L / 2, y: W },
  ]);

  // ── Rond central + point central ──
  lines.push(circlePoints(L / 2, cy, a.centerRadius));
  spots.push({ x: L / 2, y: cy });

  // ── Surfaces de réparation, 5,50 m, points de penalty, arcs ──
  if (a.withAreas) {
    for (const side of [0, 1]) {
      const left = side === 0;
      const originX = left ? 0 : L;
      const dir = left ? 1 : -1;

      const paX = left ? 0 : L - a.penaltyDepth;
      const pa: Point[] = [
        { x: paX, y: cy - a.penaltyWidth / 2 },
        { x: paX + a.penaltyDepth, y: cy - a.penaltyWidth / 2 },
        { x: paX + a.penaltyDepth, y: cy + a.penaltyWidth / 2 },
        { x: paX, y: cy + a.penaltyWidth / 2 },
      ];
      lines.push([...pa, pa[0]]);
      shades.push({ points: pa });

      const gaX = left ? 0 : L - a.goalAreaDepth;
      const ga: Point[] = [
        { x: gaX, y: cy - a.goalAreaWidth / 2 },
        { x: gaX + a.goalAreaDepth, y: cy - a.goalAreaWidth / 2 },
        { x: gaX + a.goalAreaDepth, y: cy + a.goalAreaWidth / 2 },
        { x: gaX, y: cy + a.goalAreaWidth / 2 },
      ];
      lines.push([...ga, ga[0]]);

      // Point de penalty
      spots.push({ x: originX + dir * a.penaltySpot, y: cy });

      // Arc de cercle devant la surface (9,15 m autour du point de penalty)
      if (a.arcRadius > 0) {
        const r = a.arcRadius;
        const cxSpot = originX + dir * a.penaltySpot;
        const outside = Math.abs(a.penaltyDepth - a.penaltySpot);
        if (r > outside) {
          const phi = Math.acos(outside / r);
          const base = left ? 0 : Math.PI;
          const from = base - phi;
          const to = base + phi;
          lines.push(circlePoints(cxSpot, cy, r, from, to, 48));
        }
      }
    }
  }

  // ── Arcs de corner ──
  if (a.cornerRadius > 0) {
    const r = a.cornerRadius;
    lines.push(circlePoints(0, 0, r, 0, Math.PI / 2));
    lines.push(circlePoints(L, 0, r, Math.PI / 2, Math.PI));
    lines.push(circlePoints(L, W, r, Math.PI, (3 * Math.PI) / 2));
    lines.push(circlePoints(0, W, r, (3 * Math.PI) / 2, Math.PI * 2));
  }

  return { lines, spots, shades };
}

/** Bandes de tonte (repère monde). */
export function mowingStripes(pitch: PitchSpec, count = 10): { x: number; w: number }[] {
  const stripes: { x: number; w: number }[] = [];
  const w = pitch.length / count;
  for (let i = 0; i < count; i++) stripes.push({ x: i * w, w });
  return stripes;
}
