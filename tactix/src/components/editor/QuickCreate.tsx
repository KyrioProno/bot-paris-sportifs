import { useState } from 'react';
import type { EditorApi } from './types';
import { Btn, Icons } from '../ui';
import { ACTIONS } from '../../domain/actions';
import { useStore } from '../../store/workspace';

// ─────────────────────────────────────────────────────────────
// CRÉATION RAPIDE
// Un parcours guidé en 4 gestes pour produire un exercice complet
// en moins d'une minute : joueurs → ballon → trajectoires → fin.
// Les étapes sont créées automatiquement à chaque tracé.
// ─────────────────────────────────────────────────────────────

export function QuickCreateBar({ editor }: { editor: EditorApi }) {
  const { setSettings } = useStore();
  const doc = editor.doc;
  const [step, setStep] = useState(0);

  if (!doc) return null;

  const players = doc.objects.filter((o) => o.kind === 'player').length;
  const opponents = doc.objects.filter((o) => o.kind === 'player' && o.team === 'away').length;
  const balls = doc.objects.filter((o) => o.kind === 'ball').length;
  const actions = doc.steps.reduce((n, s) => n + s.actions.length, 0);

  const steps: { label: string; hint: string; done: boolean; action: () => void }[] = [
    {
      label: 'Placez vos joueurs',
      hint: `${players + opponents} sur le terrain`,
      done: players + opponents >= 2,
      action: () => editor.setTool({ kind: 'place', item: { type: 'player', team: 'home' } }),
    },
    {
      label: 'Placez les adversaires',
      hint: `${opponents} adversaire${opponents > 1 ? 's' : ''}`,
      done: opponents >= 1,
      action: () => editor.setTool({ kind: 'place', item: { type: 'player', team: 'away' } }),
    },
    {
      label: 'Placez le ballon',
      hint: balls > 0 ? 'Ballon en jeu' : 'Touchez le porteur',
      done: balls > 0,
      action: () => editor.setTool({ kind: 'place', item: { type: 'ball' } }),
    },
    {
      label: 'Dessinez une passe ou une course',
      hint: actions > 0 ? `${actions} action${actions > 1 ? 's' : ''} · ${doc.steps.length} étapes` : 'Avec le doigt',
      done: actions > 0,
      action: () => editor.setTool({ kind: 'draw', actionType: 'pass' }),
    },
  ];

  const current = steps[Math.min(step, steps.length - 1)];
  const finished = steps.every((s) => s.done);

  return (
    <div className="suggestion" style={{ bottom: 12 }}>
      <div className="grow">
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>
          Création rapide · {finished ? 'Exercice prêt 🎉' : `Étape ${step + 1}/4`}
        </div>
        <div className="small muted">
          {finished
            ? `${doc.steps.length} étapes générées automatiquement — lancez la lecture.`
            : `${current.label} — ${current.hint}`}
        </div>
      </div>
      {!finished && (
        <Btn
          size="sm"
          variant="primary"
          onClick={() => {
            current.action();
            if (current.done) setStep((s) => s + 1);
          }}
        >
          Faire
        </Btn>
      )}
      {finished && (
        <Btn size="sm" variant="primary" onClick={editor.play}>
          {Icons.play} Lecture
        </Btn>
      )}
      <button
        className="btn btn--icon btn--ghost"
        onClick={() => {
          setSettings({ mode: 'simple' });
          editor.setPrefs((p) => ({ ...p, autoAdvance: true }));
          editor.notify('Création rapide terminée');
        }}
        title="Quitter la création rapide"
      >
        ✕
      </button>
    </div>
  );
}

export function QuickActionStrip({
  editor,
  onDone,
}: {
  editor: EditorApi;
  onDone: () => void;
}) {
  return (
    <div className="toolbar">
      <span className="pill pill--green" style={{ flex: 'none' }}>⚡ Création rapide</span>
      {ACTIONS.slice(0, 4).map((a) => (
        <button
          key={a.type}
          className="tool"
          onClick={() => editor.setTool({ kind: 'draw', actionType: a.type })}
        >
          <span className="tool__emoji">{a.emoji}</span>
          {a.label}
        </button>
      ))}
      <button className="tool" onClick={onDone}>
        <span className="tool__emoji">✅</span>
        Terminer
      </button>
    </div>
  );
}
