import type { Point } from '../domain/types';

// ─────────────────────────────────────────────────────────────
// Primitives de rendu vectoriel.
// Un même jeu de formes est utilisé pour l'écran (React/SVG) et
// pour l'export (chaîne SVG) : le rendu est donc identique partout.
// ─────────────────────────────────────────────────────────────

export interface Style {
  /** Rayon d'arrondi (rectangles). */
  rx?: number;
  fill?: string;
  stroke?: string;
  sw?: number;
  dash?: string;
  opacity?: number;
  cap?: 'butt' | 'round' | 'square';
  join?: 'miter' | 'round' | 'bevel';
  fillRule?: 'nonzero' | 'evenodd';
}

export type Shape =
  | ({ k: 'poly'; points: Point[]; closed?: boolean } & Style)
  | ({ k: 'circle'; cx: number; cy: number; r: number } & Style)
  | ({ k: 'ellipse'; cx: number; cy: number; rx: number; ry: number } & Style)
  | ({ k: 'rect'; x: number; y: number; w: number; h: number; rx?: number } & Style)
  | ({ k: 'path'; d: string } & Style)
  | ({ k: 'text'; x: number; y: number; text: string; size: number; anchor?: 'start' | 'middle' | 'end'; weight?: number } & Style);

export function poly(points: Point[], style: Style = {}, closed = false): Shape {
  return { k: 'poly', points, closed, cap: 'round', join: 'round', ...style };
}

export function circle(cx: number, cy: number, r: number, style: Style = {}): Shape {
  return { k: 'circle', cx, cy, r, ...style };
}

export function rect(x: number, y: number, w: number, h: number, style: Style = {}): Shape {
  return { k: 'rect', x, y, w, h, ...style };
}

export function line(a: Point, b: Point, style: Style = {}): Shape {
  return poly([a, b], style);
}

export function text(
  x: number,
  y: number,
  label: string,
  size: number,
  style: Style & { anchor?: 'start' | 'middle' | 'end'; weight?: number } = {},
): Shape {
  return { k: 'text', x, y, text: label, size, anchor: 'middle', weight: 700, ...style };
}

// ── Transformations locales ──────────────────────────────────

export interface Placement {
  at: Point;
  rotate?: number;
  scale?: number;
}

export function placementTransform({ at, rotate = 0, scale = 1 }: Placement): (p: Point) => Point {
  const rad = (rotate * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return (p: Point) => ({
    x: at.x + (p.x * cos - p.y * sin) * scale,
    y: at.y + (p.x * sin + p.y * cos) * scale,
  });
}

/** Applique un placement local à un jeu de formes. */
export function placeShapes(shapes: Shape[], placement: Placement): Shape[] {
  const t = placementTransform(placement);
  const s = placement.scale ?? 1;
  return shapes.map((shape) => {
    switch (shape.k) {
      case 'poly':
        return { ...shape, points: shape.points.map(t), sw: (shape.sw ?? 0) * s };
      case 'circle': {
        const c = t({ x: shape.cx, y: shape.cy });
        return { ...shape, cx: c.x, cy: c.y, r: shape.r * s, sw: (shape.sw ?? 0) * s };
      }
      case 'ellipse': {
        const c = t({ x: shape.cx, y: shape.cy });
        return { ...shape, cx: c.x, cy: c.y, rx: shape.rx * s, ry: shape.ry * s, sw: (shape.sw ?? 0) * s };
      }
      case 'rect': {
        // rectangle tourné : converti en polygone
        if (placement.rotate) {
          const corners = [
            { x: shape.x, y: shape.y },
            { x: shape.x + shape.w, y: shape.y },
            { x: shape.x + shape.w, y: shape.y + shape.h },
            { x: shape.x, y: shape.y + shape.h },
          ].map(t);
          return poly(corners, { ...shape }, true);
        }
        const c = t({ x: shape.x, y: shape.y });
        return { ...shape, x: c.x, y: c.y, w: shape.w * s, h: shape.h * s, sw: (shape.sw ?? 0) * s };
      }
      case 'path': {
        const c = t({ x: 0, y: 0 });
        return { ...shape, d: translatePath(shape.d, c) };
      }
      case 'text': {
        const c = t({ x: shape.x, y: shape.y });
        return { ...shape, x: c.x, y: c.y, size: shape.size * s };
      }
      default:
        return shape;
    }
  });
}

/**
 * Décale une chaîne de chemin (utilisé pour les rares cas de path).
 * Les chemins de TACTIX n'utilisent que des commandes simples.
 */
export function translatePath(d: string, delta: Point): string {
  return d.replace(/(-?\d*\.?\d+)[ ,](-?\d*\.?\d+)/g, (_m, x, y) => {
    return `${parseFloat(x) + delta.x} ${parseFloat(y) + delta.y}`;
  });
}

// ── Flèches ──────────────────────────────────────────────────

export function arrowHead(end: Point, from: Point, size: number): Point[] {
  const dx = end.x - from.x;
  const dy = end.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const tip = { x: end.x, y: end.y };
  const left = { x: end.x - ux * size + px * size * 0.55, y: end.y - uy * size + py * size * 0.55 };
  const right = { x: end.x - ux * size - px * size * 0.55, y: end.y - uy * size - py * size * 0.55 };
  const back = { x: end.x - ux * size * 0.55, y: end.y - uy * size * 0.55 };
  return [tip, left, back, right];
}

// ── Sérialisation SVG (export) ───────────────────────────────

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function attrs(shape: Shape): string {
  const parts: string[] = [];
  const push = (k: string, v: string | number | undefined) => {
    if (v !== undefined && v !== null && v !== '') parts.push(`${k}="${v}"`);
  };
  push('fill', shape.fill ?? 'none');
  if (shape.stroke) {
    push('stroke', shape.stroke);
    push('stroke-width', shape.sw ?? 1);
    push('stroke-linecap', shape.cap ?? 'round');
    push('stroke-linejoin', shape.join ?? 'round');
    if (shape.dash) push('stroke-dasharray', shape.dash);
  }
  if (shape.opacity !== undefined && shape.opacity !== 1) push('opacity', shape.opacity);
  if (shape.fillRule) push('fill-rule', shape.fillRule);
  return parts.join(' ');
}

export function shapeToSvg(shape: Shape): string {
  const a = attrs(shape);
  switch (shape.k) {
    case 'poly': {
      const pts = shape.points.map((p) => `${round2(p.x)},${round2(p.y)}`).join(' ');
      return shape.closed
        ? `<polygon points="${pts}" ${a}/>`
        : `<polyline points="${pts}" ${a}/>`;
    }
    case 'circle':
      return `<circle cx="${round2(shape.cx)}" cy="${round2(shape.cy)}" r="${round2(shape.r)}" ${a}/>`;
    case 'ellipse':
      return `<ellipse cx="${round2(shape.cx)}" cy="${round2(shape.cy)}" rx="${round2(shape.rx)}" ry="${round2(shape.ry)}" ${a}/>`;
    case 'rect':
      return `<rect x="${round2(shape.x)}" y="${round2(shape.y)}" width="${round2(shape.w)}" height="${round2(shape.h)}"${shape.rx ? ` rx="${shape.rx}"` : ''} ${a}/>`;
    case 'path':
      return `<path d="${shape.d}" ${a}/>`;
    case 'text':
      return `<text x="${round2(shape.x)}" y="${round2(shape.y)}" font-size="${round2(shape.size)}" font-family="-apple-system, Segoe UI, Roboto, sans-serif" font-weight="${shape.weight ?? 700}" text-anchor="${shape.anchor ?? 'middle'}" ${a}>${esc(shape.text)}</text>`;
    default:
      return '';
  }
}

export function shapesToSvg(shapes: Shape[]): string {
  return shapes.map(shapeToSvg).join('\n');
}

const round2 = (v: number) => Math.round(v * 100) / 100;
