import React from 'react';
import { KINDS } from '../utils/model.js';
import { getNodeSize, ROW_H, COMP_PAD } from '../utils/geometry.js';
import { ACCENT, FONT_MONO, INK, KIND_FILL, PAPER_LIGHT } from '../utils/theme.js';

export default function ClassNode({ cls, selected, pending, onPointerDown }) {
  const { w, h, headH, attrH, attrs, methods } = getNodeSize(cls);
  const stereotype = KINDS[cls.kind].stereotype;
  const fill = KIND_FILL[cls.kind];
  const isAbstractKind = cls.kind === 'abstract';
  const isInterface = cls.kind === 'interface';

  return (
    <g
      data-node={cls.id}
      transform={`translate(${cls.x} ${cls.y})`}
      onPointerDown={(e) => onPointerDown(e, cls)}
      style={{ cursor: 'grab', userSelect: 'none' }}
    >
      {/* soft shadow */}
      <rect x={3} y={4} width={w} height={h} rx={7} fill="rgba(31,42,58,0.10)" />
      {/* body */}
      <rect width={w} height={h} rx={7} fill={PAPER_LIGHT} />
      {/* header */}
      <rect width={w} height={headH} rx={7} fill={fill} />
      <rect y={headH - 8} width={w} height={8} fill={fill} />

      {stereotype && (
        <text x={w / 2} y={19} textAnchor="middle" fontSize="11" fill={INK} opacity="0.75" fontStyle="italic">
          {`«${stereotype}»`}
        </text>
      )}
      <text
        x={w / 2}
        y={stereotype ? 39 : 22}
        textAnchor="middle"
        fontSize="14.5"
        fontWeight="700"
        fill={INK}
        fontStyle={isAbstractKind || isInterface ? 'italic' : 'normal'}
      >
        {cls.name || '(unnamed)'}
      </text>

      {/* attribute compartment */}
      {attrs.map((text, i) => {
        const a = cls.attributes[i];
        return (
          <text
            key={a.id}
            x={10}
            y={headH + COMP_PAD + i * ROW_H + 14}
            fontSize="12.5"
            fontFamily={FONT_MONO}
            fill={INK}
            textDecoration={a.isStatic ? 'underline' : undefined}
            fontWeight={cls.kind === 'enum' ? '600' : undefined}
          >
            {text}
          </text>
        );
      })}

      {/* method compartment */}
      {methods.map((text, i) => {
        const m = cls.methods[i];
        const abstract = (isAbstractKind && m.isAbstract) || (isInterface && !m.isStatic);
        return (
          <text
            key={m.id}
            x={10}
            y={headH + attrH + COMP_PAD + i * ROW_H + 14}
            fontSize="12.5"
            fontFamily={FONT_MONO}
            fill={INK}
            fontStyle={abstract ? 'italic' : 'normal'}
            textDecoration={m.isStatic ? 'underline' : undefined}
          >
            {text}
          </text>
        );
      })}

      {/* dividers */}
      <line x1={0} x2={w} y1={headH} y2={headH} stroke={INK} strokeWidth="1.2" />
      <line x1={0} x2={w} y1={headH + attrH} y2={headH + attrH} stroke={INK} strokeWidth="1.2" />

      {/* border */}
      <rect width={w} height={h} rx={7} fill="none" stroke={INK} strokeWidth="1.6" />

      {/* editor-only highlights (not exported) */}
      {selected && (
        <rect
          data-export-hide="true"
          x={-4}
          y={-4}
          width={w + 8}
          height={h + 8}
          rx={10}
          fill="none"
          stroke={ACCENT}
          strokeWidth="2.5"
        />
      )}
      {pending && (
        <rect
          data-export-hide="true"
          x={-5}
          y={-5}
          width={w + 10}
          height={h + 10}
          rx={11}
          fill="none"
          stroke={ACCENT}
          strokeWidth="2"
          strokeDasharray="6 4"
        />
      )}
    </g>
  );
}
