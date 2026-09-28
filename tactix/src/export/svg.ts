import type { PitchSpec, TactixDoc } from '../domain/types';
import { screenBox, viewBoxString, worldTransform } from '../domain/pitch/orientation';
import { buildScene } from '../render/scene';
import { shapeToSvg, shapesToSvg } from '../render/shapes';
import { C, FONT } from '../render/theme';
import { computeFrame } from '../domain/animation';
import { formatLabel } from '../domain/formats';
import { goalConfigLabel } from '../domain/goals';
import { PITCH_TEMPLATES } from '../domain/pitch/dimensions';

// ─────────────────────────────────────────────────────────────
// Export vectoriel : la scène est sérialisée en SVG autonome,
// utilisable pour l'image, le PDF, le partage et l'impression.
// ─────────────────────────────────────────────────────────────

export interface SvgOptions {
  stepIndex?: number;
  title?: string;
  subtitle?: string;
  showInfo?: boolean;
  present?: boolean;
  /** Affiche les trajectoires de TOUTES les étapes (vue d'ensemble). */
  allActions?: boolean;
  progress?: Record<string, number>;
}

export function docToSvg(doc: TactixDoc, opts: SvgOptions = {}): string {
  const stepIndex = opts.stepIndex ?? 0;
  const frame = computeFrame(doc, stepIndex, 0, 1);
  // Par défaut on n'affiche que les trajectoires de l'étape exportée,
  // exactement comme à l'écran (superposition lisible).
  const progress: Record<string, number> = {};
  if (opts.allActions) {
    for (const step of doc.steps) for (const a of step.actions) progress[a.id] = 1;
  } else {
    for (const a of doc.steps[stepIndex]?.actions ?? []) progress[a.id] = 1;
  }

  const scene = buildScene({
    doc,
    stepIndex,
    frame,
    selection: [],
    gridStep: null,
    showDistances: false,
    present: opts.present ?? false,
    progress: opts.progress ?? progress,
  });

  const pitch = doc.pitch;
  const box = screenBox(pitch);
  const headerH = opts.title ? 15 : 0;
  const totalH = box.h + headerH;
  // Taille de police adaptée pour que le titre tienne toujours dans la largeur.
  const maxChars = Math.max(12, Math.floor(box.w / 2.15));
  const titleText =
    opts.title && opts.title.length > maxChars
      ? `${opts.title.slice(0, maxChars - 1)}…`
      : (opts.title ?? '');
  const headerFont = Math.min(5.6, box.w / Math.max(10, titleText.length * 0.62));

  const header = opts.title
    ? `<g>
  <text x="${box.x + 1}" y="${box.y - 5.2}" font-size="${headerFont.toFixed(2)}" font-weight="800" fill="${C.white}" font-family="${FONT}">${escapeXml(titleText)}</text>
  ${opts.subtitle ? `<text x="${box.x + 1}" y="${box.y - 1.2}" font-size="3.1" fill="${C.grey}" font-family="${FONT}">${escapeXml(opts.subtitle.slice(0, Math.floor(box.w / 1.5)))}</text>` : ''}
  <text x="${box.x + box.w - 1}" y="${box.y - 13.4}" font-size="3.4" fill="${C.green}" text-anchor="end" font-family="${FONT}">TACTIX</text>
</g>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.x} ${box.y - headerH} ${box.w} ${totalH}" width="${(box.w * 10).toFixed(0)}" height="${(totalH * 10).toFixed(0)}">
<defs>
${scene.defs}
</defs>
<rect x="${box.x - 40}" y="${box.y - headerH - 40}" width="${box.w + 80}" height="${totalH + 80}" fill="${C.bg}"/>
${header}
<g transform="${worldTransform(pitch) ?? ''}">
${shapesToSvg(scene.world)}
</g>
<g>
${shapesToSvg(scene.screen)}
</g>
</svg>`;
}

export function stepThumbnailSvg(doc: TactixDoc, stepIndex: number): string {
  return docToSvg(doc, { stepIndex, showInfo: false });
}

export function pitchSummary(doc: TactixDoc): string {
  const t = PITCH_TEMPLATES.find((p) => p.id === doc.pitch.template)?.label ?? doc.pitch.template;
  return `${t} · ${doc.pitch.orientation === 'horizontal' ? 'horizontal' : 'vertical'} · ${goalConfigLabel(doc.goalConfig)} · ${formatLabel(doc.format)}`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function viewBoxOf(pitch: PitchSpec): string {
  return viewBoxString(pitch);
}

export function svgWithSingleShapeDebug(): string {
  return shapeToSvg({ k: 'circle', cx: 0, cy: 0, r: 1 });
}
