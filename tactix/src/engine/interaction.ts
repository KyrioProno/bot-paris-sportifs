import type { Point, PitchSpec, SceneObject, TactixDoc } from '../domain/types';
import { dist, distToPolyline } from '../domain/geometry';
import { actionPath } from '../domain/actions';
import { GOAL_SIZES } from '../domain/goals';
import { equipmentById } from '../domain/equipment';
import { stepPosition } from '../domain/steps';

// ─────────────────────────────────────────────────────────────
// Moteur d'interaction : sélection (hit test), magnétisme (snap),
// guides d'alignement, grille.
// ─────────────────────────────────────────────────────────────

export type LiveResolver = (objectId: string) => Point;

export function defaultResolver(doc: TactixDoc, stepIndex: number): LiveResolver {
  const cache = new Map<string, Point>();
  return (id: string) => {
    const hit = cache.get(id);
    if (hit) return hit;
    const p = stepPosition(doc, stepIndex, id);
    cache.set(id, p);
    return p;
  };
}

export function objectPickRadius(o: SceneObject): number {
  switch (o.kind) {
    case 'player':
      return 2.2;
    case 'ball':
      return 1.8;
    case 'goal': {
      const size = GOAL_SIZES[o.goalKind ?? 'small'];
      return Math.max(size.width / 2, 2);
    }
    case 'zone':
      return Math.max((o.zoneW ?? 10) / 2, (o.zoneH ?? 10) / 2) * 0.75;
    case 'equipment': {
      const item = o.itemType ? equipmentById(o.itemType) : undefined;
      const size = Math.max(item?.w ?? 1.5, item?.h ?? 1.5) * (o.scale ?? 1);
      return Math.max(1.2, size / 2);
    }
    default:
      return 1.5;
  }
}

export type Hit =
  | { kind: 'object'; object: SceneObject; distance: number }
  | { kind: 'action'; actionId: string; distance: number };

/**
 * Cherche l'élément le plus proche du doigt.
 * Priorité aux objets (les plus gros d'abord), puis aux trajectoires.
 */
export function hitTest(
  doc: TactixDoc,
  world: Point,
  tolerance: number,
  resolve: LiveResolver,
): Hit | null {
  let best: Hit | null = null;
  // Les joueurs et ballons sont prioritaires (zones petites et précises).
  const priority = (o: SceneObject) => (o.kind === 'player' || o.kind === 'ball' ? 0 : 1);
  const sorted = [...doc.objects].sort((a, b) => priority(a) - priority(b));
  for (const o of sorted) {
    const p = resolve(o.id);
    const d = dist(world, p);
    const r = objectPickRadius(o) + tolerance * 0.35;
    if (d <= Math.max(r, tolerance)) {
      if (!best || d < best.distance) best = { kind: 'object', object: o, distance: d };
    }
  }
  if (best) return best;

  for (const step of doc.steps) {
    for (const action of step.actions) {
      const d = distToPolyline(world, actionPath(action));
      if (d <= Math.max(1.2, tolerance)) {
        if (!best || d < best.distance) best = { kind: 'action', actionId: action.id, distance: d };
      }
    }
  }
  return best;
}

// ── Guides et magnétisme ─────────────────────────────────────

export interface Guide {
  axis: 'x' | 'y';
  value: number;
  kind: 'pitch' | 'object';
  label?: string;
}

export interface SnapResult {
  point: Point;
  guides: Guide[];
  snappedX: boolean;
  snappedY: boolean;
}

/** Lignes de référence du terrain (en mètres, repère monde). */
export function pitchSnapLines(pitch: PitchSpec): { x: { v: number; label: string }[]; y: { v: number; label: string }[] } {
  const v = pitch.view;
  const L = pitch.length;
  const W = pitch.width;
  const x = [
    { v: v.x, label: 'Ligne de but' },
    { v: v.x + v.w, label: 'Ligne de but' },
    { v: L / 2, label: 'Ligne médiane' },
    { v: L - 16.5, label: 'Surface' },
    { v: L / 2 + 9.15, label: 'Rond central' },
    { v: L / 2 - 9.15, label: 'Rond central' },
  ];
  const y = [
    { v: v.y, label: 'Touche' },
    { v: v.y + v.h, label: 'Touche' },
    { v: W / 2, label: 'Axe du terrain' },
    { v: W / 2 - 20.16, label: 'Surface' },
    { v: W / 2 + 20.16, label: 'Surface' },
  ];
  return { x, y };
}

export interface SnapOptions {
  enabled: boolean;
  gridStep: number;
  gridEnabled: boolean;
  threshold: number;
  excludeIds: string[];
  resolve: LiveResolver;
}

export function snapPosition(
  doc: TactixDoc,
  raw: Point,
  opts: SnapOptions,
): SnapResult {
  const guides: Guide[] = [];
  const pitch = doc.pitch;
  const v = pitch.view;

  if (!opts.enabled) {
    return { point: raw, guides, snappedX: false, snappedY: false };
  }

  const lines = pitchSnapLines(pitch);
  let x = raw.x;
  let y = raw.y;
  let snappedX = false;
  let snappedY = false;

  // 1. Magnétisme sur la grille
  if (opts.gridEnabled && opts.gridStep > 0) {
    const gx = Math.round(x / opts.gridStep) * opts.gridStep;
    const gy = Math.round(y / opts.gridStep) * opts.gridStep;
    if (Math.abs(gx - x) <= opts.threshold) {
      x = gx;
      snappedX = true;
    }
    if (Math.abs(gy - y) <= opts.threshold) {
      y = gy;
      snappedY = true;
    }
  }

  // 2. Magnétisme sur les lignes du terrain
  if (!snappedX) {
    for (const line of lines.x) {
      if (Math.abs(line.v - x) <= opts.threshold && line.v >= v.x - 1 && line.v <= v.x + v.w + 1) {
        x = line.v;
        snappedX = true;
        guides.push({ axis: 'x', value: line.v, kind: 'pitch', label: line.label });
        break;
      }
    }
  }
  if (!snappedY) {
    for (const line of lines.y) {
      if (Math.abs(line.v - y) <= opts.threshold && line.v >= v.y - 1 && line.v <= v.y + v.h + 1) {
        y = line.v;
        snappedY = true;
        guides.push({ axis: 'y', value: line.v, kind: 'pitch', label: line.label });
        break;
      }
    }
  }

  // 3. Alignement avec les autres objets
  const others = doc.objects.filter((o) => !opts.excludeIds.includes(o.id));
  if (!snappedX) {
    for (const o of others) {
      const p = opts.resolve(o.id);
      if (Math.abs(p.x - x) <= opts.threshold) {
        x = p.x;
        snappedX = true;
        guides.push({ axis: 'x', value: p.x, kind: 'object' });
        break;
      }
    }
  }
  if (!snappedY) {
    for (const o of others) {
      const p = opts.resolve(o.id);
      if (Math.abs(p.y - y) <= opts.threshold) {
        y = p.y;
        snappedY = true;
        guides.push({ axis: 'y', value: p.y, kind: 'object' });
        break;
      }
    }
  }

  // On ne sort jamais du terrain visible.
  x = Math.min(Math.max(x, v.x), v.x + v.w);
  y = Math.min(Math.max(y, v.y), v.y + v.h);

  return { point: { x, y }, guides, snappedX, snappedY };
}

// ── Alignement / répartition (espacement automatique) ────────

export type AlignMode = 'left' | 'right' | 'top' | 'bottom' | 'centerX' | 'centerY';

export function alignmentLabel(mode: AlignMode): string {
  switch (mode) {
    case 'left':
      return 'Aligner à gauche';
    case 'right':
      return 'Aligner à droite';
    case 'top':
      return 'Aligner en haut';
    case 'bottom':
      return 'Aligner en bas';
    case 'centerX':
      return 'Centrer verticalement';
    case 'centerY':
      return 'Centrer horizontalement';
  }
}

export function alignTargets(ids: string[], mode: AlignMode, positions: Record<string, Point>): Record<string, Point> {
  const points = ids.map((id) => ({ id, p: positions[id] })).filter((e) => e.p);
  if (points.length < 2) return {};
  const out: Record<string, Point> = {};
  if (mode === 'left' || mode === 'right' || mode === 'centerX') {
    const xs = points.map((e) => e.p.x);
    const target =
      mode === 'left' ? Math.min(...xs) : mode === 'right' ? Math.max(...xs) : (Math.min(...xs) + Math.max(...xs)) / 2;
    for (const e of points) out[e.id] = { x: target, y: e.p.y };
  } else {
    const ys = points.map((e) => e.p.y);
    const target =
      mode === 'top' ? Math.min(...ys) : mode === 'bottom' ? Math.max(...ys) : (Math.min(...ys) + Math.max(...ys)) / 2;
    for (const e of points) out[e.id] = { x: e.p.x, y: target };
  }
  return out;
}

/** Répartit régulièrement les objets sélectionnés (espacement automatique). */
export function distributeTargets(
  ids: string[],
  axis: 'x' | 'y',
  positions: Record<string, Point>,
): Record<string, Point> {
  const points = ids.map((id) => ({ id, p: positions[id] })).filter((e) => e.p);
  if (points.length < 3) return {};
  points.sort((a, b) => (axis === 'x' ? a.p.x - b.p.x : a.p.y - b.p.y));
  const first = points[0].p[axis];
  const last = points[points.length - 1].p[axis];
  const step = (last - first) / (points.length - 1);
  const out: Record<string, Point> = {};
  points.forEach((e, i) => {
    const value = first + step * i;
    out[e.id] = axis === 'x' ? { x: value, y: e.p.y } : { x: e.p.x, y: value };
  });
  return out;
}

export function boundsOfObjects(doc: TactixDoc, resolve: LiveResolver) {
  const points = doc.objects.map((o) => resolve(o.id));
  if (points.length === 0) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}
