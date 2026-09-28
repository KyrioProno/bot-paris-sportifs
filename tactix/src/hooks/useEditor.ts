import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Action,
  ActionType,
  GoalConfigId,
  GoalKind,
  LineStyle,
  Orientation,
  PitchTemplateId,
  Point,
  SceneObject,
  TactixDoc,
  Team,
} from '../domain/types';
import {
  ACTION_LABEL,
  actionDescriptor,
  createAction,
  findReceiver,
  uid,
} from '../domain/actions';
import {
  applyActions,
  ballAt,
  ballOwnerAt,
  countLinkedActions,
  deleteObject,
  duplicateStep as duplicateStepDoc,
  insertStepAfter,
  moveStep as moveStepDoc,
  removeActions,
  removeStep as removeStepDoc,
  setObjectPosition,
  stepPosition,
  updateAction,
} from '../domain/steps';
import {
  applyFormat as applyFormatDoc,
  applyPitch,
} from '../domain/doc';
import { buildGoals } from '../domain/goals';
import { applyFormation, makeBall, makePlayer, nextFreeNumber } from '../domain/team';
import {
  DEFAULT_VIEWPORT,
  zoomViewport,
  type GestureEvent,
  type Viewport,
} from '../components/pitch/PitchCanvas';
import {
  alignTargets,
  distributeTargets,
  snapPosition,
  type AlignMode,
  type Guide,
} from '../engine/interaction';
import { screenBox } from '../domain/pitch/orientation';
import { clamp, simplifyPath } from '../domain/geometry';
import { useStore } from '../store/workspace';
import { computeFrame, stepDuration } from '../domain/animation';

// ─────────────────────────────────────────────────────────────
// Machine à états de l'éditeur : outils contextuels, sélection,
// placement précis, dessin de trajectoires, étapes, animation,
// annuler / rétablir.
// ─────────────────────────────────────────────────────────────

export type PlaceItem =
  | { type: 'player'; team: Team; keeper?: boolean }
  | { type: 'ball' }
  | { type: 'equipment'; itemType: string }
  | { type: 'goal'; goalKind: GoalKind }
  | { type: 'zone' };

export type EditorTool =
  | { kind: 'select' }
  | { kind: 'draw'; actionType: ActionType }
  | { kind: 'place'; item: PlaceItem };

export interface ContextMenuState {
  open: boolean;
  objectId?: string;
  actionId?: string;
}

export interface EditorPrefs {
  snap: boolean;
  grid: boolean;
  gridStep: number;
  autoAdvance: boolean;
  showDistances: boolean;
}

const DEFAULT_PREFS: EditorPrefs = {
  snap: true,
  grid: false,
  gridStep: 5,
  autoAdvance: true,
  showDistances: false,
};

export function useEditor(docId: string) {
  const { ws, updateDoc, setSettings, snapshot, undo, redo, canUndo, canRedo } = useStore();
  const doc = ws.docs.find((d) => d.id === docId);

  const [stepIndex, setStepIndex] = useState(0);
  const [selection, setSelection] = useState<string[]>([]);
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [tool, setTool] = useState<EditorTool>({ kind: 'select' });
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [menu, setMenu] = useState<ContextMenuState>({ open: false });
  const [toast, setToast] = useState<string | null>(null);
  const [multi, setMulti] = useState(false);
  const [prefs, setPrefs] = useState<EditorPrefs>({
    ...DEFAULT_PREFS,
    snap: ws.settings.snapPrecise,
  });
  const [askDelete, setAskDelete] = useState<{ ids: string[]; linked: number } | null>(null);
  const [suggestion, setSuggestion] = useState<{ text: string; run: () => void } | null>(null);

  const dragRef = useRef<{
    ids: string[];
    grabbed: string;
    base: Record<string, Point>;
    offset: Point;
    moved: boolean;
  } | null>(null);
  const drawRef = useRef<{ points: Point[] } | null>(null);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 2200);
  }, []);

  const patch = useCallback(
    (fn: (d: TactixDoc) => TactixDoc, history = true) => {
      updateDoc(docId, fn, history);
    },
    [docId, updateDoc],
  );

  // ── Animation ──────────────────────────────────────────────

  const safeStep = doc ? clamp(stepIndex, 0, doc.steps.length - 1) : 0;
  const currentStep = doc?.steps[safeStep];
  const duration = currentStep ? stepDuration(currentStep, ws.settings.speed) : 1200;
  const lastStepIndex = doc ? doc.steps.length - 1 : 0;

  const stepRef = useRef(safeStep);
  stepRef.current = safeStep;

  useEffect(() => {
    if (!playing || !doc) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setT((prev) => {
        const next = prev + dt / duration;
        if (next < 1) return next;
        // Enchaînement automatique des étapes ; arrêt en fin d'exercice.
        if (stepRef.current < lastStepIndex) {
          setStepIndex((s) => Math.min(s + 1, lastStepIndex));
          return 0;
        }
        setPlaying(false);
        return 1;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, duration, doc, lastStepIndex]);

  useEffect(() => {
    setT(0);
  }, [safeStep]);

  const frame = useMemo(
    () => (doc ? computeFrame(doc, safeStep, playing ? t : 0, ws.settings.speed) : null),
    [doc, safeStep, playing, t, ws.settings.speed],
  );

  const resolve = useMemo(() => {
    const positions = frame?.positions ?? {};
    return (id: string) => positions[id] ?? (doc ? stepPosition(doc, safeStep, id) : { x: 0, y: 0 });
  }, [frame, doc, safeStep]);

  const play = useCallback(() => {
    if (safeStep >= lastStepIndex && t >= 0.99) {
      setStepIndex(0);
      setT(0);
    }
    setPlaying(true);
  }, [lastStepIndex, safeStep, t]);

  const pause = useCallback(() => setPlaying(false), []);

  const resetAnimation = useCallback(() => {
    setPlaying(false);
    setStepIndex(0);
    setT(0);
  }, []);

  // ── Sélection ──────────────────────────────────────────────

  const select = useCallback(
    (id: string | null, additive = false) => {
      setSelectedActionId(null);
      if (!id) {
        setSelection([]);
        return;
      }
      setSelection((prev) => {
        if (additive || multi) {
          return prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id];
        }
        return [id];
      });
    },
    [multi],
  );

  const selectedObjects = useMemo(
    () => (doc ? doc.objects.filter((o) => selection.includes(o.id)) : []),
    [doc, selection],
  );
  const primary = selectedObjects[0];

  // ── Déplacement ────────────────────────────────────────────

  const beginDrag = useCallback(
    (world: Point, objectId: string) => {
      if (!doc) return;
      const ids = selection.includes(objectId) ? selection : [objectId];
      if (!selection.includes(objectId)) setSelection(ids);
      const base: Record<string, Point> = {};
      for (const id of ids) base[id] = resolve(id);
      const grabbed = resolve(objectId);
      dragRef.current = {
        ids,
        grabbed: objectId,
        base,
        offset: { x: world.x - grabbed.x, y: world.y - grabbed.y },
        moved: false,
      };
      snapshot();
    },
    [doc, resolve, selection, snapshot],
  );

  const moveDrag = useCallback(
    (world: Point, metersPerPixel: number) => {
      const drag = dragRef.current;
      if (!doc || !drag) return;
      const target = { x: world.x - drag.offset.x, y: world.y - drag.offset.y };
      const grabbedObj = doc.objects.find((o) => o.id === drag.grabbed);
      if (grabbedObj?.locked) {
        notify('Objet verrouillé');
        return;
      }
      drag.moved = true;
      const threshold = clamp(metersPerPixel * 16, 0.5, 4);
      const result = snapPosition(doc, target, {
        enabled: prefs.snap,
        gridEnabled: prefs.grid,
        gridStep: prefs.gridStep,
        threshold,
        excludeIds: drag.ids,
        resolve,
      });
      setGuides(result.guides);
      const baseGrabbed = drag.base[drag.grabbed];
      const delta = {
        x: result.point.x - baseGrabbed.x,
        y: result.point.y - baseGrabbed.y,
      };
      patch((d) => {
        let next = d;
        for (const id of drag.ids) {
          const base = drag.base[id];
          if (!base) continue;
          next = setObjectPosition(next, id, { x: base.x + delta.x, y: base.y + delta.y }, safeStep);
        }
        return followActions(next, drag.ids, safeStep);
      }, false);
    },
    [doc, notify, patch, prefs.grid, prefs.gridStep, prefs.snap, resolve, safeStep],
  );

  const endDrag = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    setGuides([]);
    if (!drag || !drag.moved || !doc) return;
    // Suggestion intelligente, discrète, jamais bloquante.
    const homes = doc.objects.filter((o) => o.kind === 'player' && o.team === 'home').length;
    const aways = doc.objects.filter((o) => o.kind === 'player' && o.team === 'away').length;
    const field = doc.objects.filter((o) => o.kind === 'equipment').length;
    if (homes >= 2 && aways >= 2 && doc.format !== `${homes}v${aways}`) {
      setSuggestion({
        text: `Format ${homes} contre ${aways} ?`,
        run: () => {
          patch((d) => applyFormatDoc(d, `${homes}v${aways}`));
          setSuggestion(null);
          notify(`Format ${homes}v${aways} appliqué`);
        },
      });
    } else if (field >= 4 && field % 4 === 0) {
      setSuggestion({
        text: 'Créer un carré de passes ?',
        run: () => {
          patch((d) => ({
            ...d,
            info: { ...d.info, category: d.info.category ?? 'Technique', subcategory: 'Passe' },
          }));
          setSuggestion(null);
          notify('Carré de passes prêt');
        },
      });
    } else {
      setSuggestion(null);
    }
  }, [doc, notify, patch]);

  // ── Dessin de trajectoires ─────────────────────────────────

  const ownerForDrawing = useCallback(
    (startPoint: Point): string | null => {
      if (!doc) return null;
      const selected = selectedObjects.find((o) => o.kind === 'player');
      if (selected) return selected.id;
      let best: { id: string; d: number } | null = null;
      for (const o of doc.objects) {
        if (o.kind !== 'player') continue;
        const p = resolve(o.id);
        const d = Math.hypot(p.x - startPoint.x, p.y - startPoint.y);
        if (!best || d < best.d) best = { id: o.id, d };
      }
      return best && best.d < 12 ? best.id : null;
    },
    [doc, resolve, selectedObjects],
  );

  const commitDraw = useCallback(
    (rawPoints: Point[], actionType: ActionType) => {
      if (!doc || rawPoints.length < 2) return;
      const desc = actionDescriptor(actionType);
      const tolerance = clamp(doc.pitch.view.w / 140, 0.35, 2.2);
      let points = simplifyPath(rawPoints, tolerance);
      if (points.length < 2) points = [rawPoints[0], rawPoints[rawPoints.length - 1]];
      let total = 0;
      for (let i = 1; i < points.length; i++) {
        total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      }
      if (total < 2) {
        notify('Tracé trop court');
        return;
      }
      const ownerId = ownerForDrawing(points[0]);
      if (!ownerId) {
        notify('Sélectionnez d’abord un joueur');
        return;
      }
      const ownerPos = resolve(ownerId);
      points = [{ ...ownerPos }, ...points.slice(1)];

      const ball = ballAt(doc, safeStep);
      let ballId: string | null = null;
      let receiverId: string | null = null;
      let createdBall: SceneObject | null = null;

      if (desc.ball) {
        if (ball) {
          ballId = ball.id;
          if (ballOwnerAt(doc, safeStep, ball.id) !== ownerId) {
            patch((d) => setBallOwner(d, safeStep, ball.id, ownerId));
          }
        } else {
          createdBall = makeBall(ownerPos.x, ownerPos.y, ownerId);
          ballId = createdBall.id;
          patch((d) => {
            const steps = d.steps.map((s, i) =>
              i === safeStep
                ? { ...s, ballOwners: { ...s.ballOwners, [createdBall!.id]: ownerId } }
                : s,
            );
            return { ...d, objects: [...d.objects, createdBall as SceneObject], steps };
          });
        }
      }

      if (actionType === 'pass') {
        const end = points[points.length - 1];
        const candidates = doc.objects
          .filter((o) => o.kind === 'player' && o.id !== ownerId)
          .map((o) => ({ id: o.id, ...resolve(o.id) }));
        receiverId = findReceiver(end, candidates, Math.max(7, doc.pitch.view.w * 0.1), ownerId);
        if (receiverId) {
          const rp = resolve(receiverId);
          points = [...points.slice(0, -1), { x: rp.x, y: rp.y }];
        }
      }

      const action = createAction(actionType, ownerId, points, {
        stepIndex: safeStep,
        ballId,
        receiverId,
        style: desc.style,
      });
      patch((d) => applyActions(d, [action]).doc);
      const owner = doc.objects.find((o) => o.id === ownerId);
      const recv = receiverId ? doc.objects.find((o) => o.id === receiverId) : undefined;
      if (actionType === 'pass' && recv) {
        notify(`Passe ${owner?.number ?? ''} → ${recv.number ?? ''}`);
      } else if (actionType === 'pass') {
        notify('Passe dans l’espace — étape créée');
      } else if (actionType === 'shot') {
        notify('Frappe enregistrée');
      } else {
        notify(`${ACTION_LABEL[actionType]} — étape suivante créée`);
      }
      setSelectedActionId(action.id);
      setSelection([ownerId]);
      if (prefs.autoAdvance) setStepIndex((s) => Math.min(s + 1, safeStep + 1));
    },
    [doc, notify, ownerForDrawing, patch, prefs.autoAdvance, resolve, safeStep],
  );

  // ── Placement ──────────────────────────────────────────────

  const placeAt = useCallback(
    (world: Point, item: PlaceItem) => {
      if (!doc) return;
      const v = doc.pitch.view;
      const p = {
        x: clamp(world.x, v.x, v.x + v.w),
        y: clamp(world.y, v.y, v.y + v.h),
      };
      let created: SceneObject | null = null;
      if (item.type === 'player') {
        created = makePlayer(item.team, item.keeper ? 1 : nextFreeNumber(doc, item.team), p.x, p.y, {
          role: item.keeper ? 'GK' : item.team === 'away' ? 'DC' : 'MC',
          keeper: item.keeper ? true : undefined,
        });
      } else if (item.type === 'ball') {
        created = makeBall(p.x, p.y, null);
      } else if (item.type === 'equipment') {
        created = {
          id: uid('e'),
          kind: 'equipment',
          itemType: item.itemType,
          x: p.x,
          y: p.y,
          rotation: 0,
          scale: 1,
        };
      } else if (item.type === 'goal') {
        created = { id: uid('g'), kind: 'goal', goalKind: item.goalKind, x: p.x, y: p.y, rotation: 180 };
      } else if (item.type === 'zone') {
        created = {
          id: uid('z'),
          kind: 'zone',
          x: p.x,
          y: p.y,
          zoneW: 10,
          zoneH: 10,
          zoneColor: '#20E67A',
        };
      }
      if (!created) return;
      const createdId = created.id;
      patch((d) => ({
        ...d,
        objects: [...d.objects, created as SceneObject],
        steps: d.steps.map((s, i) =>
          i === safeStep ? { ...s, positions: { ...s.positions, [createdId]: { ...p } } } : s,
        ),
      }));
      if (item.type === 'player' || item.type === 'ball' || item.type === 'goal') {
        setSelection([createdId]);
        setTool({ kind: 'select' });
      }
    },
    [doc, patch, safeStep],
  );

  // ── Geste global ───────────────────────────────────────────

  const onGesture = useCallback(
    (e: GestureEvent) => {
      if (!doc) return;
      switch (e.kind) {
        case 'tap': {
          if (tool.kind === 'place') {
            placeAt(e.world, tool.item);
            return;
          }
          if (e.hit?.kind === 'object') select(e.hit.object.id);
          else if (e.hit?.kind === 'action') {
            setSelectedActionId(e.hit.actionId);
            setSelection([]);
          } else select(null);
          return;
        }
        case 'doubleTap':
          setViewport(DEFAULT_VIEWPORT);
          return;
        case 'longPress': {
          if (e.hit?.kind === 'object') {
            setSelection([e.hit.object.id]);
            setMenu({ open: true, objectId: e.hit.object.id });
          } else if (e.hit?.kind === 'action') {
            setSelectedActionId(e.hit.actionId);
            setMenu({ open: true, actionId: e.hit.actionId });
          } else setMenu({ open: true });
          return;
        }
        case 'dragStart':
          if (tool.kind === 'place') return;
          if (e.hit?.kind === 'object') beginDrag(e.world, e.hit.object.id);
          return;
        case 'drag':
          moveDrag(e.world, e.metersPerPixel);
          return;
        case 'dragEnd':
          endDrag();
          return;
        case 'drawStart': {
          if (!ownerForDrawing(e.world)) {
            notify('Sélectionnez d’abord un joueur');
            return;
          }
          drawRef.current = { points: [e.world] };
          return;
        }
        case 'draw':
          if (drawRef.current && e.points) drawRef.current.points = e.points;
          return;
        case 'drawEnd': {
          const points = e.points ?? drawRef.current?.points ?? [];
          drawRef.current = null;
          if (tool.kind === 'draw' && points.length > 1) commitDraw(points, tool.actionType);
          return;
        }
        default:
          return;
      }
    },
    [beginDrag, commitDraw, doc, endDrag, moveDrag, notify, ownerForDrawing, placeAt, select, tool],
  );

  // ── Objets ─────────────────────────────────────────────────

  const performDelete = useCallback(
    (ids: string[], withActions: boolean) => {
      patch((d) => ids.reduce((acc, id) => deleteObject(acc, id, withActions), d));
      setSelection([]);
      setAskDelete(null);
    },
    [patch],
  );

  const deleteSelected = useCallback(() => {
    if (!doc || selection.length === 0) return;
    const linked = selection.reduce((n, id) => n + countLinkedActions(doc, id), 0);
    if (linked > 0) {
      setAskDelete({ ids: selection, linked });
      return;
    }
    performDelete(selection, true);
  }, [doc, performDelete, selection]);

  const duplicateSelected = useCallback(
    (offset = 3) => {
      if (!doc || selection.length === 0) return;
      const created: string[] = [];
      patch((d) => {
        let next = d;
        for (const id of selection) {
          const src = next.objects.find((o) => o.id === id);
          if (!src) continue;
          const copy: SceneObject = {
            ...src,
            id: uid(src.kind === 'player' ? 'p' : src.kind === 'ball' ? 'b' : 'o'),
            x: src.x + offset,
            y: src.y + offset,
            locked: false,
          };
          created.push(copy.id);
          next = {
            ...next,
            objects: [...next.objects, copy],
            steps: next.steps.map((s, i) =>
              i === safeStep
                ? { ...s, positions: { ...s.positions, [copy.id]: { x: copy.x, y: copy.y } } }
                : s,
            ),
          };
        }
        return next;
      });
      if (created.length) {
        setSelection(created);
        notify(created.length > 1 ? `${created.length} objets dupliqués` : 'Objet dupliqué');
      }
    },
    [doc, notify, patch, safeStep, selection],
  );

  const repeatSelected = useCallback(
    (count: number, spacing: number) => {
      if (!doc || selection.length === 0) return;
      patch((d) => {
        let next = d;
        for (const id of selection) {
          const src = next.objects.find((o) => o.id === id);
          if (!src) continue;
          for (let i = 1; i <= count; i++) {
            const copy: SceneObject = {
              ...src,
              id: uid('o'),
              x: src.x + spacing * i,
              y: src.y,
              locked: false,
            };
            next = {
              ...next,
              objects: [...next.objects, copy],
              steps: next.steps.map((s, idx) =>
                idx === safeStep
                  ? { ...s, positions: { ...s.positions, [copy.id]: { x: copy.x, y: copy.y } } }
                  : s,
              ),
            };
          }
        }
        return next;
      });
      notify(`${count} répétition${count > 1 ? 's' : ''} créée${count > 1 ? 's' : ''}`);
    },
    [doc, notify, patch, safeStep, selection],
  );

  const updateSelected = useCallback(
    (patchObject: Partial<SceneObject>) => {
      if (selection.length === 0) return;
      patch((d) => ({
        ...d,
        objects: d.objects.map((o) => (selection.includes(o.id) ? { ...o, ...patchObject } : o)),
      }));
    },
    [patch, selection],
  );

  const moveSelectionBy = useCallback(
    (dx: number, dy: number) => {
      if (!doc || selection.length === 0) return;
      patch((d) => {
        let next = d;
        for (const id of selection) {
          const p = resolve(id);
          next = setObjectPosition(next, id, { x: p.x + dx, y: p.y + dy }, safeStep);
        }
        return next;
      });
    },
    [doc, patch, resolve, safeStep, selection],
  );

  const alignSelected = useCallback(
    (mode: AlignMode) => {
      if (!doc || selection.length < 2) return;
      const positions: Record<string, Point> = {};
      for (const id of selection) positions[id] = resolve(id);
      const targets = alignTargets(selection, mode, positions);
      patch((d) => {
        let next = d;
        for (const [id, p] of Object.entries(targets)) next = setObjectPosition(next, id, p, safeStep);
        return next;
      });
      notify('Alignement appliqué');
    },
    [doc, notify, patch, resolve, safeStep, selection],
  );

  const distributeSelected = useCallback(
    (axis: 'x' | 'y') => {
      if (!doc || selection.length < 3) return;
      const positions: Record<string, Point> = {};
      for (const id of selection) positions[id] = resolve(id);
      const targets = distributeTargets(selection, axis, positions);
      patch((d) => {
        let next = d;
        for (const [id, p] of Object.entries(targets)) next = setObjectPosition(next, id, p, safeStep);
        return next;
      });
      notify('Espacement automatique appliqué');
    },
    [doc, notify, patch, resolve, safeStep, selection],
  );

  const rotateSelected = useCallback(
    (delta: number) => {
      if (!doc || selection.length === 0) return;
      patch((d) => ({
        ...d,
        objects: d.objects.map((o) =>
          selection.includes(o.id) ? { ...o, rotation: ((o.rotation ?? 0) + delta + 360) % 360 } : o,
        ),
      }));
    },
    [doc, patch, selection],
  );

  const scaleSelected = useCallback(
    (delta: number) => {
      if (!doc || selection.length === 0) return;
      patch((d) => ({
        ...d,
        objects: d.objects.map((o) =>
          selection.includes(o.id) ? { ...o, scale: clamp((o.scale ?? 1) + delta, 0.4, 3) } : o,
        ),
      }));
    },
    [doc, patch, selection],
  );

  const toggleLockSelected = useCallback(() => {
    if (selection.length === 0) return;
    const allLocked = selectedObjects.every((o) => o.locked);
    updateSelected({ locked: !allLocked });
    notify(allLocked ? 'Objets déverrouillés' : 'Objets verrouillés');
  }, [notify, selectedObjects, selection, updateSelected]);

  // ── Étapes ─────────────────────────────────────────────────

  const addStep = useCallback(() => {
    patch((d) => insertStepAfter(d, d.steps.length - 1));
    setStepIndex(lastStepIndex + 1);
    notify('Étape ajoutée');
  }, [lastStepIndex, notify, patch]);

  const duplicateStep = useCallback(() => {
    patch((d) => duplicateStepDoc(d, safeStep));
    setStepIndex(safeStep + 1);
    notify('Étape dupliquée');
  }, [notify, patch, safeStep]);

  const removeStep = useCallback(() => {
    if (!doc || doc.steps.length <= 1) return;
    patch((d) => removeStepDoc(d, safeStep));
    setStepIndex(Math.max(0, safeStep - 1));
  }, [doc, patch, safeStep]);

  const moveStep = useCallback(
    (from: number, to: number) => {
      patch((d) => moveStepDoc(d, from, to));
      setStepIndex(clamp(to, 0, Math.max(0, lastStepIndex)));
    },
    [lastStepIndex, patch],
  );

  const setStepMeta = useCallback(
    (meta: { title?: string; note?: string; holdMs?: number; transitionMs?: number }) => {
      patch((d) => ({
        ...d,
        steps: d.steps.map((s, i) => (i === safeStep ? { ...s, ...meta } : s)),
      }));
    },
    [patch, safeStep],
  );

  // ── Terrain / buts / format / formations ───────────────────

  const setPitch = useCallback(
    (template: PitchTemplateId, orientation: Orientation, custom?: { length: number; width: number }) => {
      patch((d) => applyPitch(d, template, orientation, custom));
      setViewport(DEFAULT_VIEWPORT);
    },
    [patch],
  );

  const setGoalConfig = useCallback(
    (config: GoalConfigId) => {
      patch((d) => {
        const needsKeeper = config === 'oneLargeKeeper';
        const objects = d.objects.filter((o) => {
          if (o.kind === 'goal') return false;
          if (o.kind === 'player' && o.keeper && !needsKeeper) return false;
          return true;
        });
        const goals = buildGoals(config, d.pitch);
        let next: TactixDoc = { ...d, goalConfig: config, objects: [...objects, ...goals] };
        if (needsKeeper && !next.objects.some((o) => o.keeper)) {
          next = { ...next, objects: [...next.objects, autoKeeper(next)] };
        }
        return next;
      });
      notify('Buts mis à jour');
    },
    [notify, patch],
  );

  const setFormat = useCallback(
    (formatId: string) => {
      patch((d) => applyFormatDoc(d, formatId));
      notify(`Format ${formatId} appliqué`);
    },
    [notify, patch],
  );

  const applyFormationTo = useCallback(
    (formationId: string, team: Team) => {
      patch((d) => applyFormation(d, formationId, team));
      notify(`Formation ${formationId}`);
    },
    [notify, patch],
  );

  // ── Trajectoires ───────────────────────────────────────────

  const deleteActionById = useCallback(
    (actionId: string) => {
      patch((d) => removeActions(d, [actionId]));
      setSelectedActionId(null);
      notify('Trajectoire supprimée');
    },
    [notify, patch],
  );

  const patchAction = useCallback(
    (actionId: string, p: Partial<Action>) => {
      patch((d) => updateAction(d, actionId, p));
    },
    [patch],
  );

  const findAction = useCallback(
    (actionId: string | null | undefined): Action | undefined => {
      if (!doc || !actionId) return undefined;
      for (const s of doc.steps) {
        const found = s.actions.find((a) => a.id === actionId);
        if (found) return found;
      }
      return undefined;
    },
    [doc],
  );

  // ── Divers ─────────────────────────────────────────────────

  const clearAll = useCallback(() => {
    patch((d) => ({
      ...d,
      objects: [],
      steps: d.steps.map((s, i) => (i === 0 ? { ...s, positions: {}, ballOwners: {}, actions: [] } : s)),
    }));
    setSelection([]);
  }, [patch]);

  const zoomBy = useCallback(
    (factor: number) => {
      if (!doc) return;
      setViewport((v) => zoomViewport(v, screenBox(doc.pitch), factor));
    },
    [doc],
  );

  const togglePrecision = useCallback(() => {
    setPrefs((p) => {
      const snap = !p.snap;
      setSettings({ snapPrecise: snap });
      notify(snap ? 'Placement précis activé' : 'Placement libre');
      return { ...p, snap };
    });
  }, [notify, setSettings]);

  const toggleGrid = useCallback(() => {
    setPrefs((p) => {
      const grid = !p.grid;
      setSettings({ showGrid: grid });
      return { ...p, grid };
    });
  }, [setSettings]);

  const selectedAction = findAction(selectedActionId);

  return {
    doc,
    stepIndex: safeStep,
    setStepIndex,
    selection,
    setSelection,
    select,
    selectedObjects,
    primary,
    selectedAction,
    selectedActionId,
    setSelectedActionId,
    tool,
    setTool,
    viewport,
    setViewport,
    playing,
    play,
    pause,
    setPlaying,
    t,
    setT,
    guides,
    menu,
    setMenu,
    toast,
    notify,
    multi,
    setMulti,
    prefs,
    setPrefs,
    askDelete,
    setAskDelete,
    suggestion,
    setSuggestion,
    frame,
    resolve,
    currentStep,
    history: { undo, redo, canUndo, canRedo },
    onGesture,
    patch,
    placeAt,
    deleteSelected,
    performDelete,
    duplicateSelected,
    repeatSelected,
    updateSelected,
    moveSelectionBy,
    alignSelected,
    distributeSelected,
    rotateSelected,
    scaleSelected,
    toggleLockSelected,
    addStep,
    duplicateStep,
    removeStep,
    moveStep,
    setStepMeta,
    setPitch,
    setGoalConfig,
    setFormat,
    applyFormationTo,
    deleteActionById,
    patchAction,
    commitDraw,
    clearAll,
    zoomBy,
    togglePrecision,
    toggleGrid,
    resetAnimation,
  };
}

// ── Utilitaires internes ─────────────────────────────────────

function autoKeeper(doc: TactixDoc): SceneObject {
  const v = doc.pitch.view;
  return makePlayer('away', 1, v.x + v.w - 4, doc.pitch.width / 2, {
    role: 'GK',
    keeper: true,
  });
}

function setBallOwner(
  doc: TactixDoc,
  stepIndex: number,
  ballId: string,
  ownerId: string | null,
): TactixDoc {
  return {
    ...doc,
    objects: doc.objects.map((o) => (o.id === ballId ? { ...o, ownerId } : o)),
    steps: doc.steps.map((s, i) =>
      i === stepIndex ? { ...s, ballOwners: { ...s.ballOwners, [ballId]: ownerId } } : s,
    ),
  };
}

/** Une trajectoire suit le point de départ de son joueur. */
function followActions(doc: TactixDoc, ids: string[], stepIndex: number): TactixDoc {
  return {
    ...doc,
    steps: doc.steps.map((step, i) => {
      if (i !== stepIndex) return step;
      let changed = false;
      const actions = step.actions.map((a) => {
        if (!ids.includes(a.ownerId) || a.points.length === 0) return a;
        const ownerPos = step.positions[a.ownerId];
        if (!ownerPos) return a;
        changed = true;
        return { ...a, points: [{ ...ownerPos }, ...a.points.slice(1)] };
      });
      return changed ? { ...step, actions } : step;
    }),
  };
}

export const LINE_STYLE_OPTIONS: { id: LineStyle; label: string }[] = [
  { id: 'solid', label: 'Continue' },
  { id: 'dashed', label: 'Tirets' },
  { id: 'dotted', label: 'Points' },
];
