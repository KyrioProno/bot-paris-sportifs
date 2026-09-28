import { Icons } from '../ui';
import type { EditorApi } from './types';

// ─────────────────────────────────────────────────────────────
// Timeline des étapes + commandes de lecture.
// ─────────────────────────────────────────────────────────────

export function Timeline({ editor, onOpenStep }: { editor: EditorApi; onOpenStep: () => void }) {
  const { doc, stepIndex, setStepIndex, playing, play, pause, resetAnimation, addStep } = editor;
  if (!doc) return null;

  return (
    <div className="timeline">
      <button
        className="fab"
        style={{ width: 40, height: 40 }}
        onClick={() => setStepIndex(Math.max(0, stepIndex - 1))}
        aria-label="Étape précédente"
        disabled={stepIndex === 0}
      >
        {Icons.prev}
      </button>
      <button
        className="fab fab--on"
        style={{ width: 46, height: 46 }}
        onClick={() => (playing ? pause() : play())}
        aria-label={playing ? 'Pause' : 'Lecture'}
      >
        {playing ? Icons.pause : Icons.play}
      </button>
      <button
        className="fab"
        style={{ width: 40, height: 40 }}
        onClick={() => setStepIndex(Math.min(doc.steps.length - 1, stepIndex + 1))}
        aria-label="Étape suivante"
        disabled={stepIndex >= doc.steps.length - 1}
      >
        {Icons.next}
      </button>
      <button className="fab" style={{ width: 40, height: 40 }} onClick={resetAnimation} aria-label="Recommencer">
        {Icons.reset}
      </button>

      <div className="steps">
        {doc.steps.map((s, i) => (
          <button
            key={s.id}
            className={`step-dot${i === stepIndex ? ' is-active' : ''}${i < stepIndex ? ' is-done' : ''}`}
            onClick={() => {
              setStepIndex(i);
              if (editor.playing) pause();
            }}
            title={s.title}
          >
            {i + 1}
          </button>
        ))}
        <button className="step-dot" onClick={addStep} title="Ajouter une étape">
          ＋
        </button>
      </div>

      <button className="fab" style={{ width: 40, height: 40 }} onClick={onOpenStep} aria-label="Options de l'étape">
        ⋯
      </button>
    </div>
  );
}

export function StepCaption({ editor, onOpenStep }: { editor: EditorApi; onOpenStep: () => void }) {
  const step = editor.currentStep;
  if (!step) return null;
  const count = step.actions.length;
  return (
    <button
      onClick={onOpenStep}
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: 10,
        zIndex: 11,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '9px 12px',
        borderRadius: 14,
        border: '1px solid var(--line)',
        background: 'rgba(10,23,15,0.9)',
        backdropFilter: 'blur(10px)',
        color: 'var(--white)',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <span className="pill pill--green">Étape {editor.stepIndex + 1}</span>
      <span className="grow" style={{ fontWeight: 650, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {step.title || 'Sans titre'}
      </span>
      {count > 0 && <span className="pill">{count} action{count > 1 ? 's' : ''}</span>}
      <span className="muted small">Modifier ›</span>
    </button>
  );
}
