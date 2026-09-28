import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { DocKind, Session, SessionBlockId, TactixDoc, Workspace } from '../domain/types';
import {
  createDemoExercise,
  createExercise,
  createTactic,
} from '../domain/doc';
import { uid } from '../domain/actions';

// ─────────────────────────────────────────────────────────────
// Persistance locale + état global (documents, séances, réglages).
// L'architecture est prête pour une synchronisation distante :
// toute la persistance passe par `storage.ts` (interface unique).
// ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'tactix.workspace.v1';
const MAX_HISTORY = 60;

export function emptyWorkspace(): Workspace {
  const now = new Date().toISOString();
  const demo = createDemoExercise();
  demo.createdAt = now;
  demo.updatedAt = now;
  demo.favorite = true;
  const tactic = createTactic('Notre 4-3-3 — sortie de balle');
  const session: Session = {
    id: uid('ses'),
    name: 'Séance type — Transition & finition',
    date: new Date().toISOString().slice(0, 10),
    group: 'Seniors A',
    coach: 'Entraîneur',
    notes: 'Séance axée sur la transition offensive et la finition rapide.',
    favorite: true,
    createdAt: now,
    updatedAt: now,
    items: [
      { id: uid('it'), exerciseId: demo.id, block: 'warmup', durationMin: 15, note: 'Mobilité + passes' },
      { id: uid('it'), exerciseId: demo.id, block: 'technique', durationMin: 20 },
      { id: uid('it'), exerciseId: demo.id, block: 'tactics', durationMin: 25 },
      { id: uid('it'), exerciseId: demo.id, block: 'game', durationMin: 20 },
    ],
  };
  return {
    version: 1,
    docs: [demo, tactic],
    sessions: [session],
    settings: {
      mode: 'simple',
      lastTab: 'home',
      quickStartSeen: false,
      showGrid: false,
      snapPrecise: true,
      speed: 1,
    },
  };
}

export function loadWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyWorkspace();
    const parsed = JSON.parse(raw) as Workspace;
    if (!parsed || !Array.isArray(parsed.docs)) return emptyWorkspace();
    return {
      version: parsed.version ?? 1,
      docs: parsed.docs,
      sessions: parsed.sessions ?? [],
      settings: { ...emptyWorkspace().settings, ...(parsed.settings ?? {}) },
    };
  } catch {
    return emptyWorkspace();
  }
}

export function saveWorkspace(ws: Workspace) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ws));
  } catch (err) {
    console.warn('TACTIX : sauvegarde impossible', err);
  }
}

interface StoreValue {
  ws: Workspace;
  canUndo: boolean;
  canRedo: boolean;
  setWs: (updater: (ws: Workspace) => Workspace, history?: boolean) => void;
  snapshot: () => void;
  undo: () => void;
  redo: () => void;
  // Documents
  createDoc: (kind: DocKind) => TactixDoc;
  importDoc: (doc: TactixDoc) => void;
  updateDoc: (docId: string, updater: (doc: TactixDoc) => TactixDoc, history?: boolean) => void;
  duplicateDoc: (docId: string) => TactixDoc | undefined;
  deleteDoc: (docId: string) => void;
  setFavorite: (docId: string, value: boolean) => void;
  renameDoc: (docId: string, name: string) => void;
  // Séances
  createSession: () => Session;
  updateSession: (id: string, updater: (s: Session) => Session, history?: boolean) => void;
  deleteSession: (id: string) => void;
  duplicateSession: (id: string) => Session | undefined;
  // Réglages
  setSettings: (patch: Partial<Workspace['settings']>) => void;
  resetAll: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [ws, setState] = useState<Workspace>(() => loadWorkspace());
  const past = useRef<Workspace[]>([]);
  const future = useRef<Workspace[]>([]);
  const [historyTick, setHistoryTick] = useState(0);
  const wsRef = useRef(ws);
  wsRef.current = ws;

  // Sauvegarde automatique (débouncée).
  useEffect(() => {
    const t = setTimeout(() => saveWorkspace(ws), 250);
    return () => clearTimeout(t);
  }, [ws]);

  const push = useCallback((prev: Workspace) => {
    past.current.push(prev);
    if (past.current.length > MAX_HISTORY) past.current.shift();
    future.current = [];
    setHistoryTick((n) => n + 1);
  }, []);

  const setWs = useCallback(
    (updater: (w: Workspace) => Workspace, history = true) => {
      setState((prev) => {
        const next = updater(prev);
        if (next === prev) return prev;
        if (history) push(prev);
        return next;
      });
    },
    [push],
  );

  const snapshot = useCallback(() => {
    push(wsRef.current);
  }, [push]);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(wsRef.current);
    setState(prev);
    setHistoryTick((n) => n + 1);
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(wsRef.current);
    setState(next);
    setHistoryTick((n) => n + 1);
  }, []);

  const updateDoc = useCallback(
    (docId: string, updater: (doc: TactixDoc) => TactixDoc, history = true) => {
      setWs((prev) => {
        const idx = prev.docs.findIndex((d) => d.id === docId);
        if (idx < 0) return prev;
        const next = updater(prev.docs[idx]);
        if (next === prev.docs[idx]) return prev;
        const docs = prev.docs.slice();
        docs[idx] = { ...next, updatedAt: new Date().toISOString() };
        return { ...prev, docs };
      }, history);
    },
    [setWs],
  );

  const createDoc = useCallback(
    (kind: DocKind) => {
      const doc = kind === 'tactic' ? createTactic() : createExercise();
      setWs((prev) => ({ ...prev, docs: [doc, ...prev.docs] }));
      return doc;
    },
    [setWs],
  );

  const importDoc = useCallback(
    (doc: TactixDoc) => {
      setWs((prev) => ({ ...prev, docs: [{ ...doc, id: uid('doc') }, ...prev.docs] }));
    },
    [setWs],
  );

  const duplicateDoc = useCallback(
    (docId: string) => {
      const src = wsRef.current.docs.find((d) => d.id === docId);
      if (!src) return undefined;
      const now = new Date().toISOString();
      const copy: TactixDoc = {
        ...structuredClone(src),
        id: uid(src.kind === 'tactic' ? 'tac' : 'exo'),
        name: `${src.name} (copie)`,
        createdAt: now,
        updatedAt: now,
        favorite: false,
      };
      setWs((prev) => ({ ...prev, docs: [copy, ...prev.docs] }));
      return copy;
    },
    [setWs],
  );

  const deleteDoc = useCallback(
    (docId: string) => {
      setWs((prev) => ({
        ...prev,
        docs: prev.docs.filter((d) => d.id !== docId),
        sessions: prev.sessions.map((s) => ({
          ...s,
          items: s.items.filter((i) => i.exerciseId !== docId),
        })),
      }));
    },
    [setWs],
  );

  const setFavorite = useCallback(
    (docId: string, value: boolean) => {
      updateDoc(docId, (d) => ({ ...d, favorite: value }));
    },
    [updateDoc],
  );

  const renameDoc = useCallback(
    (docId: string, name: string) => {
      updateDoc(docId, (d) => ({ ...d, name }));
    },
    [updateDoc],
  );

  const createSession = useCallback(() => {
    const now = new Date().toISOString();
    const session: Session = {
      id: uid('ses'),
      name: 'Nouvelle séance',
      date: new Date().toISOString().slice(0, 10),
      group: '',
      coach: '',
      notes: '',
      favorite: false,
      createdAt: now,
      updatedAt: now,
      items: [],
    };
    setWs((prev) => ({ ...prev, sessions: [session, ...prev.sessions] }));
    return session;
  }, [setWs]);

  const updateSession = useCallback(
    (id: string, updater: (s: Session) => Session, history = true) => {
      setWs((prev) => {
        const idx = prev.sessions.findIndex((s) => s.id === id);
        if (idx < 0) return prev;
        const next = updater(prev.sessions[idx]);
        if (next === prev.sessions[idx]) return prev;
        const sessions = prev.sessions.slice();
        sessions[idx] = { ...next, updatedAt: new Date().toISOString() };
        return { ...prev, sessions };
      }, history);
    },
    [setWs],
  );

  const deleteSession = useCallback(
    (id: string) => {
      setWs((prev) => ({ ...prev, sessions: prev.sessions.filter((s) => s.id !== id) }));
    },
    [setWs],
  );

  const duplicateSession = useCallback(
    (id: string) => {
      const src = wsRef.current.sessions.find((s) => s.id === id);
      if (!src) return undefined;
      const now = new Date().toISOString();
      const copy: Session = {
        ...structuredClone(src),
        id: uid('ses'),
        name: `${src.name} (copie)`,
        createdAt: now,
        updatedAt: now,
        favorite: false,
        items: src.items.map((i) => ({ ...i, id: uid('it') })),
      };
      setWs((prev) => ({ ...prev, sessions: [copy, ...prev.sessions] }));
      return copy;
    },
    [setWs],
  );

  const setSettings = useCallback(
    (patch: Partial<Workspace['settings']>) => {
      setWs((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }), false);
    },
    [setWs],
  );

  const resetAll = useCallback(() => {
    setWs(() => emptyWorkspace());
  }, [setWs]);

  const value = useMemo<StoreValue>(
    () => ({
      ws,
      canUndo: past.current.length > 0,
      canRedo: future.current.length > 0,
      setWs,
      snapshot,
      undo,
      redo,
      createDoc,
      importDoc,
      updateDoc,
      duplicateDoc,
      deleteDoc,
      setFavorite,
      renameDoc,
      createSession,
      updateSession,
      deleteSession,
      duplicateSession,
      setSettings,
      resetAll,
    }),
    [
      ws,
      historyTick,
      setWs,
      snapshot,
      undo,
      redo,
      createDoc,
      importDoc,
      updateDoc,
      duplicateDoc,
      deleteDoc,
      setFavorite,
      renameDoc,
      createSession,
      updateSession,
      deleteSession,
      duplicateSession,
      setSettings,
      resetAll,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore doit être utilisé dans <WorkspaceProvider>');
  return ctx;
}

export function useDoc(docId: string | null): TactixDoc | undefined {
  const { ws } = useStore();
  return useMemo(() => ws.docs.find((d) => d.id === docId), [ws.docs, docId]);
}

export function sessionDuration(session: Session): number {
  return session.items.reduce((sum, i) => sum + (i.durationMin || 0), 0);
}

export function groupSessionByBlock(session: Session): Record<SessionBlockId, number> {
  const out = { warmup: 0, technique: 0, tactics: 0, finishing: 0, game: 0 } as Record<
    SessionBlockId,
    number
  >;
  for (const item of session.items) out[item.block] += item.durationMin || 0;
  return out;
}
