import type {
  Action,
  LineStyle,
  PitchSpec,
  Point,
  Rect,
  SceneObject,
  TactixDoc,
} from '../domain/types';
import { actionDescriptor, actionLength, actionPath } from '../domain/actions';
import { buildMarkings, mowingStripes } from '../domain/pitch/markings';
import { screenToWorld, worldToScreen } from '../domain/pitch/orientation';
import { GOAL_SIZES } from '../domain/goals';
import { equipmentById } from '../domain/equipment';
import { playerColor } from '../domain/team';
import { stepPosition } from '../domain/steps';
import { polylineLength } from '../domain/geometry';
import type { FrameState } from '../domain/animation';
import type { Guide } from '../engine/interaction';
import { objectPickRadius } from '../engine/interaction';
import { C, GRASS, SIZES, withAlpha } from './theme';
import {
  arrowHead,
  circle,
  line,
  placeShapes,
  poly,
  rect,
  Shape,
  text,
  translatePath,
  type Style,
} from './shapes';
import { clipPolygon, clipPolyline } from './clip';

// ─────────────────────────────────────────────────────────────
// Construction de la scène vectorielle complète (terrain, joueurs,
// ballons, buts, matériel, trajectoires, guides).
// Cette fonction unique alimente l'écran ET les exports.
// ─────────────────────────────────────────────────────────────

export interface SceneInput {
  doc: TactixDoc;
  /** Étape affichée (pour les positions de repos). */
  stepIndex: number;
  frame?: FrameState;
  selection?: string[];
  selectedActionId?: string | null;
  guides?: Guide[];
  gridStep?: number | null;
  preview?: { points: Point[]; type: Action['type']; color: string; style: LineStyle } | null;
  ghost?: { x: number; y: number; kind: SceneObject['kind']; itemType?: string; goalKind?: string; team?: string } | null;
  snapTargetId?: string | null;
  showDistances?: boolean;
  present?: boolean;
  progress?: Record<string, number>;
  animate?: boolean;
}

export interface Scene {
  /** Formes dans le repère du terrain (mètres). */
  world: Shape[];
  /** Formes dans le repère écran (textes, ballon porté). */
  screen: Shape[];
  defs: string;
}

export function buildScene(input: SceneInput): Scene {
  const { doc } = input;
  const pitch = doc.pitch;
  const view = pitch.view;
  const frame = input.frame;
  const world: Shape[] = [];
  const screen: Shape[] = [];
  const present = !!input.present;

  world.push(...grassShapes(pitch));
  world.push(...gridShapes(pitch, input.gridStep ?? null));
  world.push(...markingShapes(pitch));

  // Positions effectives (animation ou étape courante).
  const positions: Record<string, Point> = {};
  for (const o of doc.objects) {
    positions[o.id] = frame?.positions[o.id] ?? stepPosition(doc, input.stepIndex, o.id);
  }

  // Objets hors joueurs : zones, matériel, buts.
  for (const o of doc.objects) {
    if (o.kind === 'zone') world.push(...zoneShapes(o, positions[o.id]));
  }
  for (const o of doc.objects) {
    if (o.kind === 'equipment') world.push(...equipmentShapes(o, positions[o.id]));
  }
  for (const o of doc.objects) {
    if (o.kind === 'goal') world.push(...goalShapes(o, positions[o.id]));
  }

  // Trajectoires
  const progress = input.progress ?? {};
  for (const step of doc.steps) {
    for (const action of step.actions) {
      const t = progress[action.id];
      if (t === undefined) continue;
      world.push(
        ...actionShapes(action, t, {
          selected: input.selectedActionId === action.id,
          present,
          showDistance: !!input.showDistances,
          ownerPos: positions[action.ownerId],
        }),
      );
    }
  }

  // Tracé en cours (dessin au doigt)
  if (input.preview && input.preview.points.length > 1) {
    world.push(
      poly(input.preview.points, {
        stroke: input.preview.color,
        sw: SIZES.actionWidth * 1.15,
        dash: dashFor(input.preview.style),
        opacity: 0.95,
      }),
    );
    const pts = input.preview.points;
    const end = pts[pts.length - 1];
    const before = pts[pts.length - 2] ?? pts[0];
    world.push(
      poly(arrowHead(end, before, 2.4), {
        fill: input.preview.color,
      }, true),
    );
  }

  // Joueurs + ballons
  const balls = doc.objects.filter((o) => o.kind === 'ball');
  const ownedBallIds = new Set<string>();
  for (const ball of balls) {
    const state = frame?.balls[ball.id];
    if (state?.ownerId) ownedBallIds.add(ball.id);
  }

  for (const o of doc.objects) {
    if (o.kind === 'player') {
      world.push(...playerShapes(o, positions[o.id], input.selection?.includes(o.id) ?? false, present));
    }
  }

  // Ballon porté : dessiné au-dessus, décalé (repère écran).
  for (const ball of balls) {
    const state = frame?.balls[ball.id];
    const p = positions[ball.id];
    const ownerPos = state?.ownerId ? positions[state.ownerId] : undefined;
    const screenPos = worldToScreen(ownerPos ?? p, pitch);
    const offset = state?.ownerId ? 1.85 : 0;
    const radius = present ? SIZES.ballRadius * 1.05 : SIZES.ballRadius;
    screen.push(...ballShapes(screenPos.x + offset, screenPos.y + offset, radius));
    if (input.selection?.includes(ball.id)) {
      screen.push(
        circle(screenPos.x + offset, screenPos.y + offset, radius + 0.9, {
          stroke: C.green,
          sw: 0.28,
          fill: 'none',
          dash: '0.8 0.6',
        }),
      );
    }
  }

  // Noms des joueurs (repère écran, texte toujours droit).
  // Une étiquette n'apparaît que si le joueur possède un nom, ou si
  // l'affichage de son numéro en pastille a été demandé.
  for (const o of doc.objects) {
    if (o.kind !== 'player') continue;
    const label = o.name || (o.showName ? `#${o.number ?? ''}` : '');
    if (!label) continue;
    const sp = worldToScreen(positions[o.id], pitch);
    screen.push(...labelPill(sp.x, sp.y - SIZES.playerRadius - 1.6, label));
  }

  // Sélection
  for (const o of doc.objects) {
    if (!input.selection?.includes(o.id)) continue;
    world.push(...selectionShapes(o, positions[o.id]));
  }
  if (input.snapTargetId) {
    const target = doc.objects.find((o) => o.id === input.snapTargetId);
    if (target) {
      const p = positions[target.id];
      world.push(
        circle(p.x, p.y, objectPickRadius(target) + 1.3, {
          stroke: C.green,
          sw: 0.3,
          dash: '0.9 0.7',
          fill: 'none',
          opacity: 0.9,
        }),
      );
    }
  }

  // Guides d'alignement
  if (input.guides?.length) {
    for (const g of input.guides) {
      world.push(...guideShapes(g, pitch));
      const sp =
        g.axis === 'x'
          ? worldToScreen({ x: g.value, y: view.y + view.h * 0.02 }, pitch)
          : worldToScreen({ x: view.x + view.w * 0.02, y: g.value }, pitch);
      if (g.label) screen.push(...labelPill(sp.x + 6, sp.y, g.label, C.blue));
    }
  }

  // Aperçu de placement (matériel, buts, joueurs)
  if (input.ghost) {
    world.push(...ghostShapes(input.ghost, pitch));
  }

  return { world, screen, defs: defsFor(pitch) };
}

// ── Terrain ──────────────────────────────────────────────────

function grassShapes(pitch: PitchSpec): Shape[] {
  const v = pitch.view;
  const shapes: Shape[] = [];
  shapes.push(rect(v.x, v.y, v.w, v.h, { fill: 'url(#tactix-grass)' }));
  if (pitch.stripes) {
    const stripes = mowingStripes(pitch, pitch.marking === 'smallSided' ? 4 : 10);
    stripes.forEach((s, i) => {
      if (i % 2 === 0) return;
      const points = clipPolygon(
        [
          { x: s.x, y: v.y },
          { x: s.x + s.w, y: v.y },
          { x: s.x + s.w, y: v.y + v.h },
          { x: s.x, y: v.y + v.h },
        ],
        v,
      );
      if (points.length > 2) {
        shapes.push(poly(points, { fill: GRASS.stripeB, opacity: 0.55 }, true));
      }
    });
  }
  // Bord du terrain légèrement assombri (profondeur)
  shapes.push(
    rect(v.x, v.y, v.w, v.h, {
      fill: 'url(#tactix-vignette)',
      opacity: 0.9,
    }),
  );
  return shapes;
}

function markingShapes(pitch: PitchSpec): Shape[] {
  const markings = buildMarkings(pitch);
  const shapes: Shape[] = [];
  const view = pitch.view;
  const lw = GRASS.lineWidth * (pitch.marking === 'smallSided' ? 1.2 : 1);
  for (const shade of markings.shades) {
    const pts = clipPolygon(shade.points, view);
    if (pts.length > 2) shapes.push(poly(pts, { fill: GRASS.shade }, true));
  }
  for (const polyline of markings.lines) {
    for (const seg of clipPolyline(polyline, view)) {
      shapes.push(
        poly(seg, {
          stroke: GRASS.line,
          sw: lw,
          cap: 'round',
          join: 'round',
        }),
      );
    }
  }
  for (const spot of markings.spots) {
    if (spot.x < view.x - 0.2 || spot.x > view.x + view.w + 0.2) continue;
    shapes.push(circle(spot.x, spot.y, 0.22, { fill: GRASS.line }));
  }
  return shapes;
}

function gridShapes(pitch: PitchSpec, step: number | null): Shape[] {
  if (!step || step <= 0) return [];
  const v = pitch.view;
  const shapes: Shape[] = [];
  const startX = Math.ceil(v.x / step) * step;
  const startY = Math.ceil(v.y / step) * step;
  for (let x = startX; x <= v.x + v.w + 1e-6; x += step) {
    shapes.push(line({ x, y: v.y }, { x, y: v.y + v.h }, { stroke: 'rgba(244,247,245,0.10)', sw: SIZES.gridWidth }));
  }
  for (let y = startY; y <= v.y + v.h + 1e-6; y += step) {
    shapes.push(line({ x: v.x, y }, { x: v.x + v.w, y }, { stroke: 'rgba(244,247,245,0.10)', sw: SIZES.gridWidth }));
  }
  return shapes;
}

// ── Joueurs, ballons ─────────────────────────────────────────

function playerShapes(o: SceneObject, p: Point, selected: boolean, present: boolean): Shape[] {
  if (!p) return [];
  const r = SIZES.playerRadius * (present ? 1.08 : 1);
  const color = playerColor(o);
  const shapes: Shape[] = [];
  // ombre
  shapes.push(
    circle(p.x + 0.35, p.y + 0.5, r, { fill: 'rgba(0,0,0,0.28)', opacity: 0.55 }),
  );
  // anneau extérieur
  shapes.push(circle(p.x, p.y, r, { fill: C.bg, opacity: 0.9 }));
  // corps
  shapes.push(
    circle(p.x, p.y, r - 0.22, {
      fill: color,
      stroke: 'rgba(7,17,13,0.55)',
      sw: 0.22,
    }),
  );
  // reflet haut
  shapes.push(
    circle(p.x - r * 0.28, p.y - r * 0.32, r * 0.42, {
      fill: 'rgba(255,255,255,0.16)',
    }),
  );
  // gardien : anneau pointillé
  if (o.role === 'GK' || o.keeper) {
    shapes.push(
      circle(p.x, p.y, r + 0.55, {
        stroke: C.white,
        sw: 0.22,
        dash: '0.8 0.6',
        opacity: 0.75,
      }),
    );
  }
  // neutre : anneau fin
  if (o.team === 'neutral') {
    shapes.push(circle(p.x, p.y, r + 0.4, { stroke: C.orange, sw: 0.18, opacity: 0.8 }));
  }
  // numéro
  if (o.number) {
    shapes.push(
      text(p.x, p.y + 0.1, String(o.number), r * 1.22, {
        fill: 'rgba(0,0,0,0.35)',
        weight: 800,
      }),
    );
    shapes.push(text(p.x, p.y - 0.05, String(o.number), r * 1.2, { fill: C.white, weight: 800 }));
  }
  // verrou
  if (o.locked) {
    shapes.push(circle(p.x + r * 0.75, p.y + r * 0.75, r * 0.35, { fill: C.bg, opacity: 0.95 }));
    shapes.push(text(p.x + r * 0.75, p.y + r * 0.85, '🔒', r * 0.5, { fill: C.white }));
  }
  if (selected) {
    shapes.push(
      circle(p.x, p.y, r + 1.1, { stroke: withAlpha(C.green, 0.35), sw: 0.35 }),
      circle(p.x, p.y, r + 1.6, { stroke: C.green, sw: 0.16, dash: '0.7 0.9', opacity: 0.9 }),
    );
  }
  return shapes;
}

function ballShapes(cx: number, cy: number, r: number): Shape[] {
  return [
    circle(cx + r * 0.25, cy + r * 0.3, r, { fill: 'rgba(0,0,0,0.3)', opacity: 0.5 }),
    circle(cx, cy, r, { fill: '#FBFDFB', stroke: 'rgba(7,17,13,0.75)', sw: r * 0.18 }),
    circle(cx, cy, r * 0.34, { fill: '#111A15' }),
  ];
}

function labelPill(x: number, y: number, label: string, color: string = C.white): Shape[] {
  const w = Math.max(2.6, label.length * 1.12 + 1.6);
  const h = 3.1;
  return [
    rect(x - w / 2, y - h / 2, w, h, {
      rx: h / 2,
      fill: 'rgba(7,17,13,0.82)',
      stroke: withAlpha(color, 0.35),
      sw: 0.12,
    }),
    text(x, y + 0.9, label, 2.1, { fill: color, weight: 700 }),
  ];
}

// ── Buts ─────────────────────────────────────────────────────

function goalShapes(o: SceneObject, p: Point): Shape[] {
  if (!p) return [];
  const kind = o.goalKind ?? 'small';
  const size = GOAL_SIZES[kind];
  const w = size.width * (o.scale ?? 1);
  const d = size.depth * (o.scale ?? 1);
  // Repère local : bouche à l'origine, ouverture vers +x
  const local: Shape[] = [];
  const post = kind === 'large' ? 0.34 : 0.26;

  if (kind === 'large') {
    local.push(
      poly(
        [
          { x: 0, y: -w / 2 },
          { x: -d, y: -w / 2 },
          { x: -d, y: w / 2 },
          { x: 0, y: w / 2 },
        ],
        { fill: 'rgba(7,17,13,0.35)' },
        true,
      ),
    );
    // filet
    for (let i = 1; i < 10; i++) {
      const y = -w / 2 + (w * i) / 10;
      local.push(line({ x: 0, y }, { x: -d, y }, { stroke: 'rgba(244,247,245,0.30)', sw: 0.07 }));
    }
    for (let i = 1; i < 4; i++) {
      const x = -(d * i) / 4;
      local.push(line({ x, y: -w / 2 }, { x, y: w / 2 }, { stroke: 'rgba(244,247,245,0.22)', sw: 0.07 }));
    }
  } else {
    local.push(
      poly(
        [
          { x: 0, y: -w / 2 },
          { x: -d, y: -w / 2 },
          { x: -d, y: w / 2 },
          { x: 0, y: w / 2 },
        ],
        { fill: 'rgba(244,247,245,0.10)' },
        true,
      ),
    );
  }
  // poteaux + ligne de but
  local.push(
    poly(
      [
        { x: 0, y: -w / 2 },
        { x: -d, y: -w / 2 },
        { x: -d, y: w / 2 },
        { x: 0, y: w / 2 },
      ],
      { stroke: C.white, sw: post, cap: 'round', join: 'round', fill: 'none' },
    ),
  );

  return placeShapes(local, { at: p, rotate: o.rotation ?? 0, scale: 1 });
}

// ── Matériel ─────────────────────────────────────────────────

function equipmentShapes(o: SceneObject, p: Point): Shape[] {
  if (!p || !o.itemType) return [];
  const item = equipmentById(o.itemType);
  if (!item) return [];
  const s = o.scale ?? 1;
  const color = o.color;
  const local = equipmentGeometry(o.itemType, item.w, item.h, color);
  return placeShapes(local, { at: p, rotate: o.rotation ?? 0, scale: s });
}

function equipmentGeometry(id: string, w: number, h: number, color?: string): Shape[] {
  const halfW = w / 2;
  const halfH = h / 2;
  const base = color ?? C.orange;
  switch (id) {
    case 'plat':
      return [
        circle(0, 0, halfW * 0.85, { fill: base, stroke: 'rgba(7,17,13,0.4)', sw: 0.08 }),
        circle(0, 0, halfW * 0.35, { fill: 'rgba(255,255,255,0.35)' }),
      ];
    case 'coupelle':
      return [
        circle(0, 0, halfW, { fill: base, opacity: 0.9, stroke: 'rgba(7,17,13,0.4)', sw: 0.08 }),
      ];
    case 'cone':
      return [
        poly([{ x: 0, y: -halfH }, { x: halfW, y: halfH }, { x: -halfW, y: halfH }], {
          fill: base,
          stroke: 'rgba(7,17,13,0.4)',
          sw: 0.08,
        }, true),
      ];
    case 'coneGrand':
      return [
        poly([{ x: 0, y: -halfH }, { x: halfW, y: halfH }, { x: -halfW, y: halfH }], {
          fill: base,
          stroke: 'rgba(7,17,13,0.5)',
          sw: 0.1,
        }, true),
        poly([{ x: 0, y: -halfH * 0.2 }, { x: halfW * 0.55, y: halfH }, { x: -halfW * 0.55, y: halfH }], {
          fill: 'rgba(255,255,255,0.22)',
        }, true),
      ];
    case 'cerceau':
    case 'piquet':
    case 'jalon': {
      if (id === 'cerceau') {
        return [
          circle(0, 0, halfW, { stroke: base, sw: halfW * 0.22, fill: 'none' }),
        ];
      }
      return [
        circle(0, 0, halfW * 0.45, { fill: base, stroke: 'rgba(7,17,13,0.4)', sw: 0.08 }),
        line({ x: 0, y: halfH }, { x: 0, y: -halfH }, { stroke: base, sw: halfW * 0.3 }),
      ];
    }
    case 'echelle': {
      const shapes: Shape[] = [
        rect(-halfW, -halfH, w, h, { fill: 'rgba(255,255,255,0.10)', stroke: base, sw: 0.12, rx: 0.1 }),
      ];
      const rungs = 8;
      for (let i = 1; i < rungs; i++) {
        const x = -halfW + (w * i) / rungs;
        shapes.push(line({ x, y: -halfH }, { x, y: halfH }, { stroke: base, sw: 0.14 }));
      }
      return shapes;
    }
    case 'slalom': {
      const shapes: Shape[] = [];
      const n = 5;
      for (let i = 0; i < n; i++) {
        const x = -halfW + (w * i) / (n - 1);
        shapes.push(line({ x, y: halfH }, { x, y: -halfH }, { stroke: base, sw: 0.22, cap: 'round' }));
      }
      return shapes;
    }
    case 'miniHaie':
    case 'haie': {
      return [
        rect(-halfW, -halfH, w, h, { fill: withAlpha(base, 0.35), stroke: base, sw: 0.16, rx: 0.08 }),
        line({ x: -halfW * 0.6, y: halfH }, { x: -halfW * 0.6, y: halfH + 0.4 }, { stroke: base, sw: 0.16 }),
        line({ x: halfW * 0.6, y: halfH }, { x: halfW * 0.6, y: halfH + 0.4 }, { stroke: base, sw: 0.16 }),
      ];
    }
    case 'mannequin':
      return [
        rect(-halfW * 0.45, -halfH, halfW * 0.9, h, { fill: base, rx: halfW * 0.4, stroke: 'rgba(7,17,13,0.4)', sw: 0.1 }),
        circle(0, -halfH - 0.4, halfW * 0.34, { fill: base }),
      ];
    case 'slalomPiquets':
      return [circle(0, 0, halfW * 0.4, { fill: base })];
    case 'barriere':
    case 'mur':
      return [
        rect(-halfW, -halfH, w, h, { fill: withAlpha(base, 0.32), stroke: base, sw: 0.16, rx: 0.1 }),
      ];
    case 'corde':
      return [
        poly(
          [
            { x: -halfW, y: halfH * 0.5 },
            { x: -halfW * 0.5, y: -halfH * 0.5 },
            { x: 0, y: halfH * 0.5 },
            { x: halfW * 0.5, y: -halfH * 0.5 },
            { x: halfW, y: halfH * 0.5 },
          ],
          { stroke: base, sw: 0.18, fill: 'none' },
        ),
      ];
    case 'elastique':
      return [
        poly(
          [
            { x: -halfW, y: 0 },
            { x: -halfW * 0.4, y: -halfH },
            { x: halfW * 0.4, y: halfH },
            { x: halfW, y: 0 },
          ],
          { stroke: base, sw: 0.16, fill: 'none' },
        ),
      ];
    case 'banc':
      return [
        rect(-halfW, -halfH * 0.5, w, h, { fill: withAlpha(base, 0.4), stroke: base, sw: 0.14, rx: 0.12 }),
      ];
    case 'rebond':
      return [
        rect(-halfW, -halfH, w, h, { fill: 'rgba(61,139,255,0.22)', stroke: C.blue, sw: 0.16, rx: 0.12 }),
        line({ x: -halfW, y: 0 }, { x: halfW, y: 0 }, { stroke: C.blue, sw: 0.1, dash: '0.4 0.4' }),
      ];
    case 'cible':
      return [
        circle(0, 0, halfW, { stroke: C.red, sw: 0.16, fill: 'rgba(255,77,90,0.12)' }),
        circle(0, 0, halfW * 0.6, { stroke: C.red, sw: 0.14, fill: 'none' }),
        circle(0, 0, halfW * 0.25, { fill: C.red }),
      ];
    case 'murDeBallon':
      return [rect(-halfW, -halfH, w, h, { fill: withAlpha(base, 0.3), stroke: base, sw: 0.14, rx: 0.1 })];
    case 'porte':
      return [
        line({ x: -halfW, y: halfH }, { x: -halfW, y: -halfH }, { stroke: C.white, sw: 0.22 }),
        line({ x: halfW, y: halfH }, { x: halfW, y: -halfH }, { stroke: C.white, sw: 0.22 }),
        rect(-halfW, -halfH, w, h, { fill: 'rgba(244,247,245,0.06)' }),
      ];
    case 'miniBut': {
      const bw = Math.min(w, 2.4);
      return [
        rect(-bw / 2, -h / 2, bw, h, { fill: 'rgba(244,247,245,0.10)' }),
        poly(
          [
            { x: -bw / 2, y: h / 2 },
            { x: -bw / 2, y: -h / 2 },
            { x: bw / 2, y: -h / 2 },
            { x: bw / 2, y: h / 2 },
          ],
          { stroke: C.white, sw: 0.24, fill: 'none' },
        ),
      ];
    }
    case 'grandBut': {
      const bw = Math.min(w, 7.32);
      const bh = Math.min(h, 2.44);
      const shapes: Shape[] = [
        rect(-bw / 2, -bh / 2, bw, bh, { fill: 'rgba(244,247,245,0.08)' }),
      ];
      for (let i = 1; i < 8; i++) {
        const x = -bw / 2 + (bw * i) / 8;
        shapes.push(line({ x, y: -bh / 2 }, { x, y: bh / 2 }, { stroke: 'rgba(244,247,245,0.25)', sw: 0.06 }));
      }
      shapes.push(
        poly(
          [
            { x: -bw / 2, y: bh / 2 },
            { x: -bw / 2, y: -bh / 2 },
            { x: bw / 2, y: -bh / 2 },
            { x: bw / 2, y: bh / 2 },
          ],
          { stroke: C.white, sw: 0.3, fill: 'none' },
        ),
      );
      return shapes;
    }
    case 'ballons':
      return [
        circle(-halfW * 0.5, 0, halfW * 0.55, { fill: '#FBFDFB', stroke: 'rgba(7,17,13,0.7)', sw: 0.1 }),
        circle(halfW * 0.5, halfH * 0.4, halfW * 0.55, { fill: '#FBFDFB', stroke: 'rgba(7,17,13,0.7)', sw: 0.1 }),
      ];
    case 'zone':
      return [
        rect(-halfW, -halfH, w, h, {
          fill: withAlpha(color ?? C.green, 0.12),
          stroke: withAlpha(color ?? C.green, 0.55),
          sw: 0.16,
          dash: '0.9 0.7',
        }),
      ];
    default:
      return [circle(0, 0, halfW * 0.8, { fill: base, opacity: 0.85 })];
  }
}

function zoneShapes(o: SceneObject, p: Point): Shape[] {
  if (!p) return [];
  const w = o.zoneW ?? 10;
  const h = o.zoneH ?? 10;
  const color = o.zoneColor ?? o.color ?? C.green;
  return placeShapes(
    [
      rect(-w / 2, -h / 2, w, h, {
        rx: 0.4,
        fill: withAlpha(color, 0.1),
        stroke: withAlpha(color, 0.5),
        sw: 0.16,
        dash: '1.1 0.8',
      }),
    ],
    { at: p, rotate: o.rotation ?? 0 },
  );
}

// ── Trajectoires ─────────────────────────────────────────────

function dashFor(style: LineStyle): string | undefined {
  if (style === 'dashed') return '1.5 1.1';
  if (style === 'dotted') return '0.16 1.0';
  return undefined;
}

/** Portion visible d'un tracé selon l'avancement (animation). */
export function partialPath(points: Point[], t: number): Point[] {
  if (t >= 1) return points;
  const total = polylineLength(points);
  const target = total * Math.max(0, t);
  const out: Point[] = [points[0]];
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + d <= target) {
      out.push(b);
      acc += d;
    } else {
      const r = (target - acc) / (d || 1e-9);
      out.push({ x: a.x + (b.x - a.x) * r, y: a.y + (b.y - a.y) * r });
      return out;
    }
  }
  return out;
}

function actionShapes(
  action: Action,
  progressT: number,
  opts: { selected: boolean; present: boolean; showDistance: boolean; ownerPos?: Point },
): Shape[] {
  const desc = actionDescriptor(action.type);
  const color = action.color ?? desc.color;
  const full = actionPath(action);
  const path = partialPath(full, progressT);
  const width = SIZES.actionWidth * (opts.present ? 1.35 : 1);
  const shapes: Shape[] = [];
  const isBallAction = desc.ball;
  const dash = dashFor(action.style);

  // Liseré sombre pour la lisibilité sur l'herbe
  shapes.push(
    poly(path, {
      stroke: 'rgba(7,17,13,0.45)',
      sw: width * 1.9,
      dash,
      opacity: 0.5,
      cap: 'round',
    }),
  );
  shapes.push(poly(path, { stroke: color, sw: width, dash, cap: 'round', opacity: 0.98 }));

  if (action.arrow && path.length >= 2) {
    const end = path[path.length - 1];
    const before = path[path.length - 2] ?? path[0];
    const size = opts.present ? 2.9 : 2.4;
    shapes.push(poly(arrowHead(end, before, size), { fill: color }, true));
  }

  // Pastille de départ pour les actions ballon
  if (isBallAction && opts.ownerPos) {
    shapes.push(
      circle(opts.ownerPos.x, opts.ownerPos.y, 0.55, {
        fill: color,
        opacity: progressT > 0.02 ? 0.35 : 0.85,
      }),
    );
  }

  if (opts.selected) {
    shapes.push(
      poly(path, {
        stroke: withAlpha(C.green, 0.55),
        sw: width * 2.6,
        opacity: 0.35,
        dash,
        cap: 'round',
      }),
    );
  }

  if (opts.showDistance && progressT > 0.55) {
    const mid = path[Math.floor(path.length / 2)];
    const label = `${actionLength(action).toFixed(1)} m`;
    shapes.push(
      text(mid.x, mid.y - 1.4, label, 2.0, {
        fill: color,
        weight: 700,
      }),
    );
  }
  return shapes;
}

// ── Guides, sélection, aperçus ───────────────────────────────

function guideShapes(g: Guide, pitch: PitchSpec): Shape[] {
  const v = pitch.view;
  const range = g.axis === 'x' ? { a: v.y, b: v.y + v.h } : { a: v.x, b: v.x + v.w };
  const color = g.kind === 'pitch' ? C.blue : C.green;
  const points: Point[] =
    g.axis === 'x'
      ? [
          { x: g.value, y: range.a },
          { x: g.value, y: range.b },
        ]
      : [
          { x: range.a, y: g.value },
          { x: range.b, y: g.value },
        ];
  return [
    poly(points, { stroke: color, sw: SIZES.guideWidth * 1.6, dash: '1.2 1.0', opacity: 0.85 }),
  ];
}

function selectionShapes(o: SceneObject, p: Point): Shape[] {
  if (!p) return [];
  const r = objectPickRadius(o);
  const style: Style = { stroke: C.green, sw: 0.28, fill: 'none', dash: '1 0.7' };
  return [
    circle(p.x, p.y, r + 0.5, style),
    circle(p.x, p.y, r + 1.2, { stroke: withAlpha(C.green, 0.25), sw: 0.2, fill: 'none' }),
  ];
}

function ghostShapes(
  ghost: { x: number; y: number; kind: SceneObject['kind']; itemType?: string; goalKind?: string },
  pitch: PitchSpec,
): Shape[] {
  const p = { x: ghost.x, y: ghost.y };
  if (ghost.kind === 'player') {
    return [
      circle(p.x, p.y, SIZES.playerRadius, {
        fill: withAlpha(C.green, 0.25),
        stroke: C.green,
        sw: 0.3,
        dash: '0.8 0.6',
      }),
    ];
  }
  if (ghost.kind === 'ball') {
    return [circle(p.x, p.y, SIZES.ballRadius, { fill: 'rgba(244,247,245,0.5)' })];
  }
  if (ghost.kind === 'equipment' && ghost.itemType) {
    const item = equipmentById(ghost.itemType);
    const shapes = equipmentGeometry(ghost.itemType, item?.w ?? 2, item?.h ?? 2, C.green);
    return placeShapes(
      shapes.map((s) => ({ ...s, opacity: 0.55 })),
      { at: p },
    );
  }
  if (ghost.kind === 'goal') {
    const size = GOAL_SIZES[(ghost.goalKind as keyof typeof GOAL_SIZES) ?? 'small'];
    return [
      rect(p.x - size.depth, p.y - size.width / 2, size.depth, size.width, {
        fill: withAlpha(C.green, 0.2),
        stroke: C.green,
        sw: 0.2,
        dash: '0.8 0.6',
      }),
    ];
  }
  if (ghost.kind === 'zone') {
    return [
      rect(p.x - 5, p.y - 5, 10, 10, {
        fill: withAlpha(C.green, 0.12),
        stroke: C.green,
        sw: 0.2,
        dash: '1 0.8',
      }),
    ];
  }
  void pitch;
  return [];
}

// ── Définitions SVG (dégradés) ───────────────────────────────

function defsFor(pitch: PitchSpec): string {
  const v = pitch.view;
  const vignetteId = 'tactix-vignette';
  return `
<linearGradient id="tactix-grass" x1="${v.x}" y1="${v.y}" x2="${v.x + v.w}" y2="${v.y + v.h}" gradientUnits="userSpaceOnUse">
  <stop offset="0%" stop-color="${GRASS.stripeA}"/>
  <stop offset="45%" stop-color="${GRASS.base}"/>
  <stop offset="100%" stop-color="${GRASS.stripeB}"/>
</linearGradient>
<radialGradient id="${vignetteId}" cx="50%" cy="45%" r="75%">
  <stop offset="45%" stop-color="rgba(0,0,0,0)"/>
  <stop offset="100%" stop-color="${GRASS.vignette}"/>
</radialGradient>`;
}

/** Position « écran » d'un point monde (utilitaire pour l'export). */
export function screenPoint(p: Point, pitch: PitchSpec): Point {
  return worldToScreen(p, pitch);
}

export function worldPoint(p: Point, pitch: PitchSpec): Point {
  return screenToWorld(p, pitch);
}

export function rectToPoints(r: Rect): Point[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
}

export function shiftPath(d: string, dx: number, dy: number): string {
  return translatePath(d, { x: dx, y: dy });
}
