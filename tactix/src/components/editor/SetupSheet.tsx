import { useState } from 'react';
import type { EditorApi } from './types';
import { Btn, Chip, Segmented, Sheet } from '../ui';
import { PITCH_TEMPLATES } from '../../domain/pitch/dimensions';
import { ORIENTATIONS } from '../../domain/pitch/orientation';
import { GOAL_CONFIGS } from '../../domain/goals';
import { FORMAT_GROUPS, GAME_FORMATS } from '../../domain/formats';
import { FORMATIONS } from '../../domain/formations';

// ─────────────────────────────────────────────────────────────
// CONFIGURATION RAPIDE
// Proposée à la création d'un exercice ou d'une tactique :
// terrain, orientation, buts, format, formation — puis on dessine.
// Toutes ces options restent modifiables à tout moment sans casser
// l'exercice (Options avancées).
// ─────────────────────────────────────────────────────────────

const GOAL_SHORTCUTS = [
  'none',
  'oneLarge',
  'oneLargeKeeper',
  'twoLarge',
  'twoSmall',
  'twoSmallSides',
  'fourSmall',
  'oneLargeTwoSmall',
] as const;

export function SetupSheet({
  editor,
  open,
  onClose,
}: {
  editor: EditorApi;
  open: boolean;
  onClose: () => void;
}) {
  const doc = editor.doc;
  const [custom, setCustom] = useState({
    length: doc?.pitch.length ?? 50,
    width: doc?.pitch.width ?? 40,
  });
  const [tab, setTab] = useState<'terrain' | 'buts' | 'format' | 'formation'>('terrain');
  if (!doc) return null;

  return (
    <Sheet open={open} title="Configuration rapide" onClose={onClose}>
      <p className="muted small">
        Choisissez votre terrain, puis commencez à placer les joueurs. Tout reste modifiable ensuite.
      </p>
      <div className="spacer" />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { id: 'terrain', label: 'Terrain' },
          { id: 'buts', label: 'Buts' },
          { id: 'format', label: 'Format' },
          { id: 'formation', label: 'Formation' },
        ]}
      />

      {tab === 'terrain' && (
        <>
          <div className="spacer" />
          <div className="h3" style={{ marginBottom: 8 }}>Type de terrain</div>
          <div className="grid-2">
            {PITCH_TEMPLATES.map((t) => (
              <button
                key={t.id}
                className={`menu-item${doc.pitch.template === t.id ? ' is-active' : ''}`}
                style={
                  doc.pitch.template === t.id
                    ? { border: '1px solid rgba(32,230,122,0.55)', background: 'rgba(32,230,122,0.1)' }
                    : undefined
                }
                onClick={() => editor.setPitch(t.id, doc.pitch.orientation, custom)}
              >
                <span className="menu-item__emoji">{t.emoji}</span>
                <span className="grow">
                  <span style={{ display: 'block' }}>{t.label}</span>
                  <span className="muted small">{t.hint}</span>
                </span>
              </button>
            ))}
          </div>

          {doc.pitch.template === 'custom' && (
            <div className="row" style={{ marginTop: 12, gap: 10 }}>
              <div className="field grow">
                <label>Longueur (m)</label>
                <input
                  className="input"
                  type="number"
                  value={custom.length}
                  onChange={(e) => {
                    const v = Math.max(15, Math.min(120, Number(e.target.value)));
                    setCustom((c) => ({ ...c, length: v }));
                    editor.setPitch('custom', doc.pitch.orientation, { ...custom, length: v });
                  }}
                />
              </div>
              <div className="field grow">
                <label>Largeur (m)</label>
                <input
                  className="input"
                  type="number"
                  value={custom.width}
                  onChange={(e) => {
                    const v = Math.max(12, Math.min(80, Number(e.target.value)));
                    setCustom((c) => ({ ...c, width: v }));
                    editor.setPitch('custom', doc.pitch.orientation, { ...custom, width: v });
                  }}
                />
              </div>
            </div>
          )}

          <div className="h3" style={{ marginTop: 16, marginBottom: 8 }}>Orientation</div>
          <Segmented
            value={doc.pitch.orientation}
            onChange={(o) => editor.setPitch(doc.pitch.template, o, custom)}
            options={ORIENTATIONS.map((o) => ({ id: o.id, label: o.label }))}
          />
          <p className="small muted" style={{ marginTop: 8 }}>
            {doc.pitch.orientation === 'vertical'
              ? 'Le terrain est affiché dans sa largeur : idéal sur téléphone en une main.'
              : 'Le terrain est affiché dans sa longueur.'}
          </p>
        </>
      )}

      {tab === 'buts' && (
        <div className="spacer">
          {GOAL_SHORTCUTS.map((id) => {
            const config = GOAL_CONFIGS.find((c) => c.id === id);
            if (!config) return null;
            const active = doc.goalConfig === id;
            return (
              <button
                key={id}
                className="menu-item"
                style={
                  active
                    ? { border: '1px solid rgba(32,230,122,0.55)', background: 'rgba(32,230,122,0.1)' }
                    : undefined
                }
                onClick={() => editor.setGoalConfig(id)}
              >
                <span className="menu-item__emoji">{config.emoji}</span>
                <span className="grow">
                  <span style={{ display: 'block' }}>{config.label}</span>
                  <span className="muted small">{config.hint}</span>
                </span>
              </button>
            );
          })}
          <p className="small muted">
            Chaque but reste déplaçable, pivotable et duplicable sur le terrain.
          </p>
        </div>
      )}

      {tab === 'format' && (
        <div className="spacer">
          {FORMAT_GROUPS.map((group) => (
            <div key={group.title} style={{ marginBottom: 14 }}>
              <div className="h3" style={{ marginBottom: 8 }}>{group.title}</div>
              <div className="wrap">
                {group.ids.map((id) => (
                  <Chip key={id} active={doc.format === id} onClick={() => editor.setFormat(id)}>
                    {id}
                  </Chip>
                ))}
              </div>
            </div>
          ))}
          <div className="banner banner--green">
            <span>⚽</span>
            <span>
              Le 11v11 complet est disponible : les joueurs manquants sont placés automatiquement,
              et rien n’est perdu en changeant de format.
            </span>
          </div>
        </div>
      )}

      {tab === 'formation' && (
        <div className="spacer">
          <div className="h3" style={{ marginBottom: 8 }}>Équipe</div>
          <div className="wrap">
            <Chip onClick={() => editor.applyFormationTo('auto', 'home')}>Auto</Chip>
            {FORMATIONS.map((f) => (
              <Chip key={f.id} onClick={() => editor.applyFormationTo(f.id, 'home')}>
                {f.label}
              </Chip>
            ))}
          </div>
          <div className="h3" style={{ margin: '16px 0 8px' }}>Adversaire</div>
          <div className="wrap">
            <Chip onClick={() => editor.applyFormationTo('auto', 'away')}>Auto</Chip>
            {FORMATIONS.map((f) => (
              <Chip key={f.id} onClick={() => editor.applyFormationTo(f.id, 'away')}>
                {f.label}
              </Chip>
            ))}
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>
            Les joueurs sont placés automatiquement, puis vous pouvez les déplacer librement.
          </p>
        </div>
      )}

      <div className="divider" />
      <div className="row" style={{ gap: 8 }}>
        <span className="pill pill--green">{doc.format}</span>
        <span className="pill">{doc.steps.length} étapes</span>
        <span className="pill pill--blue">{GAME_FORMATS.length} formats disponibles</span>
      </div>
      <div className="spacer" />
      <Btn block variant="primary" onClick={onClose}>
        Commencer l’exercice
      </Btn>
    </Sheet>
  );
}
