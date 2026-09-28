import React, { useMemo } from 'react';
import type { TactixDoc } from '../domain/types';
import { buildScene } from '../render/scene';
import { computeFrame } from '../domain/animation';
import { screenBox, worldTransform } from '../domain/pitch/orientation';
import { ShapeLayer } from './pitch/ShapeView';

// Aperçu miniature du terrain (rendu vectoriel réel, en lecture seule).

export function fullProgress(doc: TactixDoc): Record<string, number> {
  const progress: Record<string, number> = {};
  for (const step of doc.steps) for (const a of step.actions) progress[a.id] = 1;
  return progress;
}

export function PitchThumb({
  doc,
  stepIndex = 0,
  className,
  style,
}: {
  doc: TactixDoc;
  stepIndex?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const scene = useMemo(() => {
    const frame = computeFrame(doc, stepIndex, 0, 1);
    return buildScene({
      doc,
      stepIndex,
      frame,
      selection: [],
      gridStep: null,
      showDistances: false,
      progress: fullProgress(doc),
    });
  }, [doc, stepIndex]);

  return (
    <svg
      viewBox={`${screenBox(doc.pitch).x} ${screenBox(doc.pitch).y} ${screenBox(doc.pitch).w} ${screenBox(doc.pitch).h}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      style={{ display: 'block', width: '100%', height: '100%', borderRadius: 12, ...style }}
      aria-hidden
    >
      <defs dangerouslySetInnerHTML={{ __html: scene.defs }} />
      <g transform={worldTransform(doc.pitch)}>
        <ShapeLayer shapes={scene.world} />
      </g>
      <g>
        <ShapeLayer shapes={scene.screen} />
      </g>
    </svg>
  );
}
