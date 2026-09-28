import { useMemo, useState } from 'react';
import type { Session } from '../domain/types';
import { sessionDuration, useStore } from '../store/workspace';
import { Btn, Empty, MenuItem, SectionTitle, Sheet } from '../components/ui';
import { SessionCard } from '../components/DocCard';
import { BLOCKS, blockById, formatMinutes } from '../domain/session';
import { buildSessionPrintHtml, printHtml } from '../export/pdf';

// ─────────────────────────────────────────────────────────────
// Séances : liste + création rapide.
// ─────────────────────────────────────────────────────────────

export function SessionsView({ onOpenSession }: { onOpenSession: (id: string) => void }) {
  const { ws, createSession, updateSession, deleteSession, duplicateSession } = useStore();
  const [menu, setMenu] = useState<Session | null>(null);

  const sessions = useMemo(
    () => [...ws.sessions].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    [ws.sessions],
  );

  const total = sessions.reduce((n, s) => n + sessionDuration(s), 0);

  return (
    <div className="screen">
      <h1 className="h1">Séances</h1>
      <p className="muted">
        {sessions.length} séance{sessions.length > 1 ? 's' : ''} · {formatMinutes(total)} planifiées
      </p>

      <div className="row" style={{ gap: 8, marginTop: 14 }}>
        <Btn
          variant="primary"
          onClick={() => {
            const s = createSession();
            onOpenSession(s.id);
          }}
        >
          ＋ Nouvelle séance
        </Btn>
      </div>

      <SectionTitle title="Mes séances" />
      <div className="list">
        {sessions.length === 0 && (
          <Empty text="Aucune séance" hint="Assemblez plusieurs exercices en une séance complète." />
        )}
        {sessions.map((s) => (
          <SessionCard
            key={s.id}
            session={s}
            count={s.items.length}
            onOpen={() => onOpenSession(s.id)}
            onStar={() => updateSession(s.id, (x) => ({ ...x, favorite: !x.favorite }))}
          />
        ))}
      </div>

      {sessions.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <Btn
            block
            variant="ghost"
            onClick={() => {
              const html = buildSessionPrintHtml(sessions[0], ws.docs);
              if (!printHtml(html, sessions[0].name)) {
                window.alert('Autorisez les fenêtres pop-up pour exporter le PDF.');
              }
            }}
          >
            🖨️ Imprimer / PDF la première séance
          </Btn>
        </div>
      )}

      <Sheet open={!!menu} title={menu?.name ?? ''} onClose={() => setMenu(null)}>
        {menu && (
          <>
            <MenuItem emoji="📝" label="Ouvrir" onClick={() => { onOpenSession(menu.id); setMenu(null); }} />
            <MenuItem
              emoji="⧉"
              label="Dupliquer"
              onClick={() => {
                const copy = duplicateSession(menu.id);
                setMenu(null);
                if (copy) onOpenSession(copy.id);
              }}
            />
            <MenuItem
              emoji="🖨️"
              label="Exporter en PDF"
              onClick={() => {
                const html = buildSessionPrintHtml(menu, ws.docs);
                if (!printHtml(html, menu.name)) window.alert('Autorisez les fenêtres pop-up.');
                setMenu(null);
              }}
            />
            <MenuItem
              emoji="🗑️"
              label="Supprimer"
              danger
              onClick={() => {
                deleteSession(menu.id);
                setMenu(null);
              }}
            />
          </>
        )}
      </Sheet>

      <div className="spacer" />
      <p className="small muted">
        Blocs disponibles : {BLOCKS.map((b) => blockById(b.id).label).join(' · ')}
      </p>
      <p className="small muted" style={{ marginTop: 8 }}>
        Astuce : ouvrez une séance pour glisser-déposer les exercices et obtenir le calcul automatique de la
        durée totale.
      </p>
    </div>
  );
}
