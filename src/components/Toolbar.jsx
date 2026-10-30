import React, { useEffect, useRef, useState } from 'react';
import { KINDS, REL_TYPES } from '../utils/model.js';
import { INK } from '../utils/theme.js';

// tiny line icon for each relation type
function RelIcon({ type }) {
  const c = 'currentColor';
  const dashed = type === 'dependency' || type === 'realization';
  let x1 = 2;
  let x2 = 34;
  let deco = null;
  if (type === 'inheritance' || type === 'realization') {
    x2 = 22;
    deco = <polygon points="22,3.5 34,9 22,14.5" fill="none" stroke={c} strokeWidth="1.4" strokeLinejoin="round" />;
  } else if (type === 'association' || type === 'dependency') {
    deco = <polyline points="27,4 34,9 27,14" fill="none" stroke={c} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />;
  } else {
    x1 = 14;
    deco = (
      <polygon
        points="2,9 8,4.5 14,9 8,13.5"
        fill={type === 'composition' ? c : 'none'}
        stroke={c}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    );
  }
  return (
    <svg width="36" height="18" viewBox="0 0 36 18" aria-hidden="true">
      <line x1={x1} y1="9" x2={x2} y2="9" stroke={c} strokeWidth="1.4" strokeDasharray={dashed ? '3 2.5' : undefined} />
      {deco}
    </svg>
  );
}

function Menu({ label, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button className="btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {label} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="menu-pop" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

export default function Toolbar({
  tool, onTool, onAdd, canUndo, canRedo, onUndo, onRedo, onAutoLayout, onFit, onZoom,
  onZip, onNew, onSample, onImport, onExportJson, onExportPng, onExportSvg,
}) {
  return (
    <header className="toolbar">
      <div className="brand">
        <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="7" fill="#f6f1e7" />
          <rect x="6" y="6" width="20" height="20" rx="2" fill="none" stroke={INK} strokeWidth="2" />
          <path d="M6 12h20M6 19h20" stroke="#e4572e" strokeWidth="2" />
        </svg>
        <div>
          <div className="brand-title">UML Class Diagram Generator</div>
          <div className="brand-sub">design visually · export Java</div>
        </div>
      </div>

      <div className="tb-group tb-add" role="group" aria-label="Add">
        <span className="tb-label">Add</span>
        {Object.entries(KINDS).map(([k, v]) => (
          <button key={k} className="btn" onClick={() => onAdd(k)} title={`Add ${v.label.toLowerCase()}`}>
            + {v.label}
          </button>
        ))}
      </div>

      <div className="tb-group tb-link" role="group" aria-label="Relationships">
        <span className="tb-label">Link</span>
        <button className={`btn ${tool === 'select' ? 'active' : ''}`} onClick={() => onTool('select')} title="Select / move (Esc)">
          Select
        </button>
        {Object.entries(REL_TYPES).map(([k, v]) => (
          <button
            key={k}
            className={`btn rel ${tool === k ? 'active' : ''}`}
            onClick={() => onTool(tool === k ? 'select' : k)}
            title={`${v.label}: ${v.hint}`}
          >
            <RelIcon type={k} />
            <span className="rel-name">{v.label}</span>
          </button>
        ))}
      </div>

      <div className="tb-group tb-view" role="group" aria-label="View">
        <button className="btn" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">Undo</button>
        <button className="btn" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">Redo</button>
        <button className="btn" onClick={onAutoLayout} title="Arrange classes in layers">Auto layout</button>
        <button className="btn" onClick={() => onZoom(1 / 1.2)} title="Zoom out" aria-label="Zoom out">−</button>
        <button className="btn" onClick={() => onZoom(1.2)} title="Zoom in" aria-label="Zoom in">+</button>
        <button className="btn" onClick={onFit} title="Fit diagram to screen">Fit</button>
      </div>

      <div className="tb-group tb-right" role="group" aria-label="File">
        <Menu label="File">
          <button onClick={onNew}>New empty diagram</button>
          <button onClick={onSample}>Load sample diagram</button>
          <hr />
          <button onClick={onImport}>Import diagram (.json)…</button>
          <button onClick={onExportJson}>Export diagram (.json)</button>
          <hr />
          <button onClick={onExportPng}>Export image (.png)</button>
          <button onClick={onExportSvg}>Export image (.svg)</button>
        </Menu>
        <button className="btn primary" onClick={onZip} title="Download all generated .java files as a zip">
          Download Java (.zip)
        </button>
      </div>
    </header>
  );
}
