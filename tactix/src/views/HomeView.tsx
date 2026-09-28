import { useMemo } from 'react';
import type { DocKind } from '../domain/types';
import { useStore } from '../store/workspace';
import { DocCard, SessionCard } from '../components/DocCard';
import { Btn, SectionTitle, Toggle } from '../components/ui';
import { formatMinutes } from '../domain/session';

// ─────────────────────────────────────────────────────────────
// Accueil : accès immédiat à l'essentiel.
// ─────────────────────────────────────────────────────────────

export function HomeView({
  onOpenDoc,
  onNewDoc,
  onOpenSession,
  onNavigateLibrary,
  onAssistant,
  onOpenSettings,
  onSetAdvanced,
}: {
  onOpenDoc: (id: string) => void;
  onNewDoc: (kind: DocKind) => void;
  onOpenSession: (id: string) => void;
  onNavigateLibrary: (filter: 'all' | 'tactic' | 'exercise' | 'session' | 'favorite') => void;
  onAssistant: () => void;
  onOpenSettings: () => void;
  onSetAdvanced: (value: boolean) => void;
}) {
  const { ws, setFavorite, updateSession } = useStore();

  const recent = useMemo(() => {
    const docs = ws.docs.map((d) => ({ type: 'doc' as const, at: d.updatedAt, doc: d }));
    const sessions = ws.sessions.map((s) => ({ type: 'session' as const, at: s.updatedAt, session: s }));
    return [...docs, ...sessions]
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, 5);
  }, [ws.docs, ws.sessions]);

  const counts = useMemo(
    () => ({
      tactics: ws.docs.filter((d) => d.kind === 'tactic').length,
      exercises: ws.docs.filter((d) => d.kind === 'exercise').length,
      sessions: ws.sessions.length,
      favorites: ws.docs.filter((d) => d.favorite).length + ws.sessions.filter((s) => s.favorite).length,
    }),
    [ws],
  );

  const totalPlanned = ws.sessions.reduce((sum, s) => sum + s.items.reduce((n, i) => n + i.durationMin, 0), 0);

  return (
    <div className="screen">
      <div className="row row--between" style={{ marginBottom: 14 }}>
        <div className="logo">
          <span className="logo__mark">TACTIX</span>
        </div>
        <button className="btn btn--icon btn--ghost" onClick={onOpenSettings} aria-label="Réglages">
          ⚙️
        </button>
      </div>

      <h1 className="h1">Bonjour 👋</h1>
      <p className="muted" style={{ marginTop: 4 }}>
        Dessine. Anime. Entraîne. — votre terrain vous attend.
      </p>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <button className="quick-action" onClick={() => onNewDoc('tactic')}>
          <span className="quick-action__emoji">🧠</span>
          <span className="quick-action__label">Nouvelle tactique</span>
          <span className="small muted">Animations, coups de pied arrêtés</span>
        </button>
        <button className="quick-action" onClick={() => onNewDoc('exercise')}>
          <span className="quick-action__emoji">🎯</span>
          <span className="quick-action__label">Nouvel exercice</span>
          <span className="small muted">Étapes, matériel, consignes</span>
        </button>
        <button className="quick-action" onClick={() => onNavigateLibrary('session')}>
          <span className="quick-action__emoji">📋</span>
          <span className="quick-action__label">Nouvelle séance</span>
          <span className="small muted">Assembler plusieurs exercices</span>
        </button>
        <button
          className="quick-action"
          style={{ background: 'linear-gradient(160deg, rgba(61,139,255,0.16) 0%, rgba(16,28,22,0.9) 55%)' }}
          onClick={onAssistant}
        >
          <span className="quick-action__emoji">✨</span>
          <span className="quick-action__label">Assistant</span>
          <span className="small muted">Créer depuis une phrase</span>
        </button>
      </div>

      <div className="row" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <span className="pill pill--green">{counts.tactics} tactiques</span>
        <span className="pill pill--blue">{counts.exercises} exercices</span>
        <span className="pill">{counts.sessions} séances</span>
        {totalPlanned > 0 && <span className="pill pill--orange">{formatMinutes(totalPlanned)} planifiées</span>}
      </div>

      <SectionTitle
        title="Mes derniers travaux"
        action="Tout voir"
        onAction={() => onNavigateLibrary('all')}
      />
      <div className="list">
        {recent.length === 0 && <div className="empty">Aucun travail pour le moment.</div>}
        {recent.map((entry) =>
          entry.type === 'doc' ? (
            <DocCard
              key={entry.doc.id}
              doc={entry.doc}
              onOpen={() => onOpenDoc(entry.doc.id)}
              onStar={() => setFavorite(entry.doc.id, !entry.doc.favorite)}
            />
          ) : (
            <SessionCard
              key={entry.session.id}
              session={entry.session}
              count={entry.session.items.length}
              onOpen={() => onOpenSession(entry.session.id)}
              onStar={() => updateSession(entry.session.id, (s) => ({ ...s, favorite: !s.favorite }))}
            />
          ),
        )}
      </div>

      <SectionTitle title="Accès rapide" />
      <div className="list">
        <div className="item" onClick={() => onNavigateLibrary('favorite')}>
          <div className="item__icon">⭐</div>
          <div className="item__body">
            <div className="item__title">Mes favoris</div>
            <div className="item__meta">{counts.favorites} éléments enregistrés</div>
          </div>
          <span className="muted">›</span>
        </div>
        <div className="item" onClick={() => onNavigateLibrary('all')}>
          <div className="item__icon">📚</div>
          <div className="item__body">
            <div className="item__title">Bibliothèque</div>
            <div className="item__meta">Tactiques, exercices, séances</div>
          </div>
          <span className="muted">›</span>
        </div>
        <div className="item" onClick={() => onNavigateLibrary('exercise')}>
          <div className="item__icon">🏃</div>
          <div className="item__body">
            <div className="item__title">Exercices récents</div>
            <div className="item__meta">Reprendre là où vous vous êtes arrêté</div>
          </div>
          <span className="muted">›</span>
        </div>
      </div>

      <SectionTitle title="Mode d'utilisation" />
      <div className="card">
        <Toggle
          label="Options avancées"
          hint="Précision, grille, couleurs avancées, paramètres détaillés"
          value={ws.settings.mode === 'advanced'}
          onChange={onSetAdvanced}
        />
        <p className="muted small" style={{ marginTop: 10 }}>
          Le mode simple garde l’écran d’édition épuré. Toutes les fonctionnalités restent disponibles
          (formats 1v1 → 11v11, terrains complets, matériel complet).
        </p>
      </div>

      <div className="spacer" style={{ height: 24 }} />
      <Btn block variant="ghost" onClick={onAssistant}>
        ✨ Créer un exercice à partir d’une phrase
      </Btn>
    </div>
  );
}
