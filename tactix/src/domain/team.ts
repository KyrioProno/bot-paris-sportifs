import type {
  PitchSpec,
  PlayerRole,
  Point,
  SceneObject,
  Step,
  TactixDoc,
  Team,
} from './types';
import { createPitch } from './pitch/dimensions';
import { uid } from './actions';
import { genericFormation, formationById, withKeeper, type Formation } from './formations';
import { clamp } from './geometry';

// ─────────────────────────────────────────────────────────────
// Joueurs, équipes, formations.
// ─────────────────────────────────────────────────────────────

export const TEAM_COLORS: Record<Team, string> = {
  home: '#3D8BFF',
  away: '#FF4D5A',
  neutral: '#FFAA3D',
};

export const GOALKEEPER_COLORS: Record<Team, string> = {
  home: '#20E67A',
  away: '#FFD166',
  neutral: '#FFAA3D',
};

export const TEAM_LABELS: Record<Team, string> = {
  home: 'Équipe',
  away: 'Adversaire',
  neutral: 'Neutre',
};

export function isPlayer(o: SceneObject): boolean {
  return o.kind === 'player';
}

export function playerColor(o: SceneObject): string {
  if (o.color) return o.color;
  const team = (o.team ?? 'home') as Team;
  if (o.role === 'GK') return GOALKEEPER_COLORS[team];
  return TEAM_COLORS[team];
}

export function makePlayer(
  team: Team,
  number: number,
  x: number,
  y: number,
  extra: Partial<SceneObject> = {},
): SceneObject {
  return {
    id: uid('p'),
    kind: 'player',
    team,
    number,
    name: '',
    role: team === 'away' ? 'DC' : 'MC',
    showName: false,
    x,
    y,
    ...extra,
  };
}

export function makeBall(x: number, y: number, ownerId: string | null = null): SceneObject {
  return { id: uid('b'), kind: 'ball', x, y, ownerId };
}

export function playersOf(doc: TactixDoc, team?: Team): SceneObject[] {
  return doc.objects.filter(
    (o) => o.kind === 'player' && (team === undefined || o.team === team),
  );
}

export function ballsOf(doc: TactixDoc): SceneObject[] {
  return doc.objects.filter((o) => o.kind === 'ball');
}

export function objectById(doc: TactixDoc, id: string): SceneObject | undefined {
  return doc.objects.find((o) => o.id === id);
}

export function nextFreeNumber(doc: TactixDoc, team: Team): number {
  const used = new Set(
    playersOf(doc, team)
      .map((p) => p.number ?? 0)
      .filter((n) => n > 0),
  );
  for (let n = 1; n <= 99; n++) if (!used.has(n)) return n;
  return 1;
}

/** Position par défaut d'un nouveau joueur : en dehors de la zone dense. */
export function spawnPosition(doc: TactixDoc, team: Team): Point {
  const v = doc.pitch.view;
  const count = playersOf(doc, team).length;
  const col = count % 5;
  const row = Math.floor(count / 5);
  const baseX = team === 'away' ? v.x + v.w * 0.62 : v.x + v.w * 0.3;
  return {
    x: clamp(baseX + col * (v.w * 0.045), v.x + 2, v.x + v.w - 2),
    y: clamp(v.y + v.h * 0.18 + col * (v.h * 0.14) + row * (v.h * 0.1), v.y + 2, v.y + v.h - 2),
  };
}

// ── Formations ───────────────────────────────────────────────

/**
 * Projette une formation dans la zone visible.
 * L'équipe `home` occupe la fenêtre visible, l'équipe `away` est
 * projetée en miroir (elle attaque dans l'autre sens).
 */
/**
 * Bandes de terrain par équipe : sur un terrain complet chaque équipe
 * reste dans sa moitié ; sur un terrain partiel les deux équipes se
 * partagent la zone visible (défenseurs côté but, attaquants devant).
 */
export function teamBands(pitch: PitchSpec): { home: [number, number]; away: [number, number] } {
  const fullPitch = pitch.view.w >= pitch.length * 0.85;
  return fullPitch
    ? { home: [0.03, 0.47], away: [0.53, 0.97] }
    : { home: [0.05, 0.72], away: [0.6, 0.98] };
}

export function formationPositions(
  pitch: PitchSpec,
  formation: Formation,
  team: Team,
  slotCount: number,
): Point[] {
  const v = pitch.view;
  const bands = teamBands(pitch);
  const [b0, b1] = team === 'home' ? bands.home : bands.away;
  const usableY = v.h * 0.84;
  const slots = formation.slots.slice(0, slotCount);
  while (slots.length < slotCount) {
    const extra = slotCount - slots.length;
    slots.push({
      role: 'MC',
      nx: 0.5,
      ny: 0.5 + (extra % 2 === 0 ? 0.12 : -0.12) * Math.ceil(extra / 2),
    });
  }
  return slots.map((slot) => {
    // L'équipe « away » défend l'autre but : sa profondeur est inversée.
    const depth = team === 'home' ? slot.nx : 1 - slot.nx;
    const nx = clamp(b0 + (b1 - b0) * depth, 0.01, 0.99);
    const ny = clamp(slot.ny, 0.04, 0.96);
    return {
      x: v.x + v.w * nx,
      y: v.y + v.h * 0.08 + usableY * ny,
    };
  });
}

/**
 * Écarte les joueurs trop proches (mise en place initiale uniquement :
 * le coach reste libre de ses placements manuels ensuite).
 */
export function spreadPlayers(objects: SceneObject[], pitch: PitchSpec, minDist = 4): SceneObject[] {
  const v = pitch.view;
  const players = objects.filter((o) => o.kind === 'player');
  const result = players.map((p) => ({ x: p.x, y: p.y }));
  for (let iter = 0; iter < 24; iter++) {
    let moved = false;
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const dx = result[j].x - result[i].x;
        const dy = result[j].y - result[i].y;
        const d = Math.hypot(dx, dy) || 0.001;
        if (d >= minDist) continue;
        const push = (minDist - d) / 2;
        const ux = dx / d;
        const uy = dy / d;
        result[i].x -= ux * push;
        result[i].y -= uy * push;
        result[j].x += ux * push;
        result[j].y += uy * push;
        moved = true;
      }
    }
    for (const p of result) {
      p.x = clamp(p.x, v.x + 1, v.x + v.w - 1);
      p.y = clamp(p.y, v.y + 1, v.y + v.h - 1);
    }
    if (!moved) break;
  }
  let index = 0;
  return objects.map((o) => {
    if (o.kind !== 'player') return o;
    const p = result[index++];
    return { ...o, x: p.x, y: p.y };
  });
}

export function applyFormation(doc: TactixDoc, formationId: string, team: Team): TactixDoc {
  const players = playersOf(doc, team);
  if (players.length === 0) return doc;
  const hasGK = players.some((p) => p.role === 'GK' || p.keeper);
  const named = formationById(formationId);
  let formation: Formation;
  if (named) {
    formation = named;
  } else {
    const fieldCount = Math.max(1, hasGK ? players.length - 1 : players.length);
    formation = genericFormation(fieldCount);
    if (hasGK) formation = withKeeper(formation);
  }
  // Le gardien est toujours placé en premier.
  const ordered = [...players].sort((a, b) => {
    const ak = a.role === 'GK' || a.keeper ? -1 : (a.number ?? 0);
    const bk = b.role === 'GK' || b.keeper ? -1 : (b.number ?? 0);
    return ak - bk;
  });
  const positions = formationPositions(doc.pitch, formation, team, ordered.length);
  const updates = new Map<string, { pos: Point; role: PlayerRole }>();
  ordered.forEach((p, i) => {
    updates.set(p.id, { pos: positions[i], role: formation.slots[i]?.role ?? p.role ?? 'MC' });
  });
  const placed = doc.objects.map((o) => {
    const u = updates.get(o.id);
    return u ? { ...o, x: u.pos.x, y: u.pos.y, role: u.role } : o;
  });
  // On n'écarte que les joueurs de la même équipe (les duels restent serrés).
  const others = placed.filter((o) => o.kind === 'player' && o.team !== team);
  const spread = spreadPlayers(
    placed.filter((o) => o.kind === 'player' && o.team === team),
    doc.pitch,
    4,
  );
  const merged = placed.map((o) => {
    if (o.kind !== 'player' || o.team !== team) return o;
    return spread.find((s) => s.id === o.id) ?? o;
  });
  void others;
  return resetStepZero({ ...doc, objects: merged });
}

/** Réaligne l'étape 0 sur les positions « de base » des objets. */
export function resetStepZero(doc: TactixDoc): TactixDoc {
  const steps = doc.steps.slice();
  if (steps.length === 0) return doc;
  const positions: Record<string, Point> = {};
  const ballOwners: Record<string, string | null> = {};
  for (const o of doc.objects) positions[o.id] = { x: o.x, y: o.y };
  for (const o of doc.objects) if (o.kind === 'ball') ballOwners[o.id] = o.ownerId ?? null;
  steps[0] = { ...steps[0], positions, ballOwners, actions: [] };
  return { ...doc, steps };
}

// ── Format de jeu ────────────────────────────────────────────

/**
 * Applique un format de jeu SANS casser l'exercice : les joueurs en
 * trop sont retirés (les trajectoires liées suivent), les manquants
 * sont ajoutés à des positions cohérentes.
 */
export function targetCounts(
  homeCount: number,
  awayCount: number,
  hasKeeper: boolean,
): { home: number; away: number } {
  const k = hasKeeper ? 1 : 0;
  return {
    home: Math.max(1, homeCount - k),
    away: Math.max(0, awayCount - k),
  };
}

export function formationForCount(): string {
  return 'auto';
}

export function defaultPitch(template: TactixDoc['pitch']['template'] = 'half'): PitchSpec {
  return createPitch(template, 'horizontal');
}

export function stepHasActions(step: Step): boolean {
  return step.actions.length > 0;
}
