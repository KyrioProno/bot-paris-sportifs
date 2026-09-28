import type { Point, Rect } from '../domain/types';

// ─────────────────────────────────────────────────────────────
// Découpe géométrique (Liang-Barsky) : les marquages du terrain
// sont calculés pour un terrain complet puis découpés sur la zone
// visible. Aucune image, aucun clip-path : des vecteurs propres.
// ─────────────────────────────────────────────────────────────

function clipSegment(a: Point, b: Point, r: Rect): [Point, Point] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - r.x, r.x + r.w - a.x, a.y - r.y, r.y + r.h - a.y];

  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return null;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return null;
        if (t < t1) t1 = t;
      }
    }
  }
  return [
    { x: a.x + t0 * dx, y: a.y + t0 * dy },
    { x: a.x + t1 * dx, y: a.y + t1 * dy },
  ];
}

/** Découpe une polyligne en une ou plusieurs polylignes visibles. */
export function clipPolyline(points: Point[], rect: Rect): Point[][] {
  const out: Point[][] = [];
  let current: Point[] = [];
  for (let i = 1; i < points.length; i++) {
    const seg = clipSegment(points[i - 1], points[i], rect);
    if (!seg) {
      if (current.length > 1) out.push(current);
      current = [];
      continue;
    }
    const [s0, s1] = seg;
    if (current.length === 0) {
      current.push(s0);
    } else {
      const last = current[current.length - 1];
      if (Math.hypot(last.x - s0.x, last.y - s0.y) > 1e-6) {
        // segment disjoint : on clôt la polyligne courante
        if (current.length > 1) out.push(current);
        current = [s0];
      }
    }
    current.push(s1);
  }
  if (current.length > 1) out.push(current);
  return out;
}

/** Découpe un polygone (Sutherland-Hodgman, fenêtre rectangulaire). */
export function clipPolygon(points: Point[], rect: Rect): Point[] {
  let output = points.slice();
  const inside: ((p: Point) => boolean)[] = [
    (p) => p.x >= rect.x,
    (p) => p.x <= rect.x + rect.w,
    (p) => p.y >= rect.y,
    (p) => p.y <= rect.y + rect.h,
  ];
  for (let e = 0; e < 4; e++) {
    const input = output;
    output = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      const curIn = inside[e](cur);
      const prevIn = inside[e](prev);
      if (curIn) {
        if (!prevIn) output.push(edgeIntersect(prev, cur, e, rect));
        output.push(cur);
      } else if (prevIn) {
        output.push(edgeIntersect(prev, cur, e, rect));
      }
    }
    if (output.length === 0) return [];
  }
  return output;
}

function edgeIntersect(a: Point, b: Point, edge: number, rect: Rect): Point {
  switch (edge) {
    case 0:
      return intersect(a, b, 'x', rect.x);
    case 1:
      return intersect(a, b, 'x', rect.x + rect.w);
    case 2:
      return intersect(a, b, 'y', rect.y);
    default:
      return intersect(a, b, 'y', rect.y + rect.h);
  }
}

function intersect(a: Point, b: Point, axis: 'x' | 'y', v: number): Point {
  if (axis === 'x') {
    const t = (v - a.x) / (b.x - a.x || 1e-9);
    return { x: v, y: a.y + t * (b.y - a.y) };
  }
  const t = (v - a.y) / (b.y - a.y || 1e-9);
  return { x: a.x + t * (b.x - a.x), y: v };
}

export function pointInRect(p: Point, r: Rect, slack = 0): boolean {
  return p.x >= r.x - slack && p.x <= r.x + r.w + slack && p.y >= r.y - slack && p.y <= r.y + r.h + slack;
}
