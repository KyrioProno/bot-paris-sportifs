import type { Point, Rect } from './types';

// ─────────────────────────────────────────────────────────────
// Géométrie utilitaire (unités : mètres)
// ─────────────────────────────────────────────────────────────

export const clamp = (v: number, min: number, max: number) =>
  v < min ? min : v > max ? max : v;

export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const lerpPoint = (a: Point, b: Point, t: number): Point => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
});

export const addPoints = (a: Point, b: Point): Point => ({
  x: a.x + b.x,
  y: a.y + b.y,
});

export const round = (v: number, step = 0.01) => Math.round(v / step) * step;

/** Longueur cumulée d'une polyligne. */
export function polylineLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
  return total;
}

/** Point situé à la distance `d` le long d'une polyligne. */
export function pointAtDistance(points: Point[], d: number): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  let remaining = Math.max(0, d);
  for (let i = 1; i < points.length; i++) {
    const seg = dist(points[i - 1], points[i]);
    if (seg <= 1e-9) continue;
    if (remaining <= seg) return lerpPoint(points[i - 1], points[i], remaining / seg);
    remaining -= seg;
  }
  return points[points.length - 1];
}

/** Distance d'un point à un segment. */
export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = clamp(t, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function distToPolyline(p: Point, points: Point[]): number {
  if (points.length === 0) return Infinity;
  if (points.length === 1) return dist(p, points[0]);
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    best = Math.min(best, distToSegment(p, points[i - 1], points[i]));
  }
  return best;
}

/**
 * Lissage Catmull-Rom → courbe de Bézier cubique.
 * Utilisé pour transformer un tracé au doigt en trajectoire propre.
 */
export function catmullRomPath(points: Point[], tension = 0.5): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? points[i + 1];
    const c1 = {
      x: p1.x + ((p2.x - p0.x) / 6) * tension * 2,
      y: p1.y + ((p2.y - p0.y) / 6) * tension * 2,
    };
    const c2 = {
      x: p2.x - ((p3.x - p1.x) / 6) * tension * 2,
      y: p2.y - ((p3.y - p1.y) / 6) * tension * 2,
    };
    d += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

/** Échantillonne une courbe lissée (pour l'animation le long du tracé). */
export function sampleSmoothPath(points: Point[], samples = 64): Point[] {
  if (points.length <= 2) return points.slice();
  const out: Point[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? points[i + 1];
    const c1 = {
      x: p1.x + ((p2.x - p0.x) / 6),
      y: p1.y + ((p2.y - p0.y) / 6),
    };
    const c2 = {
      x: p2.x - ((p3.x - p1.x) / 6),
      y: p2.y - ((p3.y - p1.y) / 6),
    };
    const steps = Math.max(2, Math.round(samples / (points.length - 1)));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push(cubicPoint(p1, c1, c2, p2, t));
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

export function cubicPoint(
  p0: Point,
  c1: Point,
  c2: Point,
  p1: Point,
  t: number,
): Point {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p1.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p1.y,
  };
}

/** Ramène un tracé brut (beaucoup de points) à quelques points clés. */
export function simplifyPath(points: Point[], tolerance = 1.2): Point[] {
  if (points.length < 3) return points.slice();
  const keep = new Set<number>([0, points.length - 1]);
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    // Distance max de Douglas-Peucker
    let maxD = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const d = distToSegment(points[i], points[start], points[end]);
      if (d > maxD) {
        maxD = d;
        index = i;
      }
    }
    if (maxD > tolerance && index > 0) {
      keep.add(index);
      stack.push([start, index], [index, end]);
    }
  }
  return [...keep].sort((a, b) => a - b).map((i) => points[i]);
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.w < b.x ||
    b.x + b.w < a.x ||
    a.y + a.h < b.y ||
    b.y + b.h < a.y
  );
}

export const easeInOut = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
