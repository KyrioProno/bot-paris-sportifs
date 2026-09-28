import { ACTIONS, actionDescriptor, ACTION_LABEL } from '../../domain/actions';
import { LINE_STYLE_OPTIONS, type EditorApi } from './types';
import { Chip } from '../ui';
import { useStore } from '../../store/workspace';

// ─────────────────────────────────────────────────────────────
// Barre contextuelle : jamais 30 boutons à l'écran.
// Les outils affichés dépendent de ce qui est sélectionné.
// ─────────────────────────────────────────────────────────────

export function ContextBar({ editor, onOpenMore }: { editor: EditorApi; onOpenMore: () => void }) {
  const { tool, setTool, primary, selectedAction, prefs } = editor;
  const advanced = useStore().ws.settings.mode === 'advanced';

  // 1. Outil de dessin actif
  if (tool.kind === 'draw') {
    const desc = actionDescriptor(tool.actionType);
    return (
      <div className="toolbar">
        <div
          className="row"
          style={{
            gap: 8,
            paddingRight: 10,
            borderRight: '1px solid var(--line)',
            flex: 'none',
          }}
        >
          <span className="pill pill--green">{desc.emoji} {desc.label}</span>
          <span className="small muted" style={{ whiteSpace: 'nowrap' }}>Dessinez sur le terrain</span>
        </div>
        {ACTIONS.map((a) => (
          <button
            key={a.type}
            className={`tool${tool.actionType === a.type ? ' is-active' : ''}`}
            onClick={() => setTool({ kind: 'draw', actionType: a.type })}
            title={a.hint}
          >
            <span className="tool__emoji">{a.emoji}</span>
            {a.label}
          </button>
        ))}
        <button className="tool" onClick={() => setTool({ kind: 'select' })}>
          <span className="tool__emoji">✅</span>
          Terminé
        </button>
      </div>
    );
  }

  // 2. Placement en cours
  if (tool.kind === 'place') {
    const label = describePlaceItem(tool.item);
    return (
      <div className="toolbar">
        <span className="pill pill--green" style={{ flex: 'none' }}>
          {label}
        </span>
        <span className="small muted" style={{ whiteSpace: 'nowrap' }}>
          Touchez le terrain pour placer
        </span>
        <button className="tool" onClick={() => setTool({ kind: 'select' })}>
          <span className="tool__emoji">✅</span>
          Terminé
        </button>
      </div>
    );
  }

  // 3. Trajectoire sélectionnée
  if (selectedAction) {
    const desc = actionDescriptor(selectedAction.type);
    return (
      <div className="toolbar">
        <span className="pill pill--blue" style={{ flex: 'none' }}>
          {desc.emoji} {ACTION_LABEL[selectedAction.type]}
        </span>
        {ACTIONS.map((a) => (
          <button
            key={a.type}
            className={`tool${selectedAction.type === a.type ? ' is-active' : ''}`}
            onClick={() => editor.patchAction(selectedAction.id, { type: a.type, style: a.style })}
          >
            <span className="tool__emoji">{a.emoji}</span>
            {a.label}
          </button>
        ))}
        {LINE_STYLE_OPTIONS.map((s) => (
          <button
            key={s.id}
            className={`tool${selectedAction.style === s.id ? ' is-active' : ''}`}
            onClick={() => editor.patchAction(selectedAction.id, { style: s.id })}
          >
            <span className="tool__emoji">
              {s.id === 'solid' ? '━' : s.id === 'dashed' ? '┅' : '┈'}
            </span>
            {s.label}
          </button>
        ))}
        <button
          className={`tool${selectedAction.curved ? ' is-active' : ''}`}
          onClick={() => editor.patchAction(selectedAction.id, { curved: !selectedAction.curved })}
        >
          <span className="tool__emoji">🌀</span>
          Courbe
        </button>
        <button
          className="tool"
          onClick={() => editor.patchAction(selectedAction.id, { color: undefined })}
        >
          <span className="tool__emoji">🎨</span>
          Couleur auto
        </button>
        <button className="tool" onClick={() => editor.deleteActionById(selectedAction.id)}>
          <span className="tool__emoji">🗑️</span>
          Supprimer
        </button>
      </div>
    );
  }

  // 4. Joueur / ballon sélectionné
  if (primary && (primary.kind === 'player' || primary.kind === 'ball')) {
    return (
      <div className="toolbar">
        <span className="pill pill--green" style={{ flex: 'none' }}>
          {primary.kind === 'ball'
            ? '⚽ Ballon'
            : `${primary.team === 'away' ? 'Adversaire' : primary.team === 'neutral' ? 'Neutre' : 'Joueur'} ${primary.number ?? ''}`}
        </span>
        {primary.kind === 'player' &&
          ACTIONS.map((a) => (
            <button
              key={a.type}
              className="tool"
              onClick={() => setTool({ kind: 'draw', actionType: a.type })}
              title={a.hint}
            >
              <span className="tool__emoji">{a.emoji}</span>
              {a.label}
            </button>
          ))}
        <button className="tool" onClick={() => editor.duplicateSelected()}>
          <span className="tool__emoji">⧉</span>
          Dupliquer
        </button>
        <button className="tool" onClick={onOpenMore}>
          <span className="tool__emoji">⚙️</span>
          Modifier
        </button>
        <button className="tool" onClick={editor.deleteSelected}>
          <span className="tool__emoji">🗑️</span>
          Supprimer
        </button>
      </div>
    );
  }

  // 5. Matériel / buts / zones sélectionnés
  if (primary) {
    return (
      <div className="toolbar">
        <span className="pill" style={{ flex: 'none' }}>
          {primary.kind === 'goal' ? '🥅 But' : primary.kind === 'zone' ? '🟩 Zone' : '📦 Matériel'}
        </span>
        <button className="tool" onClick={() => editor.rotateSelected(-15)}>
          <span className="tool__emoji">↺</span>
          -15°
        </button>
        <button className="tool" onClick={() => editor.rotateSelected(15)}>
          <span className="tool__emoji">↻</span>
          +15°
        </button>
        <button className="tool" onClick={() => editor.scaleSelected(-0.1)}>
          <span className="tool__emoji">➖</span>
          Taille -
        </button>
        <button className="tool" onClick={() => editor.scaleSelected(0.1)}>
          <span className="tool__emoji">➕</span>
          Taille +
        </button>
        <button className="tool" onClick={() => editor.duplicateSelected()}>
          <span className="tool__emoji">⧉</span>
          Dupliquer
        </button>
        <button
          className="tool"
          onClick={() => {
            editor.repeatSelected(3, 3);
          }}
        >
          <span className="tool__emoji">🔁</span>
          Répéter ×3
        </button>
        <button className="tool" onClick={editor.toggleLockSelected}>
          <span className="tool__emoji">{primary.locked ? '🔓' : '🔒'}</span>
          {primary.locked ? 'Déverr.' : 'Verrouiller'}
        </button>
        <button className="tool" onClick={editor.deleteSelected}>
          <span className="tool__emoji">🗑️</span>
          Supprimer
        </button>
      </div>
    );
  }

  // 6. Rien de sélectionné : outils essentiels seulement
  const entries: { emoji: string; label: string; onClick: () => void }[] = [
    { emoji: '🏃', label: 'Joueur', onClick: () => onOpenMore() },
    { emoji: '🛡️', label: 'Adversaire', onClick: () => onOpenMore() },
    { emoji: '⚽', label: 'Ballon', onClick: () => editor.setTool({ kind: 'place', item: { type: 'ball' } }) },
    { emoji: '📦', label: 'Matériel', onClick: () => onOpenMore() },
    {
      emoji: '➡️',
      label: 'Trajectoire',
      onClick: () => editor.setTool({ kind: 'draw', actionType: 'pass' }),
    },
  ];
  // Le mode avancé propose en plus les buts et les zones colorées.
  if (advanced) {
    entries.push({ emoji: '🥅', label: 'But', onClick: () => onOpenMore() });
    entries.push({
      emoji: '🟩',
      label: 'Zone',
      onClick: () => editor.setTool({ kind: 'place', item: { type: 'zone' } }),
    });
  }

  return (
    <div className="toolbar">
      {entries.map((e) => (
        <button key={e.label} className="tool" onClick={e.onClick}>
          <span className="tool__emoji">{e.emoji}</span>
          {e.label}
        </button>
      ))}
      <button
        className="tool"
        onClick={() => {
          const next = !editor.multi;
          editor.setMulti(next);
        }}
        style={editor.multi ? { borderColor: 'rgba(61,139,255,0.5)' } : undefined}
      >
        <span className="tool__emoji">👥</span>
        Sélection multiple
      </button>
      {editor.multi && (
        <>
          <button className="tool" onClick={() => editor.alignSelected('centerY')}>
            <span className="tool__emoji">↕️</span>
            Aligner
          </button>
          <button className="tool" onClick={() => editor.distributeSelected('x')}>
            <span className="tool__emoji">⇔</span>
            Espacer
          </button>
        </>
      )}
      <Chip
        active={prefs.snap}
        onClick={editor.togglePrecision}
        style={{ flex: 'none', alignSelf: 'center' }}
      >
        🎯 Précision
      </Chip>
    </div>
  );
}

function describePlaceItem(item: { type: string; itemType?: string; goalKind?: string }): string {
  if (item.type === 'player') return 'Placement joueur';
  if (item.type === 'ball') return 'Placement ballon';
  if (item.type === 'equipment') return 'Placement matériel';
  if (item.type === 'goal') return 'Placement but';
  if (item.type === 'zone') return 'Placement zone';
  return 'Placement';
}
