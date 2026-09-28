import type { Point, PitchSpec, Rect } from '../types';

// ─────────────────────────────────────────────────────────────
// Orientation du terrain.
// Le passage horizontal → vertical est un VRAI recalcul de repère :
//   horizontal : (x, y) → (x, y)
//   vertical   : (x, y) → (y, x0 + viewW − x)   [rotation de 90°]
// Les objets, buts, trajectoires et équipements stockés en mètres
// suivent donc automatiquement l'orientation, sans jamais être
// « tournés » comme une image.
// ─────────────────────────────────────────────────────────────

export interface Box extends Rect {}

/** Zone visible exprimée dans le repère écran (mètres), marges incluses. */
export function screenBox(pitch: PitchSpec): Box {
  const pad = pitch.padding;
  const v = pitch.view;
  if (pitch.orientation === 'vertical') {
    return {
      x: v.y - pad,
      y: -pad,
      w: v.h + pad * 2,
      h: v.w + pad * 2,
    };
  }
  return {
    x: v.x - pad,
    y: v.y - pad,
    w: v.w + pad * 2,
    h: v.h + pad * 2,
  };
}

export function worldToScreen(p: Point, pitch: PitchSpec): Point {
  if (pitch.orientation === 'vertical') {
    return { x: p.y, y: pitch.view.x + pitch.view.w - p.x };
  }
  return { x: p.x, y: p.y };
}

export function screenToWorld(p: Point, pitch: PitchSpec): Point {
  if (pitch.orientation === 'vertical') {
    return { x: pitch.view.x + pitch.view.w - p.y, y: p.x };
  }
  return { x: p.x, y: p.y };
}

/** Transformée SVG à appliquer au groupe « monde » (identité si horizontal). */
export function worldTransform(pitch: PitchSpec): string | undefined {
  if (pitch.orientation === 'vertical') {
    const f = pitch.view.x + pitch.view.w;
    return `matrix(0 -1 1 0 0 ${f})`;
  }
  return undefined;
}

export function viewBoxString(pitch: PitchSpec): string {
  const b = screenBox(pitch);
  return `${b.x} ${b.y} ${b.w} ${b.h}`;
}

/** Rectangle monde réellement visible (utilisé pour le clipping). */
export function clipRect(pitch: PitchSpec): Rect {
  return { ...pitch.view };
}

export const ORIENTATIONS: { id: 'horizontal' | 'vertical'; label: string; hint: string }[] = [
  { id: 'horizontal', label: 'Horizontal', hint: 'Terrain dans sa longueur' },
  { id: 'vertical', label: 'Vertical', hint: 'Terrain dans sa largeur' },
];
