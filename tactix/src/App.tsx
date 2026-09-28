import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DocKind, Route, TabId, TactixDoc } from './domain/types';
import { WorkspaceProvider, useStore } from './store/workspace';
import { HomeView } from './views/HomeView';
import { LibraryView, type LibraryFilter } from './views/LibraryView';
import { SessionsView } from './views/SessionsView';
import { EditorView } from './views/EditorView';
import { PresentView } from './views/PresentView';
import { SessionEditorView } from './views/SessionEditorView';
import { AssistantSheet } from './components/editor/sheets';
import { Btn, Icons, MenuItem, Sheet, Toast, Toggle } from './components/ui';
import { decodeDocLink, shareDoc } from './export/share';
import { buildDocPrintHtml, printHtml } from './export/pdf';
import { downloadBlob, safeFilename, svgToPngBlob } from './export/image';
import { docToSvg } from './export/svg';

// ─────────────────────────────────────────────────────────────
// TACTIX — coquille applicative : navigation, création rapide,
// éditeur plein écran, présentation.
// ─────────────────────────────────────────────────────────────

export default function App() {
  return (
    <WorkspaceProvider>
      <Shell />
    </WorkspaceProvider>
  );
}

function Shell() {
  const { ws, setSettings, createDoc, createSession, importDoc } = useStore();
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [quickOpen, setQuickOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [exportDoc, setExportDoc] = useState<TactixDoc | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((cur) => (cur === message ? null : cur)), 2400);
  }, []);

  // Import d'un document partagé via l'URL (#doc=…)
  useEffect(() => {
    if (!window.location.hash.includes('doc=')) return;
    const doc = decodeDocLink(window.location.hash);
    if (doc) {
      importDoc(doc);
      notify('Document importé depuis le lien');
      window.location.hash = '';
    }
  }, [importDoc, notify]);

  const openDoc = useCallback((docId: string) => setRoute({ name: 'editor', docId }), []);
  const openSession = useCallback((sessionId: string) => setRoute({ name: 'session', sessionId }), []);

  const newDoc = useCallback(
    (kind: DocKind) => {
      const doc = createDoc(kind);
      setRoute({ name: 'editor', docId: doc.id });
    },
    [createDoc],
  );

  const newSession = useCallback(() => {
    const session = createSession();
    setRoute({ name: 'session', sessionId: session.id });
  }, [createSession]);

  const tab: TabId = useMemo(() => {
    switch (route.name) {
      case 'tactics':
        return 'tactics';
      case 'exercises':
        return 'exercises';
      case 'sessions':
        return 'sessions';
      case 'library':
        return 'library';
      default:
        return 'home';
    }
  }, [route]);

  const goTab = (id: TabId, filter?: LibraryFilter) => {
    if (id === 'home') setRoute({ name: 'home' });
    if (id === 'tactics') setRoute({ name: 'tactics' });
    if (id === 'exercises') setRoute({ name: 'exercises' });
    if (id === 'sessions') setRoute({ name: 'sessions' });
    if (id === 'library') setRoute({ name: 'library', filter: filter ?? 'all' });
    setSettings({ lastTab: id });
  };

  // ── Plein écran ────────────────────────────────────────────
  if (route.name === 'editor') {
    return (
      <>
        <EditorView
          docId={route.docId}
          onExit={() => setRoute({ name: 'home' })}
          onPresent={(docId) => setRoute({ name: 'present', docId })}
        />
        <Toast message={toast} />
      </>
    );
  }

  if (route.name === 'present') {
    return (
      <PresentView
        docId={route.docId}
        onExit={() => setRoute({ name: 'editor', docId: (route as { docId: string }).docId })}
      />
    );
  }

  if (route.name === 'session') {
    return (
      <>
        <SessionEditorView
          sessionId={route.sessionId}
          onExit={() => setRoute({ name: 'sessions' })}
          onOpenDoc={openDoc}
          onOpenSession={openSession}
        />
        <Toast message={toast} />
      </>
    );
  }

  const libraryFilter: LibraryFilter =
    route.name === 'library'
      ? (route.filter as LibraryFilter) ?? 'all'
      : route.name === 'tactics'
        ? 'tactic'
        : route.name === 'exercises'
          ? 'exercise'
          : 'all';

  return (
    <div className="app">
      <div className="app__main">
        {route.name === 'home' && (
          <HomeView
            onOpenDoc={openDoc}
            onNewDoc={newDoc}
            onOpenSession={openSession}
            onNavigateLibrary={(f) => setRoute({ name: 'library', filter: f })}
            onAssistant={() => setAssistantOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
            onSetAdvanced={(v) => setSettings({ mode: v ? 'advanced' : 'simple' })}
          />
        )}
        {(route.name === 'tactics' || route.name === 'exercises' || route.name === 'library') && (
          <LibraryView
            filter={libraryFilter}
            onFilterChange={(f) => setRoute({ name: 'library', filter: f })}
            onOpenDoc={openDoc}
            onOpenSession={openSession}
            onNewDoc={newDoc}
            onExport={(doc) => setExportDoc(doc)}
            onPresent={(doc) => setRoute({ name: 'present', docId: doc.id })}
          />
        )}
        {route.name === 'sessions' && <SessionsView onOpenSession={openSession} />}
      </div>

      <nav className="nav">
        <button
          className={`nav__item${tab === 'home' ? ' is-active' : ''}`}
          onClick={() => goTab('home')}
        >
          {Icons.home}
          Accueil
        </button>
        <button
          className={`nav__item${tab === 'tactics' ? ' is-active' : ''}`}
          onClick={() => goTab('tactics')}
        >
          {Icons.tactic}
          Tactique
        </button>
        <button className="nav__fab" onClick={() => setQuickOpen(true)} aria-label="Créer">
          ＋
        </button>
        <button
          className={`nav__item${tab === 'exercises' ? ' is-active' : ''}`}
          onClick={() => goTab('exercises')}
        >
          {Icons.exercise}
          Exercices
        </button>
        <button
          className={`nav__item${tab === 'library' ? ' is-active' : ''}`}
          onClick={() => goTab('library')}
        >
          {Icons.library}
          Bibliothèque
        </button>
        <button
          className={`nav__item${tab === 'sessions' ? ' is-active' : ''}`}
          onClick={() => goTab('sessions')}
        >
          {Icons.session}
          Séances
        </button>
      </nav>

      <Sheet open={quickOpen} title="Créer" onClose={() => setQuickOpen(false)}>
        <MenuItem
          emoji="🧠"
          label="Nouvelle tactique"
          hint="Terrain complet, animations, 11v11 disponible"
          onClick={() => {
            setQuickOpen(false);
            newDoc('tactic');
          }}
        />
        <MenuItem
          emoji="🎯"
          label="Nouvel exercice"
          hint="Étapes automatiques, matériel, consignes"
          onClick={() => {
            setQuickOpen(false);
            newDoc('exercise');
          }}
        />
        <MenuItem
          emoji="📋"
          label="Nouvelle séance"
          hint="Assembler plusieurs exercices, durée automatique"
          onClick={() => {
            setQuickOpen(false);
            newSession();
          }}
        />
        <div className="divider" />
        <MenuItem
          emoji="✨"
          label="Créer avec l’assistant"
          hint="Décrivez l’exercice en une phrase"
          onClick={() => {
            setQuickOpen(false);
            setAssistantOpen(true);
          }}
        />
        <div className="divider" />
        <div className="grid-2">
          <Btn onClick={() => { setQuickOpen(false); goTab('library', 'favorite'); }}>
            {Icons.star(true)} Favoris
          </Btn>
          <Btn variant="ghost" onClick={() => { setQuickOpen(false); setSettings({ mode: ws.settings.mode === 'advanced' ? 'simple' : 'advanced' }); notify(ws.settings.mode === 'advanced' ? 'Mode simple' : 'Options avancées activées'); }}>
            ⚙️ {ws.settings.mode === 'advanced' ? 'Mode simple' : 'Options avancées'}
          </Btn>
        </div>
      </Sheet>

      <AssistantSheet
        open={assistantOpen}
        mode="create"
        onClose={() => setAssistantOpen(false)}
        onCreate={(doc) => {
          importDoc(doc);
          setAssistantOpen(false);
          notify('Exercice généré');
          // le document importé est le premier de la liste
        }}
      />

      <Sheet open={settingsOpen} title="Réglages" onClose={() => setSettingsOpen(false)}>
        <Toggle
          label="Options avancées"
          hint="Précision, grille, vitesses, paramètres détaillés dans l’éditeur"
          value={ws.settings.mode === 'advanced'}
          onChange={(v) => setSettings({ mode: v ? 'advanced' : 'simple' })}
        />
        <div className="field" style={{ marginTop: 12 }}>
          <label>Vitesse d’animation : ×{ws.settings.speed.toFixed(1)}</label>
          <input
            type="range"
            min={0.5}
            max={2.5}
            step={0.1}
            value={ws.settings.speed}
            onChange={(e) => setSettings({ speed: Number(e.target.value) })}
          />
        </div>
        <div className="divider" />
        <p className="small muted">
          TACTIX v1.0 — {ws.docs.length} documents, {ws.sessions.length} séances. Tout est sauvegardé
          automatiquement sur cet appareil (localStorage) et prêt pour une synchronisation cloud.
        </p>
        <div className="spacer" />
        <Btn
          block
          variant="ghost"
          onClick={() => {
            const blob = new Blob([JSON.stringify(ws, null, 2)], { type: 'application/json' });
            downloadBlob(blob, safeFilename('tactix-sauvegarde', '.json'));
          }}
        >
          ⬇️ Exporter la sauvegarde (JSON)
        </Btn>
      </Sheet>

      {exportDoc && (
        <DocExportSheet
          doc={exportDoc}
          onClose={() => setExportDoc(null)}
          onPresent={() => {
            setRoute({ name: 'present', docId: exportDoc.id });
            setExportDoc(null);
          }}
        />
      )}

      <Toast message={toast} />
    </div>
  );
}

/** Export d'un document depuis la bibliothèque (sans éditeur ouvert). */
function DocExportSheet({
  doc,
  onClose,
  onPresent,
}: {
  doc: TactixDoc;
  onClose: () => void;
  onPresent: () => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  return (
    <Sheet open title={`Exporter — ${doc.name}`} onClose={onClose}>
      <MenuItem
        emoji="🖼️"
        label="Export image (PNG)"
        onClick={async () => {
          const svg = docToSvg(doc, { stepIndex: 0, title: doc.name });
          const blob = await svgToPngBlob(svg, 2200);
          downloadBlob(blob, safeFilename(doc.name, '.png'));
          setMessage('Image téléchargée');
        }}
      />
      <MenuItem
        emoji="📄"
        label="Export PDF"
        onClick={() => {
          const ok = printHtml(buildDocPrintHtml(doc), doc.name);
          setMessage(ok ? 'Fiche prête à imprimer' : 'Autorisez les fenêtres pop-up');
        }}
      />
      <MenuItem
        emoji="📤"
        label="Partager"
        onClick={async () => {
          const res = await shareDoc(doc, 0);
          setMessage(res.message);
        }}
      />
      <MenuItem emoji="📺" label="Mode présentation" onClick={onPresent} />
      {message && (
        <p className="small" style={{ color: 'var(--green)', marginTop: 8 }}>
          {message}
        </p>
      )}
    </Sheet>
  );
}
