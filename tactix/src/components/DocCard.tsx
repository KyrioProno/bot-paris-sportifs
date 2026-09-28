import React from 'react';
import type { Session, TactixDoc } from '../domain/types';
import { PitchThumb } from './PitchThumb';
import { formatLabel } from '../domain/formats';
import { PITCH_TEMPLATES } from '../domain/pitch/dimensions';
import { sessionDuration } from '../store/workspace';
import { formatMinutes } from '../domain/session';
import { Icons } from './ui';

// Carte de document / séance, réutilisée dans l'accueil et la bibliothèque.

export function DocCard({
  doc,
  onOpen,
  onStar,
  right,
}: {
  doc: TactixDoc;
  onOpen: () => void;
  onStar?: () => void;
  right?: React.ReactNode;
}) {
  const template = PITCH_TEMPLATES.find((t) => t.id === doc.pitch.template)?.label ?? '';
  return (
    <div className="item" onClick={onOpen} role="button" tabIndex={0}>
      <div
        style={{
          width: 84,
          height: 60,
          borderRadius: 12,
          overflow: 'hidden',
          flex: 'none',
          border: '1px solid var(--line)',
          background: '#06100b',
        }}
      >
        <PitchThumb doc={doc} />
      </div>
      <div className="item__body">
        <div className="item__title">{doc.name}</div>
        <div className="item__meta">
          {doc.kind === 'tactic' ? 'Tactique' : 'Exercice'} · {template} · {formatLabel(doc.format)}
        </div>
        <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          <span className="pill">{doc.steps.length} étapes</span>
          <span className="pill">{doc.info.durationMin} min</span>
          {doc.info.category && <span className="pill pill--green">{doc.info.category}</span>}
        </div>
      </div>
      {onStar ? (
        <button
          className="btn btn--icon btn--ghost"
          style={{ color: doc.favorite ? 'var(--green)' : 'var(--grey)' }}
          onClick={(e) => {
            e.stopPropagation();
            onStar();
          }}
          aria-label="Favori"
        >
          {Icons.star(doc.favorite)}
        </button>
      ) : (
        right
      )}
    </div>
  );
}

export function SessionCard({
  session,
  count,
  onOpen,
  onStar,
}: {
  session: Session;
  count: number;
  onOpen: () => void;
  onStar?: () => void;
}) {
  return (
    <div className="item" onClick={onOpen} role="button" tabIndex={0}>
      <div className="item__icon">📋</div>
      <div className="item__body">
        <div className="item__title">{session.name}</div>
        <div className="item__meta">
          {session.date}
          {session.group ? ` · ${session.group}` : ''}
        </div>
        <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          <span className="pill">{count} exercices</span>
          <span className="pill pill--blue">{formatMinutes(sessionDuration(session))}</span>
        </div>
      </div>
      {onStar && (
        <button
          className="btn btn--icon btn--ghost"
          style={{ color: session.favorite ? 'var(--green)' : 'var(--grey)' }}
          onClick={(e) => {
            e.stopPropagation();
            onStar();
          }}
          aria-label="Favori"
        >
          {Icons.star(session.favorite)}
        </button>
      )}
    </div>
  );
}
