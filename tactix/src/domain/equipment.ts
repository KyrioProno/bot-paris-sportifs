// ─────────────────────────────────────────────────────────────
// Bibliothèque de matériel d'entraînement.
// Chaque élément possède un rendu vectoriel dédié et des dimensions
// réelles approximatives (en mètres) pour respecter les proportions
// du terrain.
// ─────────────────────────────────────────────────────────────

export type EquipmentCategory =
  | 'repères'
  | 'gammes'
  | 'obstacles'
  | 'structures'
  | 'espaces';

export interface EquipmentItem {
  id: string;
  label: string;
  category: EquipmentCategory;
  /** Taille visuelle (longueur, largeur) en mètres. */
  w: number;
  h: number;
  emoji: string;
  /** Compteur de séries pour le bouton « Répéter ». */
  repeatable?: boolean;
}

export const EQUIPMENT: EquipmentItem[] = [
  { id: 'plat', label: 'Plot', category: 'repères', w: 1.2, h: 1.2, emoji: '🟠', repeatable: true },
  { id: 'coupelle', label: 'Coupelle', category: 'repères', w: 0.9, h: 0.9, emoji: '🔘', repeatable: true },
  { id: 'cone', label: 'Cône', category: 'repères', w: 1.2, h: 1.2, emoji: '🔺', repeatable: true },
  { id: 'coneGrand', label: 'Grand cône', category: 'repères', w: 1.8, h: 1.8, emoji: '🔻', repeatable: true },
  { id: 'cerceau', label: 'Cerceau', category: 'gammes', w: 1.8, h: 1.8, emoji: '⭕', repeatable: true },
  { id: 'echelle', label: 'Échelle de rythme', category: 'gammes', w: 6, h: 0.6, emoji: '🪜' },
  { id: 'miniHaie', label: 'Mini-haie', category: 'obstacles', w: 1.6, h: 0.6, emoji: '🚧', repeatable: true },
  { id: 'haie', label: 'Haie', category: 'obstacles', w: 2.2, h: 0.8, emoji: '🚧', repeatable: true },
  { id: 'piquet', label: 'Piquet', category: 'repères', w: 0.8, h: 0.8, emoji: '📍', repeatable: true },
  { id: 'mannequin', label: 'Mannequin', category: 'obstacles', w: 1.6, h: 0.9, emoji: '🧍', repeatable: true },
  { id: 'jalon', label: 'Jalon', category: 'repères', w: 0.7, h: 0.7, emoji: '📌', repeatable: true },
  { id: 'slalom', label: 'Slalom', category: 'gammes', w: 6, h: 1.2, emoji: '〰️', repeatable: true },
  { id: 'barriere', label: 'Barrière', category: 'structures', w: 3, h: 0.8, emoji: '🚧' },
  { id: 'corde', label: 'Corde', category: 'structures', w: 8, h: 0.4, emoji: '🧵' },
  { id: 'elastique', label: 'Élastique', category: 'structures', w: 6, h: 0.4, emoji: '➰' },
  { id: 'banc', label: 'Banc', category: 'structures', w: 2.5, h: 0.7, emoji: '🛋️' },
  { id: 'rebond', label: 'Rebond', category: 'structures', w: 2, h: 1, emoji: '🧱' },
  { id: 'cible', label: 'Cible', category: 'repères', w: 2, h: 2, emoji: '🎯' },
  { id: 'mur', label: 'Mur', category: 'structures', w: 4, h: 0.6, emoji: '🧱' },
  { id: 'porte', label: 'Porte', category: 'structures', w: 3, h: 1, emoji: '🚪' },
  { id: 'miniBut', label: 'Mini-but', category: 'structures', w: 1.5, h: 0.8, emoji: '🥅' },
  { id: 'grandBut', label: 'Grand but', category: 'structures', w: 7.32, h: 2.2, emoji: '🥅' },
  { id: 'ballons', label: 'Ballons', category: 'repères', w: 1.4, h: 1.4, emoji: '⚽' },
  { id: 'zone', label: 'Zone colorée', category: 'espaces', w: 10, h: 10, emoji: '🟩' },
];

export const EQUIPMENT_CATEGORIES: { id: EquipmentCategory; label: string }[] = [
  { id: 'repères', label: 'Repères' },
  { id: 'gammes', label: 'Gammes' },
  { id: 'obstacles', label: 'Obstacles' },
  { id: 'structures', label: 'Structures' },
  { id: 'espaces', label: 'Espaces' },
];

export function equipmentById(id: string): EquipmentItem | undefined {
  return EQUIPMENT.find((e) => e.id === id);
}

export function materialLabel(id: string): string {
  return equipmentById(id)?.label ?? id;
}
