import type { TactixDoc } from '../domain/types';
import { docToSvg, pitchSummary } from './svg';
import { safeFilename, svgToPngBlob } from './image';
import { formatLabel } from '../domain/formats';

// ─────────────────────────────────────────────────────────────
// Partage natif : image + texte, ou repli sur le presse-papier.
// ─────────────────────────────────────────────────────────────

export interface ShareResult {
  ok: boolean;
  message: string;
}

export async function shareDoc(doc: TactixDoc, stepIndex = 0): Promise<ShareResult> {
  const svg = docToSvg(doc, {
    stepIndex,
    title: doc.name,
    subtitle: pitchSummary(doc),
  });
  const text = [
    `${doc.name} — TACTIX`,
    pitchSummary(doc),
    `Format ${formatLabel(doc.format)} · ${doc.info.durationMin} min`,
    doc.info.objective ? `Objectif : ${doc.info.objective}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const blob = await svgToPngBlob(svg, 1800);
    const file = new File([blob], safeFilename(doc.name, '.png'), { type: 'image/png' });
    const nav = navigator as Navigator & {
      canShare?: (data: { files?: File[]; text?: string; title?: string }) => boolean;
    };
    if (nav.canShare?.({ files: [file] }) && navigator.share) {
      await navigator.share({ files: [file], title: doc.name, text });
      return { ok: true, message: 'Partagé' };
    }
    if (navigator.share) {
      await navigator.share({ title: doc.name, text });
      return { ok: true, message: 'Partagé' };
    }
    await copyToClipboard(text);
    return { ok: true, message: 'Description copiée (partage natif indisponible)' };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, message: 'Partage annulé' };
    }
    return { ok: false, message: 'Partage impossible sur cet appareil' };
  }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Lien de partage : document encodé dans l'URL (aucun serveur requis). */
export function encodeDocLink(doc: TactixDoc): string {
  const payload = JSON.stringify({
    n: doc.name,
    k: doc.kind,
    p: doc.pitch,
    g: doc.goalConfig,
    f: doc.format,
    o: doc.objects,
    s: doc.steps,
    i: doc.info,
  });
  const encoded = b64urlEncode(payload);
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#doc=${encoded}`;
}

export function decodeDocLink(hash: string): TactixDoc | null {
  const match = /doc=([A-Za-z0-9_-]+)/.exec(hash);
  if (!match) return null;
  try {
    const json = b64urlDecode(match[1]);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    if (!parsed.objects || !parsed.steps || !parsed.pitch) return null;
    const now = new Date().toISOString();
    return {
      id: `imp_${Date.now().toString(36)}`,
      kind: (parsed.k as TactixDoc['kind']) ?? 'exercise',
      name: (parsed.n as string) ?? 'Document partagé',
      createdAt: now,
      updatedAt: now,
      favorite: false,
      pitch: parsed.p as TactixDoc['pitch'],
      goalConfig: parsed.g as TactixDoc['goalConfig'],
      format: (parsed.f as string) ?? '4v4',
      formation: 'auto',
      objects: parsed.o as TactixDoc['objects'],
      steps: parsed.s as TactixDoc['steps'],
      info: parsed.i as TactixDoc['info'],
      assistantLog: [],
    };
  } catch {
    return null;
  }
}

function b64urlEncode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
