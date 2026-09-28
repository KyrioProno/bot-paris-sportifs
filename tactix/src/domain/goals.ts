import type { GoalConfigId, GoalKind, PitchSpec, SceneObject } from './types';

// ─────────────────────────────────────────────────────────────
// Buts : types, dimensions réelles, configurations prédéfinies.
// ─────────────────────────────────────────────────────────────

export const GOAL_SIZES: Record<GoalKind, { width: number; depth: number; label: string }> = {
  large: { width: 7.32, depth: 2.2, label: 'Grand but (7,32 m)' },
  small: { width: 3, depth: 0.9, label: 'Petit but (3 m)' },
  mini: { width: 1.5, depth: 0.6, label: 'Mini-but (1,5 m)' },
};

export interface GoalConfig {
  id: GoalConfigId;
  label: string;
  hint: string;
  emoji: string;
}

export const GOAL_CONFIGS: GoalConfig[] = [
  { id: 'none', label: 'Aucun', hint: 'Aucun but sur le terrain', emoji: '🚫' },
  { id: 'oneLarge', label: '1 grand but', hint: 'Un but avec gardien possible', emoji: '🥅' },
  { id: 'oneLargeKeeper', label: '1 grand but + gardien', hint: 'Grand but et son gardien', emoji: '🧤' },
  { id: 'twoLarge', label: '2 grands buts', hint: 'Terrain complet, 11 contre 11', emoji: '🏟️' },
  { id: 'twoSmall', label: '2 petits buts', hint: 'Un à chaque extrémité', emoji: '🎯' },
  { id: 'twoSmallSides', label: '2 petits buts latéraux', hint: 'Sur les côtés (transition)', emoji: '↔️' },
  { id: 'fourSmall', label: '4 petits buts', hint: 'Un à chaque coin', emoji: '🔲' },
  { id: 'oneLargeTwoSmall', label: '1 grand but + 2 petits', hint: 'Finition + transition', emoji: '🏟️' },
];

export function goalConfigLabel(id: GoalConfigId): string {
  return GOAL_CONFIGS.find((c) => c.id === id)?.label ?? id;
}

let goalSeq = 0;
export function goalId() {
  goalSeq += 1;
  return `goal_${Date.now().toString(36)}_${goalSeq}`;
}

function makeGoal(
  kind: GoalKind,
  x: number,
  y: number,
  rotation: number,
): SceneObject {
  return {
    id: goalId(),
    kind: 'goal',
    goalKind: kind,
    x,
    y,
    rotation,
  };
}

/**
 * Construit les buts d'une configuration, positionnés dans la fenêtre
 * visible du terrain. Utilise le repère monde (mètres).
 */
export function buildGoals(config: GoalConfigId, pitch: PitchSpec): SceneObject[] {
  const v = pitch.view;
  const cx = pitch.width / 2;
  // `attackEnd` = but attaqué (à droite), `backEnd` = extrémité opposée.
  const attackEnd = v.x + v.w;
  const backEnd = v.x;
  const midX = v.x + v.w / 2;

  switch (config) {
    case 'none':
      return [];
    case 'oneLarge':
      return [makeGoal('large', attackEnd, cx, 180)];
    case 'oneLargeKeeper':
      return [makeGoal('large', attackEnd, cx, 180)];
    case 'twoLarge':
      return [makeGoal('large', attackEnd, cx, 180), makeGoal('large', backEnd, cx, 0)];
    case 'twoSmall':
      return [makeGoal('small', attackEnd, cx, 180), makeGoal('small', backEnd, cx, 0)];
    case 'twoSmallSides':
      return [
        makeGoal('small', midX, v.y + v.h * 0.015, 90),
        makeGoal('small', midX, v.y + v.h * 0.985, 270),
      ];
    case 'fourSmall':
      return [
        makeGoal('small', backEnd, v.y + v.h * 0.1, 0),
        makeGoal('small', backEnd, v.y + v.h * 0.9, 0),
        makeGoal('small', attackEnd, v.y + v.h * 0.1, 180),
        makeGoal('small', attackEnd, v.y + v.h * 0.9, 180),
      ];
    case 'oneLargeTwoSmall':
      return [
        makeGoal('large', attackEnd, cx, 180),
        makeGoal('small', backEnd, v.y + v.h * 0.08, 0),
        makeGoal('small', backEnd, v.y + v.h * 0.92, 0),
      ];
    default:
      return [];
  }
}

/** Position du gardien pour un grand but (devant la bouche du but). */
export function keeperPosition(pitch: PitchSpec): { x: number; y: number } {
  const v = pitch.view;
  return { x: v.x + v.w - Math.min(4, v.w * 0.1), y: pitch.width / 2 };
}

/** La configuration demande-t-elle un gardien ? */
export function configNeedsKeeper(config: GoalConfigId): boolean {
  return config === 'oneLargeKeeper';
}

/** Le grand but est-il présent ? (pour les exercices de finition) */
export function hasLargeGoal(config: GoalConfigId): boolean {
  return (
    config === 'oneLarge' ||
    config === 'oneLargeKeeper' ||
    config === 'oneLargeTwoSmall' ||
    config === 'twoLarge'
  );
}
