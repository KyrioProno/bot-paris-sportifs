import type { SessionBlockId } from './types';

// ─────────────────────────────────────────────────────────────
// Séances : blocs d'entraînement types.
// ─────────────────────────────────────────────────────────────

export interface SessionBlock {
  id: SessionBlockId;
  label: string;
  emoji: string;
  color: string;
  hint: string;
  defaultMinutes: number;
}

export const BLOCKS: SessionBlock[] = [
  {
    id: 'warmup',
    label: 'Échauffement',
    emoji: '🔥',
    color: '#FFAA3D',
    hint: 'Mise en train, mobilité, activation',
    defaultMinutes: 15,
  },
  {
    id: 'technique',
    label: 'Technique',
    emoji: '⚙️',
    color: '#20E67A',
    hint: 'Passe, contrôle, conduite, finition',
    defaultMinutes: 20,
  },
  {
    id: 'tactics',
    label: 'Tactique',
    emoji: '🧠',
    color: '#3D8BFF',
    hint: 'Organisation, pressing, transitions',
    defaultMinutes: 25,
  },
  {
    id: 'finishing',
    label: 'Finition',
    emoji: '🎯',
    color: '#FF6B4A',
    hint: 'Frappes, centres, derniers gestes',
    defaultMinutes: 20,
  },
  {
    id: 'game',
    label: 'Jeu',
    emoji: '⚽',
    color: '#A78BFA',
    hint: 'Jeu libre ou dirigé, match',
    defaultMinutes: 25,
  },
];

export function blockById(id: SessionBlockId): SessionBlock {
  return BLOCKS.find((b) => b.id === id) ?? BLOCKS[0];
}

export function blockLabel(id: SessionBlockId): string {
  return blockById(id).label;
}

export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m}`;
}
