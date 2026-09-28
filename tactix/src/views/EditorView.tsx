import { useEffect, useMemo, useState } from 'react';
import { useEditor } from '../hooks/useEditor';
import { useStore } from '../store/workspace';
import { PitchCanvas } from '../components/pitch/PitchCanvas';
import { buildScene } from '../render/scene';
import { ContextBar } from '../components/editor/ContextBar';
import { StepCaption, Timeline } from '../components/editor/Timeline';
import {
  ActionSheet,
  AddMenu,
  AssistantSheet,
  DeleteConfirmSheet,
  ExportSheet,
  InfoSheet,
  ObjectSheet,
  OptionsSheet,
  StepSheet,
} from '../components/editor/sheets';
import { Btn, Icons, Sheet, Toast } from '../components/ui';
import { QuickCreateBar, QuickActionStrip } from '../components/editor/QuickCreate';
import { SetupSheet } from '../components/editor/SetupSheet';
import { PITCH_TEMPLATES } from '../domain/pitch/dimensions';
import { goalConfigLabel } from '../domain/goals';
import { formatLabel } from '../domain/formats';
import { ACTIONS } from '../domain/actions';

// ─────────────────────────────────────────────────────────────
// L'ÉDITEUR : terrain vectoriel interactif + outils contextuels,
// étapes, animation, export.
// ─────────────────────────────────────────────────────────────

type SheetKind =
  | null
  | 'add'
  | 'object'
  | 'action'
  | 'options'
  | 'export'
  | 'info'
  | 'step'
  | 'assistant'
  | 'menu'
  | 'setup'
  | 'help';

export function EditorView({
  docId,
  onExit,
  onPresent,
  fresh,
}: {
  docId: string;
  /** Document tout juste créé : propose la configuration rapide du terrain. */
  fresh?: boolean;
  onExit: () => void;
  onPresent: (docId: string) => void;
}) {
  const editor = useEditor(docId);
  const { setFavorite, ws } = useStore();
  const [sheet, setSheet] = useState<SheetKind>(fresh ? 'setup' : null);
  const [quickCreate, setQuickCreate] = useState(false);
  const [askKeepActions, setAskKeepActions] = useState(false);
  const doc = editor.doc;

  // ── Scène affichée ─────────────────────────────────────────
  const progress = useMemo(() => {
    if (!doc) return {} as Record<string, number>;
    if (editor.playing) return editor.frame?.progress ?? {};
    const out: Record<string, number> = {};
    for (const a of editor.currentStep?.actions ?? []) out[a.id] = 1;
    return out;
  }, [doc, editor.playing, editor.frame, editor.currentStep]);

  const scene = useMemo(() => {
    if (!doc) return null;
    return buildScene({
      doc,
      stepIndex: editor.stepIndex,
      frame: editor.frame ?? undefined,
      selection: editor.selection,
      selectedActionId: editor.selectedActionId,
      guides: editor.guides,
      gridStep: editor.prefs.grid ? editor.prefs.gridStep : null,
      showDistances: editor.prefs.showDistances || ws.settings.mode === 'advanced',
      progress,
    });
  }, [doc, editor.stepIndex, editor.frame, editor.selection, editor.selectedActionId, editor.guides, editor.prefs, progress, ws.settings.mode]);

  // ── Raccourcis clavier (desktop / tablette avec clavier) ───
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.key === ' ') {
        e.preventDefault();
        if (editor.playing) editor.pause();
        else editor.play();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) editor.history.redo();
        else editor.history.undo();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (editor.selection.length || editor.selectedActionId) {
          e.preventDefault();
          if (editor.selectedActionId) editor.deleteActionById(editor.selectedActionId);
          else editor.deleteSelected();
        }
        return;
      }
      if (e.key === 'ArrowLeft') editor.setStepIndex(Math.max(0, editor.stepIndex - 1));
      if (e.key === 'ArrowRight' && doc) {
        editor.setStepIndex(Math.min(doc.steps.length - 1, editor.stepIndex + 1));
      }
      const num = Number(e.key);
      if (num >= 1 && num <= ACTIONS.length) {
        editor.setTool({ kind: 'draw', actionType: ACTIONS[num - 1].type });
      }
      if (e.key === 'Escape') {
        editor.setTool({ kind: 'select' });
        editor.setSelection([]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor, doc]);

  if (!doc || !scene) {
    return (
      <div className="screen">
        <p>Document introuvable.</p>
        <Btn onClick={onExit}>Retour</Btn>
      </div>
    );
  }

  const advanced = ws.settings.mode === 'advanced';
  const templateLabel = PITCH_TEMPLATES.find((t) => t.id === doc.pitch.template)?.label ?? '';

  return (
    <div className="editor">
      <div className="topbar">
        <button className="btn btn--icon btn--ghost" onClick={onExit} aria-label="Retour">
          ‹
        </button>
        <button
          className="topbar__title"
          style={{ background: 'none', border: 'none', textAlign: 'left' }}
          onClick={() => setSheet('info')}
        >
          {doc.name}
          <span className="muted small" style={{ display: 'block', fontWeight: 500 }}>
            {doc.kind === 'tactic' ? 'Tactique' : 'Exercice'} · {formatLabel(doc.format)} ·{' '}
            {doc.steps.length} étapes
          </span>
        </button>
        <button
          className="btn btn--icon btn--ghost"
          style={{ color: doc.favorite ? 'var(--green)' : 'var(--grey)' }}
          onClick={() => setFavorite(doc.id, !doc.favorite)}
          aria-label="Favori"
        >
          {Icons.star(doc.favorite)}
        </button>
        <button
          className="btn btn--icon btn--ghost"
          onClick={editor.history.undo}
          disabled={!editor.history.canUndo}
          aria-label="Annuler"
        >
          {Icons.undo}
        </button>
        <button
          className="btn btn--icon btn--ghost"
          onClick={editor.history.redo}
          disabled={!editor.history.canRedo}
          aria-label="Rétablir"
        >
          {Icons.redo}
        </button>
        <button className="btn btn--icon btn--ghost" onClick={() => onPresent(doc.id)} aria-label="Présenter">
          {Icons.eye}
        </button>
      </div>

      <div className="scroll-x" style={{ padding: '8px 12px 0', background: 'rgba(9,20,14,0.6)' }}>
        <button className="chip" onClick={() => setSheet('options')}>
          🟩 {templateLabel}
        </button>
        <button className="chip" onClick={() => setSheet('options')}>
          {doc.pitch.orientation === 'horizontal' ? '▭ Horizontal' : '▯ Vertical'}
        </button>
        <button className="chip" onClick={() => setSheet('options')}>
          🥅 {goalConfigLabel(doc.goalConfig)}
        </button>
        <button className="chip" onClick={() => setSheet('options')}>
          ⚽ {doc.format}
        </button>
        <button
          className={`chip${quickCreate ? ' chip--active' : ''}`}
          onClick={() => {
            const next = !quickCreate;
            setQuickCreate(next);
            editor.setPrefs((p) => ({ ...p, autoAdvance: next || p.autoAdvance }));
            if (next) editor.notify('Mode création rapide : les étapes se créent toutes seules');
          }}
        >
          ⚡ Création rapide
        </button>
        <button className="chip" onClick={() => setSheet('setup')}>
          🧭 Configuration
        </button>
        <button className="chip" onClick={() => setSheet('help')}>
          ❔ Aide
        </button>
        {advanced && (
          <button className="chip" onClick={() => setSheet('assistant')}>
            ✨ Assistant
          </button>
        )}
      </div>

      <div className="editor__stage">
        <PitchCanvas
          doc={doc}
          scene={scene}
          viewport={editor.viewport}
          onViewportChange={editor.setViewport}
          onGesture={editor.onGesture}
          resolve={editor.resolve}
          activeTool={editor.tool.kind}
        />

        <div className="float float--tr">
          <button
            className={`fab${editor.prefs.snap ? ' fab--on' : ''}`}
            onClick={editor.togglePrecision}
            title="Placement précis"
          >
            🎯
          </button>
          <button
            className={`fab${editor.prefs.grid ? ' fab--on' : ''}`}
            onClick={editor.toggleGrid}
            title="Grille"
          >
            {Icons.grid}
          </button>
          <button className="fab" onClick={() => editor.zoomBy(1.3)} title="Zoom avant">
            ＋
          </button>
          <button className="fab" onClick={() => editor.zoomBy(1 / 1.3)} title="Zoom arrière">
            −
          </button>
          <button className="fab" onClick={() => editor.setViewport({ scale: 1, tx: 0, ty: 0 })} title="Recentrer">
            ⤢
          </button>
        </div>

        <div className="float float--bl">
          <button className="fab" onClick={() => setSheet('add')} title="Ajouter">
            ＋
          </button>
          <button className="fab" onClick={() => setSheet('options')} title="Options avancées">
            ⚙️
          </button>
          <button className="fab" onClick={() => setSheet('export')} title="Exporter">
            {Icons.download}
          </button>
        </div>

        <StepCaption editor={editor} onOpenStep={() => setSheet('step')} />

        {quickCreate && <QuickCreateBar editor={editor} />}

        {editor.suggestion && !quickCreate && (
          <div className="suggestion">
            <span className="grow small">{editor.suggestion.text}</span>
            <Btn
              size="sm"
              variant="primary"
              onClick={() => {
                editor.suggestion?.run();
              }}
            >
              Créer
            </Btn>
            <button className="btn btn--icon btn--ghost" onClick={() => editor.setSuggestion(null)}>
              ✕
            </button>
          </div>
        )}
      </div>

      {quickCreate ? (
        <>
          <QuickActionStrip editor={editor} onDone={() => setQuickCreate(false)} />
        </>
      ) : (
        <ContextBar
          editor={editor}
          onOpenMore={() =>
            setSheet(
              editor.selectedAction
                ? 'action'
                : editor.selection.length
                  ? 'object'
                  : 'add',
            )
          }
        />
      )}

      <Timeline editor={editor} onOpenStep={() => setSheet('step')} />

      {/* ── Feuilles ── */}
      <AddMenu
        editor={editor}
        open={sheet === 'add'}
        onClose={() => setSheet(null)}
        onAssistant={() => setSheet('assistant')}
      />
      <ObjectSheet
        editor={editor}
        open={sheet === 'object'}
        objectId={editor.selection[0]}
        onClose={() => setSheet(null)}
        onDeleteKeepActions={() => {
          setSheet(null);
          editor.deleteSelected();
        }}
      />
      <ActionSheet editor={editor} open={sheet === 'action'} onClose={() => setSheet(null)} />
      <OptionsSheet editor={editor} open={sheet === 'options'} onClose={() => setSheet(null)} />
      <ExportSheet
        editor={editor}
        open={sheet === 'export'}
        onClose={() => setSheet(null)}
        onPresent={() => {
          setSheet(null);
          onPresent(doc.id);
        }}
        onOpenInfo={() => setSheet('info')}
      />
      <InfoSheet editor={editor} open={sheet === 'info'} onClose={() => setSheet(null)} />
      <StepSheet editor={editor} open={sheet === 'step'} onClose={() => setSheet(null)} />
      <AssistantSheet
        editor={editor}
        open={sheet === 'assistant'}
        mode="modify"
        onClose={() => setSheet(null)}
        onCreate={() => undefined}
      />
      <DeleteConfirmSheet editor={editor} onClose={() => editor.setAskDelete(null)} />

      <SetupSheet editor={editor} open={sheet === 'setup'} onClose={() => setSheet(null)} />

      <Sheet open={sheet === 'help'} title="Bien utiliser TACTIX" onClose={() => setSheet(null)}>
        <HelpContent />
      </Sheet>

      <Sheet open={sheet === 'menu'} title="Éditeur" onClose={() => setSheet(null)}>
        <div className="grid-2">
          <Btn onClick={() => setSheet('options')}>⚙️ Options avancées</Btn>
          <Btn onClick={() => setSheet('info')}>🧾 Fiche</Btn>
          <Btn onClick={() => setSheet('assistant')}>✨ Assistant</Btn>
          <Btn onClick={() => setSheet('export')}>⬇️ Export</Btn>
        </div>
      </Sheet>

      <Toast message={editor.toast} />

      {askKeepActions && (
        <Sheet open title="Suppression" onClose={() => setAskKeepActions(false)}>
          <p className="muted">Choisissez le traitement des trajectoires liées.</p>
          <Btn block onClick={() => setAskKeepActions(false)}>
            Annuler
          </Btn>
        </Sheet>
      )}
    </div>
  );
}

function HelpContent() {
  const items: [string, string][] = [
    ['1 doigt', 'Déplacer un joueur, un plot, un ballon'],
    ['Appui long', 'Menu complet de l’élément (renommer, numéro, couleur, poste)'],
    ['⚡ Passe / Course / Appel', 'Choisissez l’action puis dessinez avec le doigt'],
    ['2 doigts', 'Zoom et déplacement du terrain'],
    ['Double tap', 'Recentrer le terrain'],
    ['🎯 Précision', 'Aimantation sur les lignes et alignement avec les autres joueurs'],
    ['＋ / −', 'Zoom avant / arrière'],
    ['↶ ↷', 'Annuler / rétablir (déplacement, suppression, trajectoire, étape)'],
    ['Espace / ← →', 'Lecture-pause / navigation entre les étapes (clavier)'],
  ];
  return (
    <>
      <div className="kbd-list">
        {items.map(([k, v]) => (
          <div className="kv" key={k}>
            <span style={{ minWidth: 130 }}>{k}</span>
            <span>{v}</span>
          </div>
        ))}
      </div>
      <div className="divider" />
      <div className="banner banner--green">
        <span>⚡</span>
        <span>
          La position finale d’une trajectoire devient automatiquement la position de départ de
          l’étape suivante. Aucun replacement manuel.
        </span>
      </div>
    </>
  );
}
