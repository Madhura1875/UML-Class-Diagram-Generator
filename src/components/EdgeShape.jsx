import React from 'react';
import { ACCENT, INK, PAPER, PAPER_LIGHT } from '../utils/theme.js';

const P = (pts) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
const mv = (p, f, d) => ({ x: p.x + f.x * d, y: p.y + f.y * d });
const normalOf = (f) => ({ x: -f.y, y: f.x });

export default function EdgeShape({ rel, geom, selected, onPointerDown }) {
  const { type } = rel;
  const { p0, p1, fStart, fEnd } = geom;
  const nS = normalOf(fStart);
  const nE = normalOf(fEnd);
  const pts = geom.points.map((p) => ({ ...p }));
  const dashed = type === 'dependency' || type === 'realization';
  const wholePart = type === 'aggregation' || type === 'composition';

  let startDeco = null;
  let endDeco = null;

  if (wholePart) {
    const left = mv(mv(p0, fStart, 12), nS, 7);
    const far = mv(p0, fStart, 24);
    const right = mv(mv(p0, fStart, 12), nS, -7);
    startDeco = (
      <polygon
        points={P([p0, left, far, right])}
        fill={type === 'composition' ? INK : PAPER_LIGHT}
        stroke={INK}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    );
    pts[0] = far;
  }

  if (type === 'inheritance' || type === 'realization') {
    const base = mv(p1, fEnd, -16);
    endDeco = (
      <polygon
        points={P([p1, mv(base, nE, 8.5), mv(base, nE, -8.5)])}
        fill={PAPER_LIGHT}
        stroke={INK}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    );
    pts[pts.length - 1] = base;
  } else if (type === 'association' || type === 'dependency') {
    const back = mv(p1, fEnd, -12);
    endDeco = (
      <polyline
        points={P([mv(back, nE, 6.5), p1, mv(back, nE, -6.5)])}
        fill="none"
        stroke={INK}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    );
  }

  const text = (p, content, key, anchor = 'middle') => (
    <text
      key={key}
      x={p.x}
      y={p.y + 4}
      textAnchor={anchor}
      fontSize="11.5"
      fill={INK}
      stroke={PAPER}
      strokeWidth="3.5"
      strokeLinejoin="round"
      paintOrder="stroke"
    >
      {content}
    </text>
  );

  const labels = [];
  const startAlong = wholePart ? 40 : 24;
  const endAlong = type === 'inheritance' || type === 'realization' ? 40 : 32;
  if (rel.fromMult) labels.push(text(mv(mv(p0, fStart, startAlong), nS, 13), rel.fromMult, 'fm'));
  if (rel.toMult) labels.push(text(mv(mv(p1, fEnd, -endAlong), nE, 13), rel.toMult, 'tm'));
  if (rel.toRole) {
    labels.push(text(mv(mv(p1, fEnd, -endAlong - 6), nE, -13), rel.toRole, 'tr'));
  }
  if (rel.label) {
    const lp = geom.loop ? { x: geom.mid.x, y: geom.mid.y - 8 } : mv(geom.mid, normalOf(fEnd), -10);
    labels.push(text(lp, rel.label, 'lb'));
  }

  const polyPoints = P(pts);

  return (
    <g data-edge={rel.id}>
      {selected && (
        <polyline
          data-export-hide="true"
          points={P(geom.points)}
          fill="none"
          stroke={ACCENT}
          strokeOpacity="0.35"
          strokeWidth="8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      <polyline
        points={polyPoints}
        fill="none"
        stroke={selected ? ACCENT : INK}
        strokeWidth="1.5"
        strokeDasharray={dashed ? '7 5' : undefined}
        strokeLinejoin="round"
      />
      {startDeco}
      {endDeco}
      {labels}
      {/* wide invisible hit target */}
      <polyline
        data-export-hide="true"
        points={P(geom.points)}
        fill="none"
        stroke="transparent"
        strokeWidth="16"
        pointerEvents="stroke"
        style={{ cursor: 'pointer' }}
        onPointerDown={(e) => onPointerDown(e, rel)}
      />
    </g>
  );
}
