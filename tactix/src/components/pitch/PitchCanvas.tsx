import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Point, SceneObject, TactixDoc } from '../../domain/types';
import { screenBox, screenToWorld, viewBoxString, worldTransform } from '../../domain/pitch/orientation';
import type { Scene } from '../../render/scene';
import { ShapeLayer } from './ShapeView';
import { C } from '../../render/theme';
import { hitTest, type Hit, type LiveResolver } from '../../engine/interaction';
import { clamp } from '../../domain/geometry';

// ─────────────────────────────────────────────────────────────
// Le plateau interactif : terrain vectoriel + interactions tactiles.
//   1 doigt     → déplacer un objet / dessiner une trajectoire / naviguer
//   2 doigts    → zoom + déplacement
//   double tap  → recentrer
//   appui long  → menu contextuel
// ─────────────────────────────────────────────────────────────

export interface Viewport {
  scale: number;
  tx: number;
  ty: number;
}

export const DEFAULT_VIEWPORT: Viewport = { scale: 1, tx: 0, ty: 0 };

export type GestureKind =
  | 'tap'
  | 'longPress'
  | 'dragStart'
  | 'drag'
  | 'dragEnd'
  | 'drawStart'
  | 'draw'
  | 'drawEnd'
  | 'doubleTap';

export interface GestureEvent {
  kind: GestureKind;
  world: Point;
  hit: Hit | null;
  metersPerPixel: number;
  /** Tracé brut du doigt (pour les gestes de dessin). */
  points?: Point[];
}

interface Props {
  doc: TactixDoc;
  scene: Scene;
  viewport: Viewport;
  onViewportChange: (v: Viewport) => void;
  onGesture: (e: GestureEvent) => void;
  resolve: LiveResolver;
  activeTool: 'select' | 'draw' | 'place';
  children?: React.ReactNode;
}

interface PointerInfo {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  moved: boolean;
}

export function zoomViewport(v: Viewport, box: { x: number; y: number; w: number; h: number }, factor: number): Viewport {
  const nextScale = clamp(v.scale * factor, 1, 8);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const ratio = nextScale / v.scale;
  return {
    scale: nextScale,
    tx: cx - (cx - v.tx) * ratio,
    ty: cy - (cy - v.ty) * ratio,
  };
}

export function PitchCanvas({
  doc,
  scene,
  viewport,
  onViewportChange,
  onGesture,
  resolve,
  activeTool,
  children,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointers = useRef<Map<number, PointerInfo>>(new Map());
  const pinch = useRef<{ dist: number; mid: Point; viewport: Viewport } | null>(null);
  const panStart = useRef<{ client: Point; viewport: Viewport } | null>(null);
  const gesture = useRef<'none' | 'object' | 'draw' | 'pan'>('none');
  const drawPoints = useRef<Point[]>([]);
  const longPressTimer = useRef<number | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const [preview, setPreview] = useState<Point[] | null>(null);

  const vb = useMemo(() => screenBox(doc.pitch), [doc.pitch]);
  const viewBox = useMemo(() => viewBoxString(doc.pitch), [doc.pitch]);
  const wTransform = useMemo(() => worldTransform(doc.pitch), [doc.pitch]);

  const metrics = useCallback(() => {
    const el = svgRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const s = Math.min(rect.width / vb.w, rect.height / vb.h) || 1;
    return {
      rect,
      s,
      offX: (rect.width - vb.w * s) / 2,
      offY: (rect.height - vb.h * s) / 2,
    };
  }, [vb.w, vb.h]);

  const toWorld = useCallback(
    (clientX: number, clientY: number): { world: Point; mpp: number } => {
      const m = metrics();
      if (!m) return { world: { x: vb.x, y: vb.y }, mpp: 1 };
      const ux = (clientX - m.rect.left - m.offX) / m.s + vb.x;
      const uy = (clientY - m.rect.top - m.offY) / m.s + vb.y;
      const sx = (ux - viewport.tx) / viewport.scale;
      const sy = (uy - viewport.ty) / viewport.scale;
      return {
        world: screenToWorld({ x: sx, y: sy }, doc.pitch),
        mpp: 1 / (m.s * viewport.scale),
      };
    },
    [doc.pitch, metrics, vb.x, vb.y, viewport],
  );

  const hitAt = useCallback(
    (world: Point, mpp: number): Hit | null => {
      const tolerance = clamp(mpp * 24, 0.8, 7);
      return hitTest(doc, world, tolerance, resolve);
    },
    [doc, resolve],
  );

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  useEffect(() => () => clearLongPress(), [clearLongPress]);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const el = svgRef.current;
    if (!el) return;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const { world, mpp } = toWorld(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    });

    if (pointers.current.size === 2) {
      clearLongPress();
      gesture.current = 'none';
      setPreview(null);
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        viewport: { ...viewport },
      };
      panStart.current = null;
      return;
    }

    const hit = hitAt(world, mpp);

    clearLongPress();
    longPressTimer.current = window.setTimeout(() => {
      const p = pointers.current.get(e.pointerId);
      if (!p || p.moved) return;
      gesture.current = 'none';
      setPreview(null);
      pointers.current.delete(e.pointerId);
      onGesture({ kind: 'longPress', world, hit, metersPerPixel: mpp });
    }, 450);

    const now = Date.now();
    if (
      lastTap.current &&
      now - lastTap.current.t < 330 &&
      Math.hypot(e.clientX - lastTap.current.x, e.clientY - lastTap.current.y) < 28
    ) {
      lastTap.current = null;
      clearLongPress();
      gesture.current = 'none';
      onGesture({ kind: 'doubleTap', world, hit, metersPerPixel: mpp });
      return;
    }
    lastTap.current = { t: now, x: e.clientX, y: e.clientY };

    if (activeTool === 'draw') {
      gesture.current = 'draw';
      drawPoints.current = [world];
      setPreview([world]);
      onGesture({ kind: 'drawStart', world, hit, metersPerPixel: mpp, points: [world] });
      return;
    }

    if (activeTool === 'place') {
      gesture.current = 'none';
      onGesture({ kind: 'tap', world, hit, metersPerPixel: mpp });
      return;
    }

    if (hit) {
      gesture.current = 'object';
      onGesture({ kind: 'dragStart', world, hit, metersPerPixel: mpp });
    } else {
      gesture.current = 'pan';
      panStart.current = { client: { x: e.clientX, y: e.clientY }, viewport: { ...viewport } };
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const info = pointers.current.get(e.pointerId);
    if (!info) return;
    info.x = e.clientX;
    info.y = e.clientY;
    if (Math.hypot(e.clientX - info.startX, e.clientY - info.startY) > 6) info.moved = true;
    if (info.moved) clearLongPress();

    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const m = metrics();
      if (m) {
        const factor = dist / (pinch.current.dist || 1);
        const nextScale = clamp(pinch.current.viewport.scale * factor, 1, 8);
        const ux = (mid.x - m.rect.left - m.offX) / m.s + vb.x;
        const uy = (mid.y - m.rect.top - m.offY) / m.s + vb.y;
        const ratio = nextScale / pinch.current.viewport.scale;
        onViewportChange({
          scale: nextScale,
          tx: ux - (ux - pinch.current.viewport.tx) * ratio + (mid.x - pinch.current.mid.x) / m.s,
          ty: uy - (uy - pinch.current.viewport.ty) * ratio + (mid.y - pinch.current.mid.y) / m.s,
        });
      }
      return;
    }

    const { world, mpp } = toWorld(e.clientX, e.clientY);

    if (gesture.current === 'draw') {
      const last = drawPoints.current[drawPoints.current.length - 1];
      if (!last || Math.hypot(world.x - last.x, world.y - last.y) > 0.15) {
        drawPoints.current = [...drawPoints.current, world];
        setPreview(drawPoints.current);
      }
      onGesture({ kind: 'draw', world, hit: null, metersPerPixel: mpp, points: drawPoints.current });
      return;
    }

    if (gesture.current === 'object') {
      onGesture({ kind: 'drag', world, hit: null, metersPerPixel: mpp });
      return;
    }

    if (gesture.current === 'pan' && panStart.current) {
      const m = metrics();
      if (!m) return;
      onViewportChange({
        scale: panStart.current.viewport.scale,
        tx: panStart.current.viewport.tx + (e.clientX - panStart.current.client.x) / m.s,
        ty: panStart.current.viewport.ty + (e.clientY - panStart.current.client.y) / m.s,
      });
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const info = pointers.current.get(e.pointerId);
    clearLongPress();
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (!info) return;
    const mppNow = toWorld(e.clientX, e.clientY).mpp;
    const world = toWorld(e.clientX, e.clientY).world;

    if (gesture.current === 'draw') {
      const points = drawPoints.current;
      drawPoints.current = [];
      setPreview(null);
      gesture.current = 'none';
      onGesture({ kind: 'drawEnd', world, hit: null, metersPerPixel: mppNow, points });
      return;
    }
    if (gesture.current === 'object') {
      gesture.current = 'none';
      if (!info.moved) onGesture({ kind: 'tap', world, hit: hitAt(world, mppNow), metersPerPixel: mppNow });
      onGesture({ kind: 'dragEnd', world, hit: null, metersPerPixel: mppNow });
      return;
    }
    if (gesture.current === 'pan') {
      const wasTap = !info.moved;
      gesture.current = 'none';
      panStart.current = null;
      if (wasTap) onGesture({ kind: 'tap', world, hit: null, metersPerPixel: mppNow });
    }
  };

  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    const m = metrics();
    if (!m) return;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const nextScale = clamp(viewport.scale * factor, 1, 8);
    const ux = (e.clientX - m.rect.left - m.offX) / m.s + vb.x;
    const uy = (e.clientY - m.rect.top - m.offY) / m.s + vb.y;
    const ratio = nextScale / viewport.scale;
    onViewportChange({
      scale: nextScale,
      tx: ux - (ux - viewport.tx) * ratio,
      ty: uy - (uy - viewport.ty) * ratio,
    });
  };

  return (
    <svg
      ref={svgRef}
      className="tactix-pitch"
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      onContextMenu={(e) => e.preventDefault()}
      style={{ touchAction: 'none', background: C.bg, display: 'block', width: '100%', height: '100%' }}
    >
      <defs dangerouslySetInnerHTML={{ __html: scene.defs }} />
      <g transform={`translate(${viewport.tx} ${viewport.ty}) scale(${viewport.scale})`}>
        <g transform={wTransform}>
          <ShapeLayer shapes={scene.world} />
        </g>
        <g>
          <ShapeLayer shapes={scene.screen} />
        </g>
        {preview && preview.length > 1 && (
          <g transform={wTransform}>
            <polyline
              points={preview.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="rgba(244,247,245,0.5)"
              strokeWidth={0.45}
              strokeLinecap="round"
            />
          </g>
        )}
      </g>
      {children}
    </svg>
  );
}

export function objectAt(hit: Hit | null): SceneObject | null {
  return hit && hit.kind === 'object' ? hit.object : null;
}
