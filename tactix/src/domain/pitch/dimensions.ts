import type { Orientation, PitchSpec, PitchTemplateId, Rect } from '../types';

// ─────────────────────────────────────────────────────────────
// Dimensions réelles du football (mètres) — normes FIFA / IFAB
// ─────────────────────────────────────────────────────────────
export const FIFA = {
  length: 105,
  width: 68,
  centerCircleRadius: 9.15,
  penaltyAreaDepth: 16.5,
  penaltyAreaWidth: 40.32,
  goalAreaDepth: 5.5,
  goalAreaWidth: 18.32,
  penaltySpot: 11,
  cornerRadius: 1,
  goalWidth: 7.32,
  goalHeight: 2.44,
  lineWidth: 0.12,
};

export interface PitchTemplate {
  id: PitchTemplateId;
  label: string;
  hint: string;
  emoji: string;
}

export const PITCH_TEMPLATES: PitchTemplate[] = [
  { id: 'full', label: 'Complet', hint: '105 × 68 m — 11 contre 11', emoji: '🟩' },
  { id: 'threeQuarter', label: '3/4', hint: '78,75 × 68 m', emoji: '🟩' },
  { id: 'half', label: 'Demi', hint: '52,5 × 68 m', emoji: '🟩' },
  { id: 'finalThird', label: 'Dernier tiers', hint: '35 × 68 m', emoji: '🟩' },
  { id: 'penaltyArea', label: 'Surface', hint: '22 × 68 m', emoji: '🟩' },
  { id: 'reduced', label: 'Jeu réduit', hint: '40 × 30 m — petits buts', emoji: '🟨' },
  { id: 'custom', label: 'Personnalisé', hint: 'Longueur et largeur libres', emoji: '🟦' },
];

export const CUSTOM_DEFAULT = { length: 50, width: 40 };

/** Fenêtre visible (en mètres) pour chaque modèle de terrain. */
export function viewForTemplate(
  template: PitchTemplateId,
  custom: { length: number; width: number } = CUSTOM_DEFAULT,
): { length: number; width: number; view: Rect; marking: 'fifa' | 'smallSided' } {
  const L = FIFA.length;
  const W = FIFA.width;
  // Les fenêtres partielles sont ancrées sur le BUT AVERSES (à droite),
  // ce qui correspond au sens de jeu naturel : on attaque vers la droite.
  switch (template) {
    case 'full':
      return { length: L, width: W, view: { x: 0, y: 0, w: L, h: W }, marking: 'fifa' };
    case 'threeQuarter':
      return { length: L, width: W, view: { x: L - 78.75, y: 0, w: 78.75, h: W }, marking: 'fifa' };
    case 'half':
      return { length: L, width: W, view: { x: L - 52.5, y: 0, w: 52.5, h: W }, marking: 'fifa' };
    case 'finalThird':
      return { length: L, width: W, view: { x: L - 35, y: 0, w: 35, h: W }, marking: 'fifa' };
    case 'penaltyArea':
      return { length: L, width: W, view: { x: L - 22, y: 0, w: 22, h: W }, marking: 'fifa' };
    case 'reduced':
      return {
        length: 40,
        width: 30,
        view: { x: 0, y: 0, w: 40, h: 30 },
        marking: 'smallSided',
      };
    case 'custom':
    default:
      return {
        length: custom.length,
        width: custom.width,
        view: { x: 0, y: 0, w: custom.length, h: custom.width },
        marking: custom.length >= 60 ? 'fifa' : 'smallSided',
      };
  }
}

export function createPitch(
  template: PitchTemplateId,
  orientation: Orientation = 'horizontal',
  custom: { length: number; width: number } = CUSTOM_DEFAULT,
): PitchSpec {
  const base = viewForTemplate(template, custom);
  return {
    template,
    length: base.length,
    width: base.width,
    view: base.view,
    marking: base.marking,
    orientation,
    padding: template === 'penaltyArea' ? 4 : 3.5,
    stripes: true,
  };
}

/** Bornes du terrain « monde » (mètres). */
export function boundsOf(pitch: PitchSpec): Rect {
  return { x: 0, y: 0, w: pitch.length, h: pitch.length === 0 ? 0 : pitch.width };
}

/**
 * Le repère du terrain est TOUJOURS le terrain complet (0→105, 0→68),
 * même pour un demi-terrain : cela garantit des marquages réalistes
 * et un changement de terrain sans perte d'information.
 */
export const FULL_BOUNDS: Rect = { x: 0, y: 0, w: FIFA.length, h: FIFA.width };
