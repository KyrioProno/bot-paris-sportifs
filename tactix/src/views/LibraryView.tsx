import { useMemo, useState } from 'react';
import type { DocKind, TactixDoc } from '../domain/types';
import { useStore } from '../store/workspace';
import { DocCard, SessionCard } from '../components/DocCard';
import { Btn, Chip, Empty, MenuItem, SectionTitle, Sheet, Icons } from '../components/ui';
import { CATEGORIES } from '../domain/categories';
import { formatMinutes } from '../domain/session';

// ─────────────────────────────────────────────────────────────
// Bibliothèque : rechercher, filtrer, modifier, dupliquer,
// renommer, supprimer, mettre en favori, exporter.
// ─────────────────────────────────────────────────────────────

export type LibraryFilter = 'all' | 'tactic' | 'exercise' | 'session' | 'favorite';

export function LibraryView({
  filter,
  onFilterChange,
  onOpenDoc,
  onOpenSession,
  onNewDoc,
  onExport,
  onPresent,
}: {
  filter: LibraryFilter;
  onFilterChange: (f: LibraryFilter) => void;
  onOpenDoc: (id: string) => void;
  onOpenSession: (id: string) => void;
  onNewDoc: (kind: DocKind) => void;
  onExport: (doc: TactixDoc) => void;
  onPresent: (doc: TactixDoc) => void;
}) {
  const { ws, setFavorite, renameDoc, deleteDoc, duplicateDoc, updateSession } = useStore();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [menuDoc, setMenuDoc] = useState<TactixDoc | null>(null);
  const [renaming, setRenaming] = useState<TactixDoc | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<TactixDoc | null>(null);

  const filteredDocs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ws.docs
      .filter((d) => {
        if (filter === 'tactic' && d.kind !== 'tactic') return false;
        if (filter === 'exercise' && d.kind !== 'exercise') return false;
        if (filter === 'favorite' && !d.favorite) return false;
        if (category && d.info.category !== category) return false;
        if (!q) return true;
        return (
          d.name.toLowerCase().includes(q) ||
          d.info.objective.toLowerCase().includes(q) ||
          (d.info.category ?? '').toLowerCase().includes(q) ||
          (d.info.subcategory ?? '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }, [ws.docs, filter, query, category]);

  const filteredSessions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (filter === 'tactic' || filter === 'exercise') return [];
    return ws.sessions
      .filter((s) => {
        if (filter === 'favorite' && !s.favorite) return false;
        if (!q) return true;
        return s.name.toLowerCase().includes(q) || s.group.toLowerCase().includes(q);
      })
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }, [ws.sessions, filter, query]);

  return (
    <div className="screen">
      <h1 className="h1">Bibliothèque</h1>
      <p className="muted">{ws.docs.length} documents · {ws.sessions.length} séances</p>

      <div style={{ marginTop: 14 }}>
        <input
          className="input"
          placeholder="Rechercher une tactique, un exercice, un objectif…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="scroll-x" style={{ marginTop: 12 }}>
        <Chip active={filter === 'all'} onClick={() => onFilterChange('all')}>
          Tout
        </Chip>
        <Chip active={filter === 'tactic'} onClick={() => onFilterChange('tactic')}>
          Mes tactiques
        </Chip>
        <Chip active={filter === 'exercise'} onClick={() => onFilterChange('exercise')}>
          Mes exercices
        </Chip>
        <Chip active={filter === 'session'} onClick={() => onFilterChange('session')}>
          Mes séances
        </Chip>
        <Chip active={filter === 'favorite'} onClick={() => onFilterChange('favorite')}>
          ⭐ Favoris
        </Chip>
      </div>

      <div className="scroll-x" style={{ marginTop: 8 }}>
        <Chip active={category === null} onClick={() => setCategory(null)}>
          Toutes catégories
        </Chip>
        {CATEGORIES.map((c) => (
          <Chip key={c.id} active={category === c.id} onClick={() => setCategory(category === c.id ? null : c.id)}>
            {c.emoji} {c.label}
          </Chip>
        ))}
      </div>

      <div className="row" style={{ gap: 8, marginTop: 14 }}>
        <Btn size="sm" onClick={() => onNewDoc('tactic')}>
          🧠 Nouvelle tactique
        </Btn>
        <Btn size="sm" onClick={() => onNewDoc('exercise')}>
          🎯 Nouvel exercice
        </Btn>
      </div>

      {(filter === 'all' || filter === 'session' || filter === 'favorite') && filteredSessions.length > 0 && (
        <>
          <SectionTitle title="Séances" />
          <div className="list">
            {filteredSessions.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                count={s.items.length}
                onOpen={() => onOpenSession(s.id)}
                onStar={() => updateSession(s.id, (x) => ({ ...x, favorite: !x.favorite }))}
              />
            ))}
          </div>
        </>
      )}

      <SectionTitle title={filter === 'tactic' ? 'Tactiques' : filter === 'exercise' ? 'Exercices' : 'Documents'} />
      <div className="list">
        {filteredDocs.length === 0 && (
          <Empty
            text="Aucun document trouvé"
            hint="Créez une tactique ou un exercice, ou modifiez votre recherche."
          />
        )}
        {filteredDocs.map((d) => (
          <DocCard
            key={d.id}
            doc={d}
            onOpen={() => onOpenDoc(d.id)}
            onStar={() => setFavorite(d.id, !d.favorite)}
            right={
              <button
                className="btn btn--icon btn--ghost"
                aria-label="Options"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuDoc(d);
                }}
              >
                ⋯
              </button>
            }
          />
        ))}
      </div>

      <div className="spacer" style={{ height: 20 }} />

      <Sheet open={!!menuDoc} title={menuDoc?.name ?? ''} onClose={() => setMenuDoc(null)}>
        {menuDoc && (
          <>
            <MenuItem emoji="✏️" label="Ouvrir" onClick={() => { onOpenDoc(menuDoc.id); setMenuDoc(null); }} />
            <MenuItem emoji="📺" label="Mode présentation" onClick={() => { onPresent(menuDoc); setMenuDoc(null); }} />
            <MenuItem
              emoji="⭐"
              label={menuDoc.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              onClick={() => { setFavorite(menuDoc.id, !menuDoc.favorite); setMenuDoc(null); }}
            />
            <MenuItem emoji="📄" label="Renommer" onClick={() => { setRenameValue(menuDoc.name); setRenaming(menuDoc); setMenuDoc(null); }} />
            <MenuItem
              emoji="⧉"
              label="Dupliquer"
              onClick={() => {
                const copy = duplicateDoc(menuDoc.id);
                setMenuDoc(null);
                if (copy) onOpenDoc(copy.id);
              }}
            />
            <MenuItem emoji="⬇️" label="Exporter (image, PDF, partage)" onClick={() => { onExport(menuDoc); setMenuDoc(null); }} />
            <MenuItem emoji="🗑️" label="Supprimer" danger onClick={() => { setConfirmDelete(menuDoc); setMenuDoc(null); }} />
          </>
        )}
      </Sheet>

      <Sheet open={!!renaming} title="Renommer" onClose={() => setRenaming(null)}>
        <input className="input" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus />
        <div className="spacer" />
        <Btn
          block
          variant="primary"
          onClick={() => {
            if (renaming) renameDoc(renaming.id, renameValue.trim() || renaming.name);
            setRenaming(null);
          }}
        >
          Enregistrer
        </Btn>
      </Sheet>

      <Sheet open={!!confirmDelete} title="Supprimer ?" onClose={() => setConfirmDelete(null)}>
        <p className="muted">
          « {confirmDelete?.name} » sera retiré de la bibliothèque ainsi que des séances qui le contiennent.
        </p>
        <div className="spacer" />
        <Btn block variant="danger" onClick={() => { if (confirmDelete) deleteDoc(confirmDelete.id); setConfirmDelete(null); }}>
          Supprimer définitivement
        </Btn>
        <div className="spacer" />
        <p className="small muted" style={{ marginTop: 10 }}>
          Astuce : le bouton ↶ Annuler de l’éditeur permet de revenir en arrière.
        </p>
      </Sheet>

      <div style={{ marginTop: 10 }}>
        <Btn block variant="ghost" onClick={() => onFilterChange('favorite')}>
          {Icons.star(true)} Voir mes favoris ({ws.docs.filter((d) => d.favorite).length})
        </Btn>
      </div>
      <p className="small muted" style={{ marginTop: 12, textAlign: 'center' }}>
        Durée totale planifiée : {formatMinutes(ws.sessions.reduce((n, s) => n + s.items.reduce((m, i) => m + i.durationMin, 0), 0))}
      </p>
    </div>
  );
}
