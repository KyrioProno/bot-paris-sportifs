import type { PlayerRole } from './types';

// ─────────────────────────────────────────────────────────────
// Formations prédéfinies.
// Coordonnées normalisées : nx = 0 (but adverse visé à l'opposé),
// nx = 1 (camp adverse), ny = 0..1 (touchline → touchline).
// La projection dans le terrain est calculée par domain/team.ts.
// ─────────────────────────────────────────────────────────────

export interface FormationSlot {
  role: PlayerRole;
  nx: number;
  ny: number;
}

export interface Formation {
  id: string;
  label: string;
  family: '4' | '3' | '5';
  slots: FormationSlot[];
}

const s = (role: PlayerRole, nx: number, ny: number): FormationSlot => ({ role, nx, ny });

export const FORMATIONS: Formation[] = [
  {
    id: '4-3-3',
    label: '4-3-3',
    family: '4',
    slots: [
      s('GK', 0.05, 0.5),
      s('DD', 0.26, 0.14),
      s('DC', 0.22, 0.38),
      s('DC', 0.22, 0.62),
      s('DG', 0.26, 0.86),
      s('MC', 0.48, 0.3),
      s('MDC', 0.42, 0.5),
      s('MC', 0.48, 0.7),
      s('AD', 0.76, 0.16),
      s('AC', 0.82, 0.5),
      s('AG', 0.76, 0.84),
    ],
  },
  {
    id: '4-4-2',
    label: '4-4-2',
    family: '4',
    slots: [
      s('GK', 0.05, 0.5),
      s('DD', 0.26, 0.14),
      s('DC', 0.22, 0.38),
      s('DC', 0.22, 0.62),
      s('DG', 0.26, 0.86),
      s('AD', 0.52, 0.14),
      s('MC', 0.5, 0.38),
      s('MC', 0.5, 0.62),
      s('AG', 0.52, 0.86),
      s('AC', 0.78, 0.4),
      s('AC', 0.78, 0.6),
    ],
  },
  {
    id: '4-2-3-1',
    label: '4-2-3-1',
    family: '4',
    slots: [
      s('GK', 0.05, 0.5),
      s('DD', 0.26, 0.14),
      s('DC', 0.22, 0.38),
      s('DC', 0.22, 0.62),
      s('DG', 0.26, 0.86),
      s('MDC', 0.42, 0.38),
      s('MDC', 0.42, 0.62),
      s('AD', 0.64, 0.16),
      s('MOC', 0.62, 0.5),
      s('AG', 0.64, 0.84),
      s('AC', 0.85, 0.5),
    ],
  },
  {
    id: '3-5-2',
    label: '3-5-2',
    family: '3',
    slots: [
      s('GK', 0.05, 0.5),
      s('DC', 0.22, 0.28),
      s('DC', 0.2, 0.5),
      s('DC', 0.22, 0.72),
      s('DD', 0.5, 0.08),
      s('MC', 0.46, 0.32),
      s('MDC', 0.42, 0.5),
      s('MC', 0.46, 0.68),
      s('DG', 0.5, 0.92),
      s('AC', 0.78, 0.38),
      s('AC', 0.78, 0.62),
    ],
  },
  {
    id: '3-4-3',
    label: '3-4-3',
    family: '3',
    slots: [
      s('GK', 0.05, 0.5),
      s('DC', 0.22, 0.28),
      s('DC', 0.2, 0.5),
      s('DC', 0.22, 0.72),
      s('DD', 0.5, 0.12),
      s('MC', 0.46, 0.38),
      s('MC', 0.46, 0.62),
      s('DG', 0.5, 0.88),
      s('AD', 0.78, 0.2),
      s('AC', 0.82, 0.5),
      s('AG', 0.78, 0.8),
    ],
  },
  {
    id: '5-3-2',
    label: '5-3-2',
    family: '5',
    slots: [
      s('GK', 0.05, 0.5),
      s('DD', 0.24, 0.08),
      s('DC', 0.2, 0.3),
      s('DC', 0.18, 0.5),
      s('DC', 0.2, 0.7),
      s('DG', 0.24, 0.92),
      s('MC', 0.46, 0.3),
      s('MDC', 0.42, 0.5),
      s('MC', 0.46, 0.7),
      s('AC', 0.78, 0.4),
      s('AC', 0.78, 0.6),
    ],
  },
  {
    id: '5-4-1',
    label: '5-4-1',
    family: '5',
    slots: [
      s('GK', 0.05, 0.5),
      s('DD', 0.24, 0.08),
      s('DC', 0.2, 0.3),
      s('DC', 0.18, 0.5),
      s('DC', 0.2, 0.7),
      s('DG', 0.24, 0.92),
      s('AD', 0.5, 0.14),
      s('MC', 0.46, 0.38),
      s('MC', 0.46, 0.62),
      s('AG', 0.5, 0.86),
      s('AC', 0.78, 0.5),
    ],
  },
];

export function formationById(id: string): Formation | undefined {
  return FORMATIONS.find((f) => f.id === id);
}

// ── Formations génériques (jeu réduit : 1v1 → 9v9) ───────────

interface RowSpec {
  nx: number;
  count: number;
  role: PlayerRole;
}

const GENERIC_ROWS: Record<number, RowSpec[]> = {
  1: [{ nx: 0.7, count: 1, role: 'AC' }],
  2: [{ nx: 0.68, count: 2, role: 'AC' }],
  3: [
    { nx: 0.42, count: 1, role: 'MC' },
    { nx: 0.72, count: 2, role: 'AC' },
  ],
  4: [
    { nx: 0.3, count: 2, role: 'DC' },
    { nx: 0.66, count: 2, role: 'AC' },
  ],
  5: [
    { nx: 0.26, count: 2, role: 'DC' },
    { nx: 0.54, count: 2, role: 'MC' },
    { nx: 0.8, count: 1, role: 'AC' },
  ],
  6: [
    { nx: 0.26, count: 2, role: 'DC' },
    { nx: 0.54, count: 2, role: 'MC' },
    { nx: 0.8, count: 2, role: 'AC' },
  ],
  7: [
    { nx: 0.24, count: 3, role: 'DC' },
    { nx: 0.54, count: 2, role: 'MC' },
    { nx: 0.8, count: 2, role: 'AC' },
  ],
  8: [
    { nx: 0.24, count: 3, role: 'DC' },
    { nx: 0.54, count: 3, role: 'MC' },
    { nx: 0.8, count: 2, role: 'AC' },
  ],
  9: [
    { nx: 0.24, count: 3, role: 'DC' },
    { nx: 0.54, count: 4, role: 'MC' },
    { nx: 0.8, count: 2, role: 'AC' },
  ],
  10: [
    { nx: 0.24, count: 4, role: 'DC' },
    { nx: 0.54, count: 4, role: 'MC' },
    { nx: 0.8, count: 2, role: 'AC' },
  ],
};

/** Formation automatique pour un nombre de joueurs de champ donné. */
export function genericFormation(count: number): Formation {
  const rows = GENERIC_ROWS[count] ?? GENERIC_ROWS[10];
  const slots: FormationSlot[] = [];
  for (const row of rows) {
    for (let i = 0; i < row.count; i++) {
      const ny = row.count === 1 ? 0.5 : 0.14 + (0.72 * i) / (row.count - 1);
      slots.push({ role: row.role, nx: row.nx, ny });
    }
  }
  return { id: `auto-${count}`, label: `Auto ${count}`, family: '4', slots };
}

/** Formation avec gardien : le gardien est ajouté devant le but. */
export function withKeeper(formation: Formation): Formation {
  return {
    ...formation,
    slots: [{ role: 'GK', nx: 0.05, ny: 0.5 }, ...formation.slots],
  };
}

export function formationSlots(id: string, count: number): Formation | undefined {
  const named = formationById(id);
  if (named) return named;
  if (id === 'auto') return genericFormation(count);
  return genericFormation(count);
}

export const ROLE_LABELS: Record<PlayerRole, string> = {
  GK: 'Gardien',
  DC: 'Défenseur central',
  DD: 'Latéral droit',
  DG: 'Latéral gauche',
  MDC: 'Milieu défensif',
  MC: 'Milieu central',
  MOC: 'Milieu offensif',
  AD: 'Ailier droit',
  AG: 'Ailier gauche',
  AC: 'Attaquant',
};

export const ROLE_ORDER: PlayerRole[] = [
  'GK',
  'DC',
  'DD',
  'DG',
  'MDC',
  'MC',
  'MOC',
  'AD',
  'AG',
  'AC',
];
