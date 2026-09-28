import { useCallback, useMemo, useRef, useState } from 'react';
import type { SessionBlockId } from '../domain/types';
import { sessionDuration, useStore } from '../store/workspace';
import { Btn, Chip, Empty, Field, SectionTitle, Sheet, Stepper } from '../components/ui';
import { BLOCKS, blockById, formatMinutes } from '../domain/session';
import { buildSessionPrintHtml, printHtml } from '../export/pdf';
import { PitchThumb } from '../components/PitchThumb';
import { uid } from '../domain/actions';

// ─────────────────────────────────────────────────────────────
// CONSTRUCTEUR DE SÉANCE
// Assemblage d'exercices par blocs, réorganisation par glisser-déposer,
// calcul automatique de la durée totale.
// ─────────────────────────────────────────────────────────────

export function SessionEditorView({
  sessionId,
  onExit,
  onOpenDoc,
  onOpenSession,
}: {
  sessionId: string;
  onExit: () => void;
  onOpenDoc: (id: string) => void;
  onOpenSession: (id: string) => void;
}) {
  const { ws, updateSession, deleteSession, duplicateSession } = useStore();
  const session = ws.sessions.find((s) => s.id === sessionId);
  const [pickerBlock, setPickerBlock] = useState<SessionBlockId | null>(null);
  const [search, setSearch] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const docsById = useMemo(() => new Map(ws.docs.map((d) => [d.id, d])), [ws.docs]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const list = listRef.current;
    if (!list) return;
    const children = Array.from(list.querySelectorAll<HTMLElement>('[data-item-index]'));
    let target: number | null = null;
    for (const child of children) {
      const rect = child.getBoundingClientRect();
      if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
        target = Number(child.dataset.itemIndex);
        break;
      }
    }
    if (target !== null) setOverIndex(target);
  }, []);

  const onPointerUp = useCallback(() => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    setDragIndex((from) => {
      setOverIndex((to) => {
        if (from !== null && to !== null && from !== to && session) {
          updateSession(session.id, (s) => {
            const items = [...s.items];
            const [moved] = items.splice(from, 1);
            items.splice(to, 0, moved);
            return { ...s, items };
          });
        }
        return null;
      });
      return null;
    });
  }, [onPointerMove, session, updateSession]);

  const startDrag = (index: number) => {
    setDragIndex(index);
    setOverIndex(index);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  if (!session) {
    return (
      <div className="screen">
        <p>Séance introuvable.</p>
        <Btn onClick={onExit}>Retour</Btn>
      </div>
    );
  }

  const total = sessionDuration(session);
  const filteredDocs = ws.docs
    .filter((d) => d.kind === 'exercise' || d.kind === 'tactic')
    .filter((d) => (search ? d.name.toLowerCase().includes(search.toLowerCase()) : true));

  const addItem = (exerciseId: string) => {
    const block = pickerBlock ?? 'technique';
    const doc = docsById.get(exerciseId);
    updateSession(session.id, (s) => ({
      ...s,
      items: [
        ...s.items,
        {
          id: uid('it'),
          exerciseId,
          block,
          durationMin: doc?.info.durationMin ?? blockById(block).defaultMinutes,
        },
      ],
    }));
  };

  return (
    <div className="screen">
      <div className="row row--between" style={{ marginBottom: 10 }}>
        <button className="btn btn--icon btn--ghost" onClick={onExit} aria-label="Retour">
          ‹
        </button>
        <div className="grow" />
        <Btn
          size="sm"
          onClick={() => {
            const copy = duplicateSession(session.id);
            if (copy) onOpenSession(copy.id);
          }}
        >
          ⧉ Dupliquer
        </Btn>
        <Btn
          size="sm"
          onClick={() => {
            const ok = printHtml(buildSessionPrintHtml(session, ws.docs), session.name);
            if (!ok) window.alert('Autorisez les fenêtres pop-up pour exporter en PDF.');
          }}
        >
          🖨️ PDF
        </Btn>
        <Btn
          size="sm"
          variant="danger"
          onClick={() => {
            deleteSession(session.id);
            onExit();
          }}
        >
          🗑️
        </Btn>
      </div>

      <input
        className="input h1"
        style={{ fontSize: 22, fontWeight: 800, border: 'none', background: 'transparent', padding: '4px 0' }}
        value={session.name}
        onChange={(e) => updateSession(session.id, (s) => ({ ...s, name: e.target.value }))}
      />

      <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
        <span className="pill pill--green">Durée totale {formatMinutes(total)}</span>
        <span className="pill">{session.items.length} exercices</span>
      </div>

      <div className="row" style={{ gap: 10, marginTop: 14 }}>
        <Field label="Date">
          <input
            className="input"
            type="date"
            value={session.date}
            onChange={(e) => updateSession(session.id, (s) => ({ ...s, date: e.target.value }))}
          />
        </Field>
        <Field label="Groupe">
          <input
            className="input"
            value={session.group}
            placeholder="Seniors A"
            onChange={(e) => updateSession(session.id, (s) => ({ ...s, group: e.target.value }))}
          />
        </Field>
      </div>

      <Field label="Objectif / notes de séance">
        <textarea
          className="input"
          value={session.notes}
          onChange={(e) => updateSession(session.id, (s) => ({ ...s, notes: e.target.value }))}
        />
      </Field>

      <div ref={listRef}>
      {BLOCKS.map((block) => {
        const items = session.items
          .map((item, index) => ({ item, index }))
          .filter(({ item }) => item.block === block.id);
        const blockTotal = items.reduce((n, { item }) => n + item.durationMin, 0);
        return (
          <div key={block.id} style={{ marginTop: 18 }}>
            <SectionTitle title={`${block.emoji} ${block.label}${blockTotal ? ` — ${blockTotal} min` : ''}`} />
            <div className="timeline-list">
              {items.length === 0 && <p className="small muted">Aucun exercice dans ce bloc.</p>}
              {items.map(({ item, index }) => {
                const doc = docsById.get(item.exerciseId);
                return (
                  <div
                    className={`tl-item${dragIndex === index ? ' is-dragging' : ''}${
                      overIndex === index && dragIndex !== null ? ' is-over' : ''
                    }`}
                    key={item.id}
                    data-item-index={index}
                  >
                    <span
                      className="drag-handle"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        startDrag(index);
                      }}
                      title="Glisser pour réordonner"
                    >
                      ⠿
                    </span>
                    <span className="block-tag" style={{ background: block.color }} />
                    {doc && (
                      <div style={{ width: 62, height: 44, borderRadius: 10, overflow: 'hidden', flex: 'none' }}>
                        <PitchThumb doc={doc} />
                      </div>
                    )}
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span
                        style={{ display: 'block', fontWeight: 650, fontSize: 14.5, cursor: 'pointer' }}
                        onClick={() => doc && onOpenDoc(doc.id)}
                      >
                        {doc?.name ?? 'Exercice supprimé'}
                      </span>
                      <span className="muted small">
                        {formatMinutes(item.durationMin)} · {doc?.info.category ?? 'Sans catégorie'}
                      </span>
                    </span>
                    <Stepper
                      value={item.durationMin}
                      min={1}
                      max={120}
                      step={5}
                      onChange={(v) =>
                        updateSession(session.id, (s) => ({
                          ...s,
                          items: s.items.map((x) => (x.id === item.id ? { ...x, durationMin: v } : x)),
                        }))
                      }
                    />
                    <button
                      className="btn btn--icon btn--ghost"
                      onClick={() =>
                        updateSession(session.id, (s) => ({
                          ...s,
                          items: s.items.filter((x) => x.id !== item.id),
                        }))
                      }
                      aria-label="Retirer"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="spacer" />
            <Btn block size="sm" onClick={() => setPickerBlock(block.id)}>
              ＋ Ajouter un exercice — {block.label}
            </Btn>
          </div>
        );
      })}
      </div>

      {session.items.length === 0 && (
        <div style={{ marginTop: 18 }}>
          <Empty text="Séance vide" hint="Ajoutez un premier exercice dans le bloc de votre choix." />
        </div>
      )}

      <div className="spacer" style={{ height: 24 }} />
      <div className="card">
        <div className="h3" style={{ marginBottom: 8 }}>Répartition</div>
        {BLOCKS.map((b) => {
          const blockTotal = session.items
            .filter((i) => i.block === b.id)
            .reduce((n, i) => n + i.durationMin, 0);
          if (!blockTotal) return null;
          return (
            <div className="kv" key={b.id}>
              <span>{b.emoji} {b.label}</span>
              <span>{formatMinutes(blockTotal)}</span>
            </div>
          );
        })}
        <div className="kv">
          <span style={{ fontWeight: 700 }}>Total</span>
          <span style={{ color: 'var(--green)' }}>{formatMinutes(total)}</span>
        </div>
      </div>

      <Sheet open={pickerBlock !== null} title="Choisir un exercice" onClose={() => setPickerBlock(null)}>
        <input
          className="input"
          placeholder="Rechercher…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="spacer" />
        <div className="list">
          {filteredDocs.length === 0 && <Empty text="Aucun exercice" hint="Créez d’abord un exercice." />}
          {filteredDocs.map((d) => (
            <div
              className="item"
              key={d.id}
              onClick={() => {
                addItem(d.id);
                setPickerBlock(null);
              }}
            >
              <div style={{ width: 70, height: 48, borderRadius: 10, overflow: 'hidden', flex: 'none' }}>
                <PitchThumb doc={d} />
              </div>
              <div className="item__body">
                <div className="item__title">{d.name}</div>
                <div className="item__meta">
                  {d.info.category ?? 'Sans catégorie'} · {d.info.durationMin} min
                </div>
              </div>
              <span className="pill pill--green">Ajouter</span>
            </div>
          ))}
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>
          Le bloc cible est celui du bouton utilisé. Vous pouvez ensuite changer la durée de chaque
          exercice.
        </p>
      </Sheet>

      <div className="wrap" style={{ marginTop: 12 }}>
        {BLOCKS.map((b) => (
          <Chip key={b.id} onClick={() => setPickerBlock(b.id)}>
            {b.emoji} {b.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}
