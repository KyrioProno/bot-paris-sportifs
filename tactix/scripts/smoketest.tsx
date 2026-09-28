/**
 * TACTIX — test de rendu (smoke test) : monte réellement l'application
 * et les écrans principaux hors navigateur pour détecter les erreurs
 * de rendu. Exécution : npx tsx scripts/smoketest.tsx
 */
import React from 'react';
import { renderToString } from 'react-dom/server';
import App from '../src/App';
import { WorkspaceProvider } from '../src/store/workspace';
import { EditorView } from '../src/views/EditorView';
import { PresentView } from '../src/views/PresentView';
import { LibraryView } from '../src/views/LibraryView';
import { SessionsView } from '../src/views/SessionsView';
import { SessionEditorView } from '../src/views/SessionEditorView';
import { HomeView } from '../src/views/HomeView';
import { createSessionFixture } from './fixtures';
import { createDemoExercise } from '../src/domain/doc';

// ── Environnement minimal ────────────────────────────────────
const memory = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
  key: () => null,
  length: 0,
} as Storage;

let failed = 0;
function expect(label: string, condition: boolean) {
  if (condition) console.log(`   ✓ ${label}`);
  else {
    failed += 1;
    console.log(`   ✗ ${label}`);
  }
}

// Espace de travail pré-rempli avec l'exercice de démonstration
const demo = createDemoExercise();
const session = createSessionFixture(demo.id);
memory.set(
  'tactix.workspace.v1',
  JSON.stringify({
    version: 1,
    docs: [demo],
    sessions: [session],
    settings: {
      mode: 'simple',
      lastTab: 'home',
      quickStartSeen: false,
      showGrid: false,
      snapPrecise: true,
      speed: 1,
    },
  }),
);

console.log('\nTACTIX — test de rendu');

// 1. Application complète (accueil + navigation)
const appHtml = renderToString(<App />);
expect('l’application se monte', appHtml.includes('TACTIX'));
expect('l’accueil affiche « Bonjour »', appHtml.includes('Bonjour'));
expect('les actions rapides sont présentes', appHtml.includes('Nouvelle tactique') && appHtml.includes('Nouvel exercice'));
expect('la navigation est présente', appHtml.includes('Bibliothèque') && appHtml.includes('Séances'));

// 2. Éditeur (terrain vectoriel + outils)
const editorHtml = renderToString(
  <WorkspaceProvider>
    <EditorView docId={demo.id} onExit={() => undefined} onPresent={() => undefined} />
  </WorkspaceProvider>,
);
expect('l’éditeur reconnaît le document de démonstration', editorHtml.includes('Finition — 3e homme'));
expect('le terrain est rendu en SVG', editorHtml.includes('<svg') && editorHtml.includes('polyline'));
expect('les marquages sont dessinés', editorHtml.includes('linearGradient'));
expect('les joueurs numérotés sont dessinés', editorHtml.includes('>4<') && editorHtml.includes('>11<'));
expect('la timeline affiche les étapes', editorHtml.includes('step-dot'));
expect('la barre contextuelle propose les outils', editorHtml.includes('Joueur') && editorHtml.includes('Ballon'));
expect('les commandes d’animation sont présentes', editorHtml.includes('Lecture') || editorHtml.includes('rgb'));

// 3. Bibliothèque, accueil, séances, constructeur de séance
const noop = () => undefined;
const libraryHtml = renderToString(
  <WorkspaceProvider>
    <LibraryView
      filter="all"
      onFilterChange={noop}
      onOpenDoc={noop}
      onOpenSession={noop}
      onNewDoc={noop}
      onExport={noop}
      onPresent={noop}
    />
  </WorkspaceProvider>,
);
expect('la bibliothèque se monte', libraryHtml.includes('Bibliothèque') && libraryHtml.includes('Rechercher'));
expect('la bibliothèque liste la démonstration', libraryHtml.includes('Finition'));

const homeHtml = renderToString(
  <WorkspaceProvider>
    <HomeView
      onOpenDoc={noop}
      onNewDoc={noop}
      onOpenSession={noop}
      onNavigateLibrary={noop}
      onAssistant={noop}
      onOpenSettings={noop}
      onSetAdvanced={noop}
    />
  </WorkspaceProvider>,
);
expect('l’accueil propose les trois créations', homeHtml.includes('Nouvelle tactique') && homeHtml.includes('Nouvelle séance'));
expect('l’accueil affiche les derniers travaux', homeHtml.includes('Mes derniers travaux'));

const sessionsHtml = renderToString(
  <WorkspaceProvider>
    <SessionsView onOpenSession={noop} />
  </WorkspaceProvider>,
);
expect('la liste des séances se monte', sessionsHtml.includes('Séances'));

const sessionFixture = createSessionFixture(demo.id);
const sessionHtml = renderToString(
  <WorkspaceProvider>
    <SessionEditorView sessionId={sessionFixture.id} onExit={noop} onOpenDoc={noop} onOpenSession={noop} />
  </WorkspaceProvider>,
);
expect('le constructeur de séance se monte', sessionHtml.includes('Échauffement') || sessionHtml.includes('Durée totale'));

// 4. Mode présentation
const presentHtml = renderToString(
  <WorkspaceProvider>
    <PresentView docId={demo.id} onExit={() => undefined} />
  </WorkspaceProvider>,
);
expect('le mode présentation se monte', presentHtml.includes('present__bar') || presentHtml.includes('present'));

console.log(failed === 0 ? '\n   Rendu validé.\n' : `\n   ${failed} problème(s) de rendu.\n`);
process.exit(failed === 0 ? 0 : 1);
