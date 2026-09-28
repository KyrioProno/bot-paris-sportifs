import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/workspace';
import { PitchCanvas, DEFAULT_VIEWPORT, type Viewport } from '../components/pitch/PitchCanvas';
import { buildScene } from '../render/scene';
import { computeFrame, stepDuration } from '../domain/animation';
import { stepPosition } from '../domain/steps';
import { describeAction } from '../domain/steps';
import { Btn, Icons } from '../components/ui';
import { ACTIONS } from '../domain/actions';

// ─────────────────────────────────────────────────────────────
// MODE PRÉSENTATION : plein écran, interface masquée.
// Terrain + joueurs + ballon + matériel + trajectoires + consignes.
// ─────────────────────────────────────────────────────────────

export function PresentView({ docId, onExit }: { docId: string; onExit: () => void }) {
  const { ws } = useStore();
  const doc = ws.docs.find((d) => d.id === docId);
  const [stepIndex, setStepIndex] = useState(0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);
  const raf = useRef(0);

  const step = doc?.steps[Math.min(stepIndex, (doc?.steps.length ?? 1) - 1)];
  const duration = step ? stepDuration(step, ws.settings.speed) : 1200;

  useEffect(() => {
    if (!doc || !playing) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setT((prev) => {
        const next = prev + dt / duration;
        if (next < 1) return next;
        setStepIndex((s) => {
          if (s < doc.steps.length - 1) return s + 1;
          return 0;
        });
        return 0;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, duration, doc]);

  const frame = useMemo(
    () => (doc ? computeFrame(doc, stepIndex, t, ws.settings.speed) : null),
    [doc, stepIndex, t, ws.settings.speed],
  );

  const scene = useMemo(() => {
    if (!doc) return null;
    return buildScene({
      doc,
      stepIndex,
      frame: frame ?? undefined,
      selection: [],
      gridStep: null,
      showDistances: false,
      present: true,
      progress: frame?.progress ?? {},
    });
  }, [doc, stepIndex, frame]);

  const resolve = useCallback(
    (id: string) => frame?.positions[id] ?? (doc ? stepPosition(doc, stepIndex, id) : { x: 0, y: 0 }),
    [doc, frame, stepIndex],
  );

  const onGesture = useCallback(
    (e: { kind: string; world: { x: number; y: number } }) => {
      if (e.kind === 'tap') {
        setPlaying((p) => !p);
      }
      if (e.kind === 'doubleTap') setViewport(DEFAULT_VIEWPORT);
    },
    [],
  );

  if (!doc || !scene) {
    return (
      <div className="present">
        <div className="present__stage" style={{ display: 'grid', placeItems: 'center' }}>
          <div>
            <p>Document introuvable.</p>
            <Btn onClick={onExit}>Retour</Btn>
          </div>
        </div>
      </div>
    );
  }

  const actions = step?.actions ?? [];

  return (
    <div className="present">
      <div className="present__stage" style={{ position: 'relative' }}>
        <PitchCanvas
          doc={doc}
          scene={scene}
          viewport={viewport}
          onViewportChange={setViewport}
          onGesture={onGesture}
          resolve={resolve}
          activeTool="select"
        />

        <div className="float float--tr">
          <button className="fab" onClick={() => setShowNotes((v) => !v)} title="Consignes">
            📋
          </button>
          <button className="fab" onClick={() => setViewport(DEFAULT_VIEWPORT)} title="Recentrer">
            ⤢
          </button>
          <button className="fab" onClick={onExit} title="Quitter">
            ✕
          </button>
        </div>

        <div
          style={{
            position: 'absolute',
            top: 10,
            left: 12,
            right: 76,
            pointerEvents: 'none',
          }}
        >
          <div className="present__caption">
            <div className="row row--between">
              <strong style={{ fontSize: 16 }}>{doc.name}</strong>
              <span className="pill pill--green">
                Étape {stepIndex + 1}/{doc.steps.length}
              </span>
            </div>
            {step?.title && <div className="muted small">{step.title}</div>}
            {actions.length > 0 && (
              <ul style={{ margin: '6px 0 0 0', paddingLeft: 16 }}>
                {actions.slice(0, 3).map((a) => (
                  <li key={a.id} className="small">
                    {describeAction(a, doc)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {showNotes && (
          <div
            style={{
              position: 'absolute',
              left: 12,
              right: 12,
              bottom: 12,
              maxHeight: '45%',
              overflowY: 'auto',
            }}
          >
            <div className="present__caption">
              {doc.info.objective && (
                <>
                  <div className="h3">Objectif</div>
                  <p className="small muted">{doc.info.objective}</p>
                </>
              )}
              {step?.note && (
                <>
                  <div className="h3" style={{ marginTop: 8 }}>Consigne de l’étape</div>
                  <p className="small muted">{step.note}</p>
                </>
              )}
              {doc.info.keyPoints.filter(Boolean).length > 0 && (
                <>
                  <div className="h3" style={{ marginTop: 8 }}>Points clés</div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {doc.info.keyPoints.filter(Boolean).map((k, i) => (
                      <li key={i} className="small muted">
                        {k}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {doc.info.instructions && (
                <>
                  <div className="h3" style={{ marginTop: 8 }}>Instructions</div>
                  <p className="small muted">{doc.info.instructions}</p>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="present__bar">
        <button
          className="fab"
          style={{ width: 40, height: 40 }}
          onClick={() => setStepIndex(Math.max(0, stepIndex - 1))}
          disabled={stepIndex === 0}
        >
          {Icons.prev}
        </button>
        <button className="fab fab--on" style={{ width: 48, height: 48 }} onClick={() => setPlaying((p) => !p)}>
          {playing ? Icons.pause : Icons.play}
        </button>
        <button
          className="fab"
          style={{ width: 40, height: 40 }}
          onClick={() => setStepIndex(Math.min(doc.steps.length - 1, stepIndex + 1))}
          disabled={stepIndex >= doc.steps.length - 1}
        >
          {Icons.next}
        </button>
        <div className="steps">
          {doc.steps.map((s, i) => (
            <button
              key={s.id}
              className={`step-dot${i === stepIndex ? ' is-active' : ''}${i < stepIndex ? ' is-done' : ''}`}
              onClick={() => {
                setStepIndex(i);
                setT(0);
              }}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <span className="pill">{ACTIONS.length > 0 ? doc.format : ''}</span>
      </div>

    </div>
  );
}
