import type { PitchTemplateId } from './types';

// ─────────────────────────────────────────────────────────────
// Formats de jeu — tous disponibles, 1v1 → 11v11 (le 11v11 reste
// accessible en permanence, y compris depuis le mode simple).
// ─────────────────────────────────────────────────────────────

export interface GameFormat {
  id: string;
  label: string;
  home: number;
  away: number;
  recommendedPitch: PitchTemplateId;
}

const F = (
  home: number,
  away: number,
  recommendedPitch: PitchTemplateId,
): GameFormat => ({
  id: `${home}v${away}`,
  label: `${home} contre ${away}`,
  home,
  away,
  recommendedPitch,
});

export const GAME_FORMATS: GameFormat[] = [
  F(1, 1, 'reduced'),
  F(2, 1, 'reduced'),
  F(2, 2, 'custom'),
  F(3, 2, 'custom'),
  F(3, 3, 'custom'),
  F(4, 2, 'half'),
  F(4, 3, 'half'),
  F(4, 4, 'half'),
  F(5, 3, 'half'),
  F(5, 4, 'threeQuarter'),
  F(5, 5, 'threeQuarter'),
  F(6, 4, 'threeQuarter'),
  F(6, 5, 'threeQuarter'),
  F(6, 6, 'threeQuarter'),
  F(7, 7, 'threeQuarter'),
  F(8, 8, 'full'),
  F(9, 9, 'full'),
  F(11, 11, 'full'),
];

export const FORMAT_IDS = GAME_FORMATS.map((f) => f.id);

export function formatById(id: string): GameFormat | undefined {
  return GAME_FORMATS.find((f) => f.id === id);
}

export function formatLabel(id: string): string {
  const f = formatById(id);
  return f ? `${f.home}v${f.away}` : id;
}

/** Contraintes connues : combien de joueurs de champ + gardien. */
export const FORMAT_GROUPS: { title: string; ids: string[] }[] = [
  { title: 'Duels & infériorités', ids: ['1v1', '2v1', '2v2', '3v2', '3v3'] },
  { title: 'Jeu réduit', ids: ['4v2', '4v3', '4v4', '5v3', '5v4', '5v5'] },
  { title: 'Jeu dirigé', ids: ['6v4', '6v5', '6v6', '7v7', '8v8'] },
  { title: 'Jeu complet', ids: ['9v9', '11v11'] },
];
