import type { Session, TactixDoc } from '../domain/types';
import { docToSvg, pitchSummary } from './svg';
import { autoInstructions } from '../domain/steps';
import { sessionDuration } from '../store/workspace';
import { C, FONT } from '../render/theme';
import { BLOCKS, blockLabel } from '../domain/session';
import { formatLabel } from '../domain/formats';

// ─────────────────────────────────────────────────────────────
// Export PDF : document de séance complet, prêt à imprimer.
// Le PDF est produit via la fonction d'impression du navigateur
// (mise en page A4, une fiche par exercice).
// ─────────────────────────────────────────────────────────────

export function buildDocPrintHtml(doc: TactixDoc, session?: Session): string {
  const steps = doc.steps
    .map(
      (step, i) => `
      <figure class="step">
        <div class="plate">${docToSvg(doc, { stepIndex: i, present: true })}</div>
        <figcaption>
          <strong>${escapeHtml(step.title || `Étape ${i + 1}`)}</strong>
          ${step.note ? `<span>${escapeHtml(step.note)}</span>` : ''}
        </figcaption>
      </figure>`,
    )
    .join('');

  const keyPoints = doc.info.keyPoints.filter(Boolean);
  const material = doc.info.material.filter(Boolean);

  return `
  <header class="head">
    <div>
      <div class="brand">TACTIX</div>
      <h1>${escapeHtml(doc.name)}</h1>
      <div class="meta">${escapeHtml(pitchSummary(doc))} · Format ${escapeHtml(formatLabel(doc.format))}</div>
    </div>
    <div class="badge">${doc.kind === 'tactic' ? 'TACTIQUE' : 'EXERCICE'}</div>
  </header>

  <section class="grid">
    <div><span>Objectif</span>${escapeHtml(doc.info.objective || '—')}</div>
    <div><span>Catégorie</span>${escapeHtml([doc.info.category, doc.info.subcategory].filter(Boolean).join(' · ') || '—')}</div>
    <div><span>Joueurs</span>${escapeHtml(doc.info.players || '—')}</div>
    <div><span>Catégorie d'âge</span>${escapeHtml(doc.info.ageGroup || '—')}</div>
    <div><span>Durée</span>${doc.info.durationMin} min</div>
    <div><span>Intensité</span>${'●'.repeat(doc.info.intensity)}${'○'.repeat(Math.max(0, 5 - doc.info.intensity))}</div>
    <div class="span2"><span>Matériel</span>${escapeHtml(material.join(' · ') || '—')}</div>
  </section>

  ${doc.info.instructions ? `<section class="block"><h2>Instruction</h2><p>${escapeHtml(doc.info.instructions)}</p></section>` : ''}
  ${keyPoints.length ? `<section class="block"><h2>Points clés</h2><ul>${keyPoints.map((k) => `<li>${escapeHtml(k)}</li>`).join('')}</ul></section>` : ''}

  <h2 class="steps-title">Déroulé — ${doc.steps.length} étape${doc.steps.length > 1 ? 's' : ''}</h2>
  <section class="steps">${steps}</section>

  ${
    doc.info.variants
      ? `<section class="block"><h2>Variantes</h2><p>${escapeHtml(doc.info.variants)}</p></section>`
      : ''
  }

  <section class="block">
    <h2>Description automatique des trajectoires</h2>
    <pre>${escapeHtml(autoInstructions(doc) || 'Aucune trajectoire pour le moment.')}</pre>
  </section>

  ${
    session
      ? `<section class="block"><h2>Séance — ${escapeHtml(session.name)}</h2>
          <p>${session.items.length} blocs · ${sessionDuration(session)} min</p>
          <ul>${session.items
            .map((i) => `<li>${escapeHtml(blockLabel(i.block))} — ${i.durationMin} min</li>`)
            .join('')}</ul>
        </section>`
      : ''
  }

  <footer>TACTIX — Dessine. Anime. Entraîne. · Généré le ${new Date().toLocaleDateString('fr-FR')}</footer>`;
}

export function buildSessionPrintHtml(session: Session, docs: TactixDoc[]): string {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const rows = session.items
    .map((item) => {
      const doc = byId.get(item.exerciseId);
      return `<tr>
        <td>${escapeHtml(blockLabel(item.block))}</td>
        <td>${escapeHtml(doc?.name ?? 'Exercice supprimé')}</td>
        <td>${item.durationMin} min</td>
        <td>${escapeHtml(doc?.info.objective ?? '')}</td>
      </tr>`;
    })
    .join('');

  const blocks = BLOCKS.map((b) => {
    const total = session.items
      .filter((i) => i.block === b.id)
      .reduce((s, i) => s + i.durationMin, 0);
    return total ? `<div class="cell"><span>${escapeHtml(b.label)}</span><strong>${total} min</strong></div>` : '';
  }).join('');

  const sheets = session.items
    .map((item, index) => {
      const doc = byId.get(item.exerciseId);
      if (!doc) return '';
      return `<div class="sheet">${buildDocPrintHtml(doc, index === 0 ? session : undefined)}</div>`;
    })
    .join('');

  return `
  <header class="head">
    <div>
      <div class="brand">TACTIX</div>
      <h1>${escapeHtml(session.name)}</h1>
      <div class="meta">${escapeHtml(session.date)} · ${escapeHtml(session.group)} · ${sessionDuration(session)} min</div>
    </div>
    <div class="badge">SÉANCE</div>
  </header>
  <section class="cells">${blocks}</section>
  ${session.notes ? `<section class="block"><h2>Notes</h2><p>${escapeHtml(session.notes)}</p></section>` : ''}
  <section class="block"><h2>Déroulé</h2>
    <table><thead><tr><th>Bloc</th><th>Exercice</th><th>Durée</th><th>Objectif</th></tr></thead><tbody>${rows}</tbody></table>
  </section>
  <div class="page-break"></div>
  ${sheets}
  <footer>TACTIX — Dessine. Anime. Entraîne.</footer>`;
}

export function printHtml(html: string, title: string): boolean {
  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.write(`<!doctype html><html lang="fr"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<style>${printCss()}</style>
</head><body>${html}
<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},450);});</script>
</body></html>`);
  win.document.close();
  return true;
}

function printCss(): string {
  return `
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: ${FONT}; color: #10201a; background: #fff; margin: 0; padding: 20px; }
  h1 { font-size: 22px; margin: 4px 0 2px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: ${C.green2}; margin: 16px 0 6px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; border-bottom: 2px solid ${C.green2}; padding-bottom: 10px; }
  .brand { font-size: 11px; font-weight: 800; letter-spacing: .28em; color: ${C.green2}; }
  .meta { font-size: 11.5px; color: #55635c; }
  .badge { font-size: 10px; font-weight: 800; letter-spacing: .1em; border: 1px solid ${C.green2}; color: ${C.green2}; padding: 4px 8px; border-radius: 999px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 18px; margin-top: 12px; font-size: 12px; }
  .grid .span2 { grid-column: span 2; }
  .grid span { display: block; text-transform: uppercase; font-size: 9.5px; letter-spacing: .06em; color: #7a857e; }
  .block p, .block li { font-size: 12.5px; line-height: 1.5; }
  .cells { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
  .cell { border: 1px solid #d8ded9; border-radius: 10px; padding: 8px 12px; font-size: 12px; }
  .cell span { display: block; font-size: 10px; color: #7a857e; text-transform: uppercase; }
  .cell strong { font-size: 15px; }
  .steps-title { page-break-before: always; }
  .steps { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .step { margin: 0; border: 1px solid #d8ded9; border-radius: 12px; overflow: hidden; page-break-inside: avoid; }
  .plate svg { display: block; width: 100%; height: auto; }
  figcaption { padding: 8px 10px; font-size: 11.5px; }
  figcaption strong { display: block; font-size: 12.5px; }
  figcaption span { color: #55635c; }
  pre { font-family: ui-monospace, Menlo, monospace; font-size: 11px; white-space: pre-wrap; background: #f4f7f5; padding: 10px; border-radius: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border-bottom: 1px solid #e2e7e3; padding: 6px 8px; text-align: left; }
  th { background: #f4f7f5; font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: #55635c; }
  .page-break { page-break-after: always; }
  .sheet { page-break-after: always; }
  footer { margin-top: 24px; font-size: 10px; color: #7a857e; border-top: 1px solid #e2e7e3; padding-top: 8px; }
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
