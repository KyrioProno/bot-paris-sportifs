import React from 'react';
import type { Shape } from '../../render/shapes';

// Rendu React des primitives vectorielles (identiques à l'export SVG).

function commonProps(shape: Shape) {
  return {
    fill: shape.fill ?? 'none',
    stroke: shape.stroke,
    strokeWidth: shape.sw,
    strokeLinecap: shape.cap ?? 'round',
    strokeLinejoin: shape.join ?? 'round',
    strokeDasharray: shape.dash,
    opacity: shape.opacity,
    fillRule: shape.fillRule,
  } as const;
}

const ShapeViewInner = ({ shape }: { shape: Shape }) => {
  const props = commonProps(shape);
  switch (shape.k) {
    case 'poly': {
      const points = shape.points.map((p) => `${p.x},${p.y}`).join(' ');
      return shape.closed ? <polygon points={points} {...props} /> : <polyline points={points} {...props} />;
    }
    case 'circle':
      return <circle cx={shape.cx} cy={shape.cy} r={shape.r} {...props} />;
    case 'ellipse':
      return <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} {...props} />;
    case 'rect':
      return <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.rx} {...props} />;
    case 'path':
      return <path d={shape.d} {...props} />;
    case 'text':
      return (
        <text
          x={shape.x}
          y={shape.y}
          fontSize={shape.size}
          fontWeight={shape.weight ?? 700}
          textAnchor={shape.anchor ?? 'middle'}
          fontFamily="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
          {...props}
        >
          {shape.text}
        </text>
      );
    default:
      return null;
  }
};

export const ShapeView = React.memo(ShapeViewInner);

export const ShapeLayer = React.memo(({ shapes }: { shapes: Shape[] }) => (
  <>
    {shapes.map((s, i) => (
      <ShapeView key={i} shape={s} />
    ))}
  </>
));
ShapeLayer.displayName = 'ShapeLayer';
