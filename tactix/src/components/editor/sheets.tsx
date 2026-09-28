import { useMemo, useState } from 'react';
import { reverseDirection } from '../../domain/doc';
import type { GoalKind, PlayerRole, SceneObject, TactixDoc, Team } from '../../domain/types';
import type { EditorApi } from './types';
import { PLAYER_COLORS } from './types';
import { Btn, Chip, Field, MenuItem, Segmented, Sheet, Stepper, Toggle } from '../ui';
import { ACTIONS, ACTION_LABEL } from '../../domain/actions';
import { EQUIPMENT, EQUIPMENT_CATEGORIES } from '../../domain/equipment';
import { GOAL_CONFIGS, GOAL_SIZES } from '../../domain/goals';
import { FORMAT_GROUPS } from '../../domain/formats';
import { FORMATIONS, ROLE_LABELS, ROLE_ORDER } from '../../domain/formations';
import { PITCH_TEMPLATES } from '../../domain/pitch/dimensions';
import { ORIENTATIONS } from '../../domain/pitch/orientation';
import {
  AGE_GROUPS,
  CATEGORIES,
  INTENSITY_LABELS,
  MATERIAL_IDEAS,
  subcategoriesOf,
} from '../../domain/categories';
import { useStore } from '../../store/workspace';
import { assistantCreate, assistantModify, ASSISTANT_EXAMPLES } from '../../domain/assistant';
import { docToSvg } from '../../export/svg';
import { downloadBlob, downloadText, safeFilename, svgToPngBlob } from '../../export/image';
import { buildDocPrintHtml, printHtml } from '../../export/pdf';
import { copyToClipboard, shareDoc } from '../../export/share';
import { autoInstructions } from '../../domain/steps';
import { formatMinutes } from '../../domain/session';

// ─────────────────────────────────────────────────────────────
// Feuilles de l'éditeur : ajout, objet, action, options, export,
// fiche d'exercice, étape, assistant.
// ─────────────────────────────────────────────────────────────

export function AddMenu({
  editor,
  open,
  onClose,
  onAssistant,
}: {
  editor: EditorApi;
  open: boolean;
  onClose: () => void;
  onAssistant: () => void;
}) {
  const [tab, setTab] = useState<'joueur' | 'materiel' | 'but' | 'zone'>('joueur');
  const advanced = useStore().ws.settings.mode === 'advanced';

  const doPlace = (item: Parameters<EditorApi['placeAt']>[1]) => {
    editor.setTool({ kind: 'place', item });
    onClose();
  };

  return (
    <Sheet open={open} title="Ajouter" onClose={onClose}>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { id: 'joueur', label: 'Joueurs' },
          { id: 'materiel', label: 'Matériel' },
          { id: 'but', label: 'Buts' },
          { id: 'zone', label: 'Zone' },
        ]}
      />

      {tab === 'joueur' && (
        <>
          <div className="spacer" />
          <div className="grid-2">
            <Btn onClick={() => doPlace({ type: 'player', team: 'home' })}>
              🔵 Joueur (équipe)
            </Btn>
            <Btn onClick={() => doPlace({ type: 'player', team: 'away' })}>
              🔴 Adversaire
            </Btn>
            <Btn onClick={() => doPlace({ type: 'player', team: 'neutral' })}>
              🟠 Neutre / joker
            </Btn>
            <Btn onClick={() => doPlace({ type: 'player', team: 'home', keeper: true })}>
              🧤 Gardien
            </Btn>
            <Btn onClick={() => doPlace({ type: 'player', team: 'away', keeper: true })}>
              🧤 Gardien adverse
            </Btn>
            <Btn onClick={() => doPlace({ type: 'ball' })}>⚽ Ballon</Btn>
            <Btn onClick={() => editor.duplicateSelected()}>⧉ Dupliquer la sélection</Btn>
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>
            Astuce : un appui long sur un joueur ouvre son menu complet (renommer, numéro,
            couleur, poste, trajectoires).
          </p>
        </>
      )}

      {tab === 'materiel' && (
        <div className="spacer">
          {EQUIPMENT_CATEGORIES.map((cat) => (
            <div key={cat.id} style={{ marginBottom: 14 }}>
              <div className="h3" style={{ marginBottom: 8 }}>
                {cat.label}
              </div>
              <div className="wrap">
                {EQUIPMENT.filter((e) => e.category === cat.id).map((e) => (
                  <Chip key={e.id} onClick={() => doPlace({ type: 'equipment', itemType: e.id })}>
                    {e.emoji} {e.label}
                  </Chip>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'but' && (
        <>
          <div className="h3" style={{ margin: '10px 0 8px' }}>Configurations prédéfinies</div>
          <div className="wrap">
            {GOAL_CONFIGS.map((g) => (
              <Chip
                key={g.id}
                active={editor.doc?.goalConfig === g.id}
                onClick={() => {
                  editor.setGoalConfig(g.id);
                  onClose();
                }}
              >
                {g.emoji} {g.label}
              </Chip>
            ))}
          </div>
          <div className="h3" style={{ margin: '16px 0 8px' }}>But seul (déplaçable, pivotable)</div>
          <div className="wrap">
            {(Object.keys(GOAL_SIZES) as GoalKind[]).map((k) => (
              <Chip key={k} onClick={() => doPlace({ type: 'goal', goalKind: k })}>
                🥅 {GOAL_SIZES[k].label}
              </Chip>
            ))}
          </div>
        </>
      )}

      {tab === 'zone' && (
        <>
          <div className="spacer" />
          <Btn block onClick={() => doPlace({ type: 'zone' })}>
            🟩 Zone colorée 10 × 10 m
          </Btn>
          <div className="spacer" />
          <p className="small muted">
            Les zones servent à matérialiser les espaces de travail (carré de passes, zone de
            pressing, couloir).
          </p>
        </>
      )}

      {advanced && (
        <>
          <div className="divider" />
          <MenuItem emoji="✨" label="Créer avec l’assistant" hint="Décrivez l’exercice en une phrase" onClick={() => { onClose(); onAssistant(); }} />
        </>
      )}
    </Sheet>
  );
}

export function ObjectSheet({
  editor,
  open,
  objectId,
  onClose,
  onDeleteKeepActions,
}: {
  editor: EditorApi;
  open: boolean;
  objectId?: string;
  onClose: () => void;
  onDeleteKeepActions: () => void;
}) {
  const object = editor.doc?.objects.find((o) => o.id === objectId);
  if (!object) return null;
  const kind = object.kind;

  return (
    <Sheet
      open={open}
      title={
        kind === 'player'
          ? `${object.team === 'away' ? 'Adversaire' : object.team === 'neutral' ? 'Neutre' : 'Joueur'} ${object.number ?? ''}`
          : kind === 'ball'
            ? 'Ballon'
            : kind === 'goal'
              ? 'But'
              : kind === 'zone'
                ? 'Zone'
                : 'Matériel'
      }
      onClose={onClose}
    >
      {kind === 'player' && <PlayerEditor editor={editor} object={object} />}
      {kind === 'ball' && <BallEditor editor={editor} object={object} />}
      {kind === 'equipment' && <EquipmentEditor editor={editor} object={object} />}
      {(kind === 'goal' || kind === 'zone') && <PropEditor editor={editor} object={object} />}

      <div className="divider" />
      <div className="grid-2">
        <Btn onClick={() => editor.duplicateSelected()}>⧉ Dupliquer</Btn>
        <Btn onClick={() => editor.repeatSelected(3, 3)}>🔁 Répéter ×3</Btn>
        <Btn onClick={editor.toggleLockSelected}>{object.locked ? '🔓 Déverrouiller' : '🔒 Verrouiller'}</Btn>
        <Btn variant="danger" onClick={onDeleteKeepActions}>
          🗑️ Supprimer
        </Btn>
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>
        Glissez l’objet du doigt pour le déplacer. Le bouton « Supprimer » retire aussi ses
        trajectoires ; utilisez « Garder les trajectoires » pour les conserver.
      </p>
      <div className="spacer" />
      <Btn block variant="ghost" onClick={onDeleteKeepActions}>
        Supprimer en gardant les trajectoires
      </Btn>
    </Sheet>
  );
}

function PlayerEditor({ editor, object }: { editor: EditorApi; object: SceneObject }) {
  const [name, setName] = useState(object.name ?? '');
  return (
    <>
      <Field label="Nom (facultatif)">
        <div className="row">
          <input
            className="input"
            value={name}
            placeholder="Ex. capitaine, relayeur…"
            onChange={(e) => setName(e.target.value)}
          />
          <Btn size="sm" onClick={() => editor.updateSelected({ name })}>
            OK
          </Btn>
        </div>
      </Field>

      <div className="field">
        <label>Numéro</label>
        <div className="row">
          <Stepper
            value={object.number ?? 0}
            min={0}
            max={99}
            onChange={(v) => editor.updateSelected({ number: v })}
          />
          <div className="wrap grow">
            {[1, 4, 6, 8, 9, 10, 11].map((n) => (
              <Chip key={n} onClick={() => editor.updateSelected({ number: n })}>
                {n}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      <div className="field">
        <label>Couleur</label>
        <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
          {PLAYER_COLORS.map((c) => (
            <button
              key={c}
              className={`color-dot${object.color === c ? ' is-active' : ''}`}
              style={{ background: c }}
              onClick={() => editor.updateSelected({ color: c })}
              aria-label={`Couleur ${c}`}
            />
          ))}
          <Chip onClick={() => editor.updateSelected({ color: undefined })}>Auto</Chip>
        </div>
      </div>

      <div className="field">
        <label>Équipe</label>
        <Segmented<Team>
          value={(object.team ?? 'home') as Team}
          onChange={(t) => editor.updateSelected({ team: t })}
          options={[
            { id: 'home', label: 'Équipe' },
            { id: 'away', label: 'Adversaire' },
            { id: 'neutral', label: 'Neutre' },
          ]}
        />
      </div>

      <div className="field">
        <label>Poste</label>
        <div className="wrap">
          {ROLE_ORDER.map((r) => (
            <Chip
              key={r}
              active={object.role === r}
              onClick={() =>
                editor.updateSelected({
                  role: r as PlayerRole,
                  keeper: r === 'GK' ? true : undefined,
                })
              }
            >
              {r}
            </Chip>
          ))}
        </div>
        <p className="small muted">{ROLE_LABELS[(object.role ?? 'MC') as PlayerRole]}</p>
      </div>

      <Toggle
        label="Afficher le nom"
        value={!!object.showName}
        onChange={(v) => editor.updateSelected({ showName: v })}
      />

      <div className="divider" />
      <div className="h3" style={{ marginBottom: 8 }}>Créer une trajectoire</div>
      <div className="wrap">
        {ACTIONS.map((a) => (
          <Chip
            key={a.type}
            onClick={() => {
              editor.setTool({ kind: 'draw', actionType: a.type });
            }}
          >
            {a.emoji} {a.label}
          </Chip>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>
        Sélectionnez un type puis dessinez directement sur le terrain : l’étape suivante est créée
        automatiquement.
      </p>
    </>
  );
}

function BallEditor({ editor, object }: { editor: EditorApi; object: SceneObject }) {
  const doc = editor.doc;
  const players = doc?.objects.filter((o) => o.kind === 'player') ?? [];
  return (
    <>
      <div className="field">
        <label>Attribuer le ballon</label>
        <div className="wrap">
          <Chip
            active={!object.ownerId}
            onClick={() => {
              editor.patch((d) => ({
                ...d,
                objects: d.objects.map((o) => (o.id === object.id ? { ...o, ownerId: null } : o)),
                steps: d.steps.map((s, i) =>
                  i === editor.stepIndex
                    ? { ...s, ballOwners: { ...s.ballOwners, [object.id]: null } }
                    : s,
                ),
              }));
            }}
          >
            Ballon libre
          </Chip>
          {players.map((p) => (
            <Chip
              key={p.id}
              active={object.ownerId === p.id}
              onClick={() =>
                editor.patch((d) => ({
                  ...d,
                  objects: d.objects.map((o) => (o.id === object.id ? { ...o, ownerId: p.id } : o)),
                  steps: d.steps.map((s, i) =>
                    i === editor.stepIndex
                      ? { ...s, ballOwners: { ...s.ballOwners, [object.id]: p.id } }
                      : s,
                  ),
                }))
              }
            >
              {p.team === 'away' ? '🔴' : p.team === 'neutral' ? '🟠' : '🔵'} {p.number ?? '?'}
            </Chip>
          ))}
        </div>
      </div>
      <p className="small muted">
        Le ballon suit automatiquement son porteur dans les étapes, et change de propriétaire après
        chaque passe.
      </p>
    </>
  );
}

function EquipmentEditor({ editor, object }: { editor: EditorApi; object: SceneObject }) {
  const item = EQUIPMENT.find((e) => e.id === object.itemType);
  return (
    <>
      <div className="field">
        <label>Rotation : {Math.round(object.rotation ?? 0)}°</label>
        <input
          type="range"
          min={0}
          max={345}
          step={15}
          value={object.rotation ?? 0}
          onChange={(e) => editor.updateSelected({ rotation: Number(e.target.value) })}
        />
      </div>
      <div className="field">
        <label>Taille : ×{(object.scale ?? 1).toFixed(1)}</label>
        <input
          type="range"
          min={0.5}
          max={3}
          step={0.1}
          value={object.scale ?? 1}
          onChange={(e) => editor.updateSelected({ scale: Number(e.target.value) })}
        />
      </div>
      <div className="field">
        <label>Couleur</label>
        <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
          {PLAYER_COLORS.map((c) => (
            <button
              key={c}
              className={`color-dot${object.color === c ? ' is-active' : ''}`}
              style={{ background: c }}
              onClick={() => editor.updateSelected({ color: c })}
              aria-label={`Couleur ${c}`}
            />
          ))}
          <Chip onClick={() => editor.updateSelected({ color: undefined })}>Auto</Chip>
        </div>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <Btn size="sm" onClick={() => editor.rotateSelected(-15)}>↺ -15°</Btn>
        <Btn size="sm" onClick={() => editor.rotateSelected(15)}>↻ +15°</Btn>
        <Btn size="sm" onClick={() => editor.updateSelected({ rotation: 0 })}>Redresser</Btn>
      </div>
      {item?.repeatable && (
        <p className="small muted" style={{ marginTop: 10 }}>
          Astuce : « Répéter ×3 » crée une ligne régulière de {item.label.toLowerCase()}s — idéal
          pour un atelier.
        </p>
      )}
    </>
  );
}

function PropEditor({ editor, object }: { editor: EditorApi; object: SceneObject }) {
  if (object.kind === 'goal') {
    return (
      <>
        <div className="field">
          <label>Type de but</label>
          <Segmented<GoalKind>
            value={(object.goalKind ?? 'small') as GoalKind}
            onChange={(k) => editor.updateSelected({ goalKind: k })}
            options={[
              { id: 'large', label: 'Grand' },
              { id: 'small', label: 'Petit' },
              { id: 'mini', label: 'Mini' },
            ]}
          />
        </div>
        <div className="field">
          <label>Rotation : {Math.round(object.rotation ?? 0)}°</label>
          <input
            type="range"
            min={0}
            max={345}
            step={15}
            value={object.rotation ?? 0}
            onChange={(e) => editor.updateSelected({ rotation: Number(e.target.value) })}
          />
        </div>
      </>
    );
  }
  if (object.kind === 'zone') {
    return (
      <>
        <div className="field">
          <label>Largeur : {(object.zoneW ?? 10).toFixed(0)} m</label>
          <input
            type="range"
            min={2}
            max={60}
            step={1}
            value={object.zoneW ?? 10}
            onChange={(e) => editor.updateSelected({ zoneW: Number(e.target.value) })}
          />
        </div>
        <div className="field">
          <label>Hauteur : {(object.zoneH ?? 10).toFixed(0)} m</label>
          <input
            type="range"
            min={2}
            max={68}
            step={1}
            value={object.zoneH ?? 10}
            onChange={(e) => editor.updateSelected({ zoneH: Number(e.target.value) })}
          />
        </div>
        <div className="field">
          <label>Couleur</label>
          <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
            {PLAYER_COLORS.map((c) => (
              <button
                key={c}
                className={`color-dot${object.zoneColor === c ? ' is-active' : ''}`}
                style={{ background: c }}
                onClick={() => editor.updateSelected({ zoneColor: c })}
                aria-label={`Couleur ${c}`}
              />
            ))}
          </div>
        </div>
      </>
    );
  }
  return null;
}

export function ActionSheet({
  editor,
  open,
  onClose,
}: {
  editor: EditorApi;
  open: boolean;
  onClose: () => void;
}) {
  const action = editor.selectedAction;
  if (!action) return null;
  const receiver = editor.doc?.objects.find((o) => o.id === action.receiverId);
  return (
    <Sheet open={open} title={`Trajectoire — ${ACTION_LABEL[action.type]}`} onClose={onClose}>
      <div className="field">
        <label>Type</label>
        <div className="wrap">
          {ACTIONS.map((a) => (
            <Chip
              key={a.type}
              active={action.type === a.type}
              onClick={() => editor.patchAction(action.id, { type: a.type, style: a.style })}
            >
              {a.emoji} {a.label}
            </Chip>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Couleur</label>
        <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
          {PLAYER_COLORS.map((c) => (
            <button
              key={c}
              className={`color-dot${action.color === c ? ' is-active' : ''}`}
              style={{ background: c }}
              onClick={() => editor.patchAction(action.id, { color: c })}
              aria-label={`Couleur ${c}`}
            />
          ))}
          <Chip onClick={() => editor.patchAction(action.id, { color: undefined })}>Auto</Chip>
        </div>
      </div>
      <div className="field">
        <label>Style de ligne</label>
        <Segmented
          value={action.style}
          onChange={(v) => editor.patchAction(action.id, { style: v })}
          options={[
            { id: 'solid', label: 'Continue' },
            { id: 'dashed', label: 'Tirets' },
            { id: 'dotted', label: 'Points' },
          ]}
        />
      </div>
      <Toggle
        label="Ligne courbe"
        hint="Transforme la trajectoire en arc (passe enroulée, course courbe)"
        value={action.curved}
        onChange={(v) => editor.patchAction(action.id, { curved: v })}
      />
      <Toggle
        label="Flèche"
        value={action.arrow}
        onChange={(v) => editor.patchAction(action.id, { arrow: v })}
      />
      <div className="field" style={{ marginTop: 12 }}>
        <label>Destinataire</label>
        <div className="wrap">
          <Chip active={!action.receiverId} onClick={() => editor.patchAction(action.id, { receiverId: null })}>
            Aucun (ballon dans l’espace)
          </Chip>
          {(editor.doc?.objects ?? [])
            .filter((o) => o.kind === 'player' && o.id !== action.ownerId)
            .map((p) => (
              <Chip
                key={p.id}
                active={action.receiverId === p.id}
                onClick={() => editor.patchAction(action.id, { receiverId: p.id })}
              >
                {p.team === 'away' ? '🔴' : '🔵'} {p.number ?? '?'}
              </Chip>
            ))}
        </div>
        {receiver && (
          <p className="small muted">
            Le ballon arrivera sur {receiver.team === 'away' ? 'l’adversaire' : 'le joueur'}{' '}
            {receiver.number} à l’étape suivante.
          </p>
        )}
      </div>
      <div className="divider" />
      <Btn block variant="danger" onClick={() => { editor.deleteActionById(action.id); onClose(); }}>
        Supprimer la trajectoire
      </Btn>
    </Sheet>
  );
}

export function OptionsSheet({
  editor,
  open,
  onClose,
}: {
  editor: EditorApi;
  open: boolean;
  onClose: () => void;
}) {
  const { ws, setSettings } = useStore();
  const doc = editor.doc;
  const [custom, setCustom] = useState({
    length: doc?.pitch.length ?? 50,
    width: doc?.pitch.width ?? 40,
  });
  if (!doc) return null;
  const advanced = ws.settings.mode === 'advanced';

  return (
    <Sheet open={open} title="Options" onClose={onClose}>
      <div className="h3" style={{ marginBottom: 8 }}>Terrain</div>
      <div className="wrap">
        {PITCH_TEMPLATES.map((t) => (
          <Chip
            key={t.id}
            active={doc.pitch.template === t.id}
            onClick={() => editor.setPitch(t.id, doc.pitch.orientation, custom)}
          >
            {t.emoji} {t.label}
          </Chip>
        ))}
      </div>
      {doc.pitch.template === 'custom' && (
        <div className="row" style={{ marginTop: 10, gap: 10 }}>
          <Field label="Longueur (m)">
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
          </Field>
          <Field label="Largeur (m)">
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
          </Field>
        </div>
      )}

      <div className="field" style={{ marginTop: 12 }}>
        <label>Orientation</label>
        <div className="wrap">
          {ORIENTATIONS.map((o) => (
            <Chip
              key={o.id}
              active={doc.pitch.orientation === o.id}
              onClick={() => editor.setPitch(doc.pitch.template, o.id, custom)}
            >
              {o.label}
            </Chip>
          ))}
        </div>
        <p className="small muted">
          Le passage en vertical recalcule réellement les coordonnées : joueurs, buts, matériel et
          trajectoires suivent le terrain.
        </p>
      </div>

      <div className="h3" style={{ margin: '16px 0 8px' }}>Buts</div>
      <div className="wrap">
        {GOAL_CONFIGS.map((g) => (
          <Chip key={g.id} active={doc.goalConfig === g.id} onClick={() => editor.setGoalConfig(g.id)}>
            {g.emoji} {g.label}
          </Chip>
        ))}
      </div>

      <div className="h3" style={{ margin: '16px 0 8px' }}>Format de jeu</div>
      {FORMAT_GROUPS.map((group) => (
        <div key={group.title} style={{ marginBottom: 10 }}>
          <div className="small muted" style={{ marginBottom: 6 }}>{group.title}</div>
          <div className="wrap">
            {group.ids.map((id) => (
              <Chip key={id} active={doc.format === id} onClick={() => editor.setFormat(id)}>
                {id}
              </Chip>
            ))}
          </div>
        </div>
      ))}

      <div className="h3" style={{ margin: '16px 0 8px' }}>Formations</div>
      <div className="small muted">Équipe</div>
      <div className="wrap" style={{ marginBottom: 8 }}>
        <Chip onClick={() => editor.applyFormationTo('auto', 'home')}>Auto</Chip>
        {FORMATIONS.map((f) => (
          <Chip key={f.id} onClick={() => editor.applyFormationTo(f.id, 'home')}>
            {f.label}
          </Chip>
        ))}
      </div>
      <div className="small muted">Adversaire</div>
      <div className="wrap">
        <Chip onClick={() => editor.applyFormationTo('auto', 'away')}>Auto</Chip>
        {FORMATIONS.map((f) => (
          <Chip key={f.id} onClick={() => editor.applyFormationTo(f.id, 'away')}>
            {f.label}
          </Chip>
        ))}
      </div>

      <div className="divider" />
      <div className="h3" style={{ marginBottom: 8 }}>Précision & placement</div>
      <Toggle
        label="Placement précis"
        hint="Magnétisme sur les lignes du terrain et alignement avec les autres joueurs"
        value={editor.prefs.snap}
        onChange={editor.togglePrecision}
      />
      <Toggle
        label="Grille"
        hint="Affiche une grille d’aide au placement"
        value={editor.prefs.grid}
        onChange={editor.toggleGrid}
      />
      <div className="field" style={{ marginTop: 10 }}>
        <label>Pas de la grille : {editor.prefs.gridStep} m</label>
        <input
          type="range"
          min={1}
          max={20}
          step={1}
          value={editor.prefs.gridStep}
          onChange={(e) => editor.setPrefs((p) => ({ ...p, gridStep: Number(e.target.value) }))}
        />
      </div>

      <div className="h3" style={{ margin: '16px 0 8px' }}>Animation</div>
      <div className="field">
        <label>Vitesse : ×{ws.settings.speed.toFixed(1)}</label>
        <input
          type="range"
          min={0.5}
          max={2.5}
          step={0.1}
          value={ws.settings.speed}
          onChange={(e) => setSettings({ speed: Number(e.target.value) })}
        />
      </div>
      <div className="field">
        <label>Maintien de l’étape : {editor.currentStep?.holdMs ?? 0} ms</label>
        <input
          type="range"
          min={0}
          max={2500}
          step={50}
          value={editor.currentStep?.holdMs ?? 0}
          onChange={(e) => editor.setStepMeta({ holdMs: Number(e.target.value) })}
        />
      </div>
      <div className="field">
        <label>Durée de la transition : {editor.currentStep?.transitionMs ?? 0} ms</label>
        <input
          type="range"
          min={200}
          max={4000}
          step={50}
          value={editor.currentStep?.transitionMs ?? 0}
          onChange={(e) => editor.setStepMeta({ transitionMs: Number(e.target.value) })}
        />
      </div>
      <Toggle
        label="Enchaîner les étapes après un tracé"
        hint="Passe automatiquement à l’étape suivante (création ultra rapide)"
        value={editor.prefs.autoAdvance}
        onChange={(v) => editor.setPrefs((p) => ({ ...p, autoAdvance: v }))}
      />
      <Toggle
        label="Afficher les distances de passe"
        value={editor.prefs.showDistances}
        onChange={(v) => editor.setPrefs((p) => ({ ...p, showDistances: v }))}
      />

      <div className="divider" />
      <Toggle
        label="Options avancées"
        hint="Affiche les outils supplémentaires (buts, zones, réglages détaillés)"
        value={advanced}
        onChange={(v) => setSettings({ mode: v ? 'advanced' : 'simple' })}
      />

      <div className="divider" />
      <div className="h3" style={{ marginBottom: 8 }}>Exercice</div>
      <div className="grid-2">
        <Btn onClick={() => editor.patch(reverseDirection)}>↔️ Inverser le sens</Btn>
        <Btn variant="danger" onClick={editor.clearAll}>🧹 Vider le terrain</Btn>
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>
        Tout est enregistré automatiquement. Utilisez ↶ Annuler pour revenir en arrière.
      </p>
    </Sheet>
  );
}



export function ExportSheet({
  editor,
  open,
  onClose,
  onPresent,
  onOpenInfo,
}: {
  editor: EditorApi;
  open: boolean;
  onClose: () => void;
  onPresent: () => void;
  onOpenInfo: () => void;
}) {
  const doc = editor.doc;
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  if (!doc) return null;

  const withBusy = async (label: string, fn: () => Promise<void> | void) => {
    setBusy(label);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Action impossible');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open={open} title="Exporter & présenter" onClose={onClose}>
      <MenuItem
        emoji="🖼️"
        label="Export image (PNG)"
        hint="Terrain en haute résolution, prêt à partager"
        onClick={() =>
          withBusy('png', async () => {
            const svg = docToSvg(doc, {
              stepIndex: editor.stepIndex,
              title: doc.name,
              subtitle: `Étape ${editor.stepIndex + 1} · ${formatMinutes(doc.info.durationMin)}`,
            });
            const blob = await svgToPngBlob(svg, 2200);
            downloadBlob(blob, safeFilename(doc.name, '.png'));
            setMessage('Image téléchargée');
          })
        }
      />
      <MenuItem
        emoji="🗂️"
        label="Export image — toutes les étapes"
        hint="Une image par étape"
        onClick={() =>
          withBusy('png-all', async () => {
            for (let i = 0; i < doc.steps.length; i++) {
              const svg = docToSvg(doc, {
                stepIndex: i,
                title: `${doc.name} — étape ${i + 1}`,
              });
              const blob = await svgToPngBlob(svg, 1800);
              downloadBlob(blob, safeFilename(`${doc.name}-etape-${i + 1}`, '.png'));
              await new Promise((r) => setTimeout(r, 250));
            }
            setMessage(`${doc.steps.length} images téléchargées`);
          })
        }
      />
      <MenuItem
        emoji="📄"
        label="Export PDF (fiche complète)"
        hint="Nom, objectif, terrain, étapes, durée"
        onClick={() =>
          withBusy('pdf', async () => {
            const ok = printHtml(buildDocPrintHtml(doc), doc.name);
            setMessage(ok ? 'Fiche prête à imprimer / enregistrer en PDF' : 'Autorisez les pop-ups');
          })
        }
      />
      <MenuItem
        emoji="📤"
        label="Partager"
        hint="Image + description via le partage natif"
        onClick={() =>
          withBusy('share', async () => {
            const res = await shareDoc(doc, editor.stepIndex);
            setMessage(res.message);
          })
        }
      />
      <MenuItem
        emoji="📝"
        label="Copier les instructions"
        hint="Texte automatique des trajectoires et étapes"
        onClick={() =>
          withBusy('text', async () => {
            const text = `${doc.name}\n\n${autoInstructions(doc)}`;
            const ok = await copyToClipboard(text);
            if (ok) setMessage('Instructions copiées');
            else downloadText(text, safeFilename(doc.name, '.txt'));
          })
        }
      />
      <MenuItem emoji="📺" label="Mode présentation" hint="Affichage plein écran pour les joueurs" onClick={onPresent} />
      <MenuItem emoji="🧾" label="Fiche d’exercice" hint="Objectif, catégorie, matériel, points clés" onClick={onOpenInfo} />

      {busy && <p className="muted small">Traitement… {busy}</p>}
      {message && (
        <p className="small" style={{ color: 'var(--green)', marginTop: 8 }}>
          {message}
        </p>
      )}
    </Sheet>
  );
}

export function InfoSheet({
  editor,
  open,
  onClose,
}: {
  editor: EditorApi;
  open: boolean;
  onClose: () => void;
}) {
  const doc = editor.doc;
  if (!doc) return null;
  const info = doc.info;

  const set = (patch: Partial<typeof info>) =>
    editor.patch((d) => ({ ...d, info: { ...d.info, ...patch } }));
  const setDoc = (patch: Partial<TactixDoc>) => editor.patch((d) => ({ ...d, ...patch }));

  return (
    <Sheet open={open} title="Fiche de l’exercice" onClose={onClose}>
      <Field label="Nom">
        <input className="input" value={doc.name} onChange={(e) => setDoc({ name: e.target.value })} />
      </Field>
      <Field label="Objectif">
        <textarea
          className="input"
          value={info.objective}
          placeholder="Ex. Enchaîner passe, remise et finition dans le dernier tiers."
          onChange={(e) => set({ objective: e.target.value })}
        />
      </Field>

      <div className="field">
        <label>Catégorie</label>
        <div className="wrap">
          {CATEGORIES.map((c) => (
            <Chip
              key={c.id}
              active={info.category === c.id}
              onClick={() => set({ category: c.id, subcategory: null })}
            >
              {c.emoji} {c.label}
            </Chip>
          ))}
        </div>
      </div>

      {info.category && (
        <div className="field">
          <label>Sous-catégorie</label>
          <div className="wrap">
            {subcategoriesOf(info.category).map((s) => (
              <Chip key={s} active={info.subcategory === s} onClick={() => set({ subcategory: s })}>
                {s}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 10 }}>
        <Field label="Joueurs">
          <input
            className="input"
            value={info.players}
            placeholder="3 attaquants · 2 défenseurs"
            onChange={(e) => set({ players: e.target.value })}
          />
        </Field>
      </div>
      <div className="field">
        <label>Catégorie d’âge</label>
        <div className="wrap">
          {AGE_GROUPS.map((a) => (
            <Chip key={a} active={info.ageGroup === a} onClick={() => set({ ageGroup: a })}>
              {a}
            </Chip>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Durée : {info.durationMin} min</label>
        <input
          type="range"
          min={5}
          max={90}
          step={5}
          value={info.durationMin}
          onChange={(e) => set({ durationMin: Number(e.target.value) })}
        />
      </div>

      <div className="field">
        <label>Intensité : {INTENSITY_LABELS[Math.min(4, Math.max(0, info.intensity - 1))]}</label>
        <div className="wrap">
          {[1, 2, 3, 4, 5].map((n) => (
            <Chip key={n} active={info.intensity === n} onClick={() => set({ intensity: n })}>
              {'●'.repeat(n)}
            </Chip>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Matériel</label>
        <div className="wrap">
          {MATERIAL_IDEAS.map((m) => (
            <Chip
              key={m}
              active={info.material.includes(m)}
              onClick={() =>
                set({
                  material: info.material.includes(m)
                    ? info.material.filter((x) => x !== m)
                    : [...info.material, m],
                })
              }
            >
              {m}
            </Chip>
          ))}
        </div>
      </div>

      <Field label="Instructions">
        <textarea
          className="input"
          value={info.instructions}
          placeholder="Déroulé, règles, contraintes…"
          onChange={(e) => set({ instructions: e.target.value })}
        />
      </Field>

      <div className="field">
        <label>Points clés</label>
        {info.keyPoints.map((k, i) => (
          <div className="row" key={i} style={{ marginBottom: 6 }}>
            <input
              className="input"
              value={k}
              onChange={(e) => {
                const next = [...info.keyPoints];
                next[i] = e.target.value;
                set({ keyPoints: next });
              }}
            />
            <Btn
              size="sm"
              variant="ghost"
              onClick={() => set({ keyPoints: info.keyPoints.filter((_, idx) => idx !== i) })}
            >
              ✕
            </Btn>
          </div>
        ))}
        <Btn size="sm" onClick={() => set({ keyPoints: [...info.keyPoints, ''] })}>
          ＋ Ajouter un point clé
        </Btn>
      </div>

      <Field label="Variantes">
        <textarea
          className="input"
          value={info.variants}
          placeholder="Ex. Ajouter un défenseur, limiter à 2 touches…"
          onChange={(e) => set({ variants: e.target.value })}
        />
      </Field>

      <Btn block variant="primary" onClick={onClose}>
        Terminé
      </Btn>
    </Sheet>
  );
}

export function StepSheet({
  editor,
  open,
  onClose,
}: {
  editor: EditorApi;
  open: boolean;
  onClose: () => void;
}) {
  const doc = editor.doc;
  const step = editor.currentStep;
  if (!doc || !step) return null;
  return (
    <Sheet open={open} title={`Étape ${editor.stepIndex + 1} / ${doc.steps.length}`} onClose={onClose}>
      <Field label="Titre">
        <input
          className="input"
          value={step.title}
          placeholder="Ex. Remise du 3e homme"
          onChange={(e) => editor.setStepMeta({ title: e.target.value })}
        />
      </Field>
      <Field label="Note">
        <textarea
          className="input"
          value={step.note ?? ''}
          placeholder="Consigne associée à cette étape"
          onChange={(e) => editor.setStepMeta({ note: e.target.value })}
        />
      </Field>
      <div className="field">
        <label>Maintien : {step.holdMs} ms</label>
        <input
          type="range"
          min={0}
          max={2500}
          step={50}
          value={step.holdMs}
          onChange={(e) => editor.setStepMeta({ holdMs: Number(e.target.value) })}
        />
      </div>
      <div className="field">
        <label>Transition : {step.transitionMs} ms</label>
        <input
          type="range"
          min={200}
          max={4000}
          step={50}
          value={step.transitionMs}
          onChange={(e) => editor.setStepMeta({ transitionMs: Number(e.target.value) })}
        />
      </div>

      <div className="grid-2">
        <Btn onClick={editor.duplicateStep}>⧉ Dupliquer l’étape</Btn>
        <Btn onClick={() => editor.moveStep(editor.stepIndex, Math.max(0, editor.stepIndex - 1))}>
          ⬆️ Monter
        </Btn>
        <Btn
          onClick={() =>
            editor.moveStep(editor.stepIndex, Math.min(doc.steps.length - 1, editor.stepIndex + 1))
          }
        >
          ⬇️ Descendre
        </Btn>
        <Btn variant="danger" onClick={editor.removeStep} disabled={doc.steps.length <= 1}>
          🗑️ Supprimer l’étape
        </Btn>
      </div>

      <div className="divider" />
      <div className="h3" style={{ marginBottom: 8 }}>Actions de cette étape</div>
      {step.actions.length === 0 && <p className="small muted">Aucune trajectoire dans cette étape.</p>}
      <div className="list">
        {step.actions.map((a) => (
          <div className="tl-item" key={a.id}>
            <span className="pill pill--blue">{ACTION_LABEL[a.type]}</span>
            <span className="grow small">
              {describeActionShort(a.ownerId, doc)} → {a.receiverId ? describeActionShort(a.receiverId, doc) : 'espace'}
            </span>
            <button className="btn btn--icon btn--ghost" onClick={() => editor.deleteActionById(a.id)}>
              🗑️
            </button>
          </div>
        ))}
      </div>
      <div className="spacer" />
      <p className="small muted">
        Règle automatique : la position finale d’une étape devient la position initiale de l’étape
        suivante. Aucun replacement manuel n’est nécessaire.
      </p>
    </Sheet>
  );
}

function describeActionShort(id: string, doc: TactixDoc): string {
  const o = doc.objects.find((x) => x.id === id);
  if (!o) return '—';
  if (o.kind === 'player') return `#${o.number ?? '?'}`;
  return o.kind;
}

export function AssistantSheet({
  editor,
  open,
  onClose,
  mode,
  onCreate,
}: {
  editor?: EditorApi;
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'modify';
  onCreate: (doc: TactixDoc) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [replies, setReplies] = useState<string[]>([]);

  const run = () => {
    if (!prompt.trim()) return;
    if (mode === 'modify' && editor) {
      const result = assistantModify(editor.doc as TactixDoc, prompt);
      editor.patch(() => result.doc);
      setReplies(result.replies);
    } else {
      const result = assistantCreate(prompt);
      onCreate(result.doc);
      setReplies(result.replies);
    }
    setPrompt('');
  };

  return (
    <Sheet open={open} title={mode === 'modify' ? 'Modifier par texte' : 'Assistant TACTIX'} onClose={onClose}>
      <p className="muted small">
        Décrivez l’exercice ou la modification : terrain, format, buts, matériel, thème. L’application
        génère joueurs, placements, trajectoires, étapes et consignes.
      </p>
      <div className="spacer" />
      <textarea
        className="input"
        value={prompt}
        placeholder={
          mode === 'modify'
            ? 'Ex. Ajoute un défenseur et mets deux petits buts sur les côtés.'
            : 'Ex. Crée un exercice de sortie de balle en 4 contre 3 avec un gardien et une transition rapide.'
        }
        onChange={(e) => setPrompt(e.target.value)}
      />
      <div className="spacer" />
      <Btn block variant="primary" onClick={run}>
        ✨ {mode === 'modify' ? 'Appliquer la modification' : 'Générer l’exercice'}
      </Btn>

      {replies.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          {replies.map((r, i) => (
            <div className="kv" key={i}>
              <span>•</span>
              <span>{r}</span>
            </div>
          ))}
        </div>
      )}

      {mode === 'create' && (
        <>
          <div className="divider" />
          <div className="h3" style={{ marginBottom: 8 }}>Exemples</div>
          <div className="wrap">
            {ASSISTANT_EXAMPLES.map((ex) => (
              <Chip key={ex} onClick={() => setPrompt(ex)}>
                {ex.slice(0, 42)}…
              </Chip>
            ))}
          </div>
        </>
      )}

      {mode === 'modify' && (
        <>
          <div className="divider" />
          <div className="h3" style={{ marginBottom: 8 }}>Commandes reconnues</div>
          <div className="wrap">
            {[
              'Ajoute un défenseur',
              'Passe en 5 contre 4',
              'Mets deux petits buts sur les côtés',
              'Inverse le sens de l’exercice',
              'Ajoute une étape',
              'Terrain vertical',
              'Ajoute des cônes',
              'Durée 20 minutes',
            ].map((c) => (
              <Chip key={c} onClick={() => setPrompt(c)}>
                {c}
              </Chip>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}

export function DeleteConfirmSheet({
  editor,
  onClose,
}: {
  editor: EditorApi;
  onClose: () => void;
}) {
  const ask = editor.askDelete;
  const object = editor.doc?.objects.find((o) => o.id === ask?.ids[0]);
  const name = useMemo(() => {
    if (!object) return 'cet élément';
    if (object.kind === 'player') return `le joueur ${object.number ?? ''}`.trim();
    return object.kind === 'ball' ? 'le ballon' : 'cet élément';
  }, [object]);

  return (
    <Sheet open={!!ask} title="Supprimer également ses trajectoires ?" onClose={onClose}>
      <p className="muted">
        {ask?.linked} trajectoire{(ask?.linked ?? 0) > 1 ? 's' : ''} sont liées à {name}.
      </p>
      <div className="spacer" />
      <Btn block variant="danger" onClick={() => editor.performDelete(ask?.ids ?? [], true)}>
        Oui, supprimer {name} et ses trajectoires
      </Btn>
      <div className="spacer" />
      <Btn block variant="ghost" onClick={() => editor.performDelete(ask?.ids ?? [], false)}>
        Non, garder les trajectoires
      </Btn>
    </Sheet>
  );
}
