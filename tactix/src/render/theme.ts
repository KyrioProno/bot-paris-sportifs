// ─────────────────────────────────────────────────────────────
// TACTIX — Charte graphique
// Le noyau de l'identité : sombre, sobre, sportif.
// ─────────────────────────────────────────────────────────────

export const C = {
  bg: '#07110D',
  bgSoft: '#0A170F',
  card: '#101C16',
  cardHi: '#16251C',
  cardSoft: '#0D1A13',
  green: '#20E67A',
  green2: '#0FAE59',
  greenDark: '#0B7A3E',
  blue: '#3D8BFF',
  white: '#F4F7F5',
  grey: '#87928C',
  greyDark: '#4A554F',
  red: '#FF4D5A',
  orange: '#FFAA3D',
  line: 'rgba(244,247,245,0.10)',
  lineStrong: 'rgba(244,247,245,0.18)',
  shadow: 'rgba(0,0,0,0.45)',
} as const;

// Sans guillemets internes : la même valeur est utilisée en CSS et dans
// les attributs SVG (l'export doit rester un XML valide).
export const FONT =
  '-apple-system, BlinkMacSystemFont, Segoe UI, Inter, Roboto, Helvetica Neue, Arial, sans-serif';

// ── Terrain ─────────────────────────────────────────────────
export const GRASS = {
  base: '#0C3A22',
  stripeA: '#0E4127',
  stripeB: '#0B3520',
  vignette: 'rgba(0,0,0,0.28)',
  line: 'rgba(244,247,245,0.62)',
  lineWidth: 0.14,
  shade: 'rgba(32,230,122,0.05)',
  out: '#07110D',
};

export const SIZES = {
  playerRadius: 2.4,
  ballRadius: 0.85,
  actionWidth: 0.42,
  guideWidth: 0.2,
  gridWidth: 0.08,
  minTouchRadiusPx: 22,
};

export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
