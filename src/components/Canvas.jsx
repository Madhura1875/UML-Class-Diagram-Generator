import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import ClassNode from './ClassNode.jsx';
import EdgeShape from './EdgeShape.jsx';
import { computeEdgeGeometry, getBounds, nodeRect } from '../utils/geometry.js';
import { REL_TYPES } from '../utils/model.js';
import { ACCENT, FONT_SANS, PAPER_LIGHT } from '../utils/theme.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const snap = (v) => Math.round(v / 10) * 10;

const Canvas = forwardRef(function Canvas(props, ref) {
  const { model, selection, tool, onSelect, onDragStart, onMoveNode, onConnect, onToolChange, onCreateAt } = props;

  const svgRef = useRef(null);
  const worldRef = useRef(null);
  const dragRef = useRef(null);
  const [vp, setVp] = useState({ x: 40, y: 40, k: 1 });
  const vpRef = useRef(vp);
  vpRef.current = vp;
  const modelRef = useRef(model);
  modelRef.current = model;
  const [pending, setPending] = useState(null); // source class id while drawing a relation
  const [mouse, setMouse] = useState(null);

  const geoms = useMemo(() => computeEdgeGeometry(model), [model]);

  const box = () => svgRef.current.getBoundingClientRect();
  const toWorld = (e) => {
    const r = box();
    const v = vpRef.current;
    return { x: (e.clientX - r.left - v.x) / v.k, y: (e.clientY - r.top - v.y) / v.k };
  };

  const fit = useCallback(() => {
    const m = modelRef.current;
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    if (!m.classes.length) {
      setVp({ x: 40, y: 40, k: 1 });
      return;
    }
    const b = getBounds(m);
    const bw = b.maxX - b.minX;
    const bh = b.maxY - b.minY;
    const k = clamp(Math.min((r.width - 70) / bw, (r.height - 70) / bh, 1.2), 0.2, 2.5);
    setVp({ k, x: (r.width - bw * k) / 2 - b.minX * k, y: (r.height - bh * k) / 2 - b.minY * k });
  }, []);

  const zoomAt = useCallback((px, py, factor) => {
    setVp((v) => {
      const k = clamp(v.k * factor, 0.2, 2.5);
      const wx = (px - v.x) / v.k;
      const wy = (py - v.y) / v.k;
      return { k, x: px - wx * k, y: py - wy * k };
    });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      fit,
      zoomBy(factor) {
        const r = box();
        zoomAt(r.width / 2, r.height / 2, factor);
      },
      getViewCenter() {
        const r = box();
        const v = vpRef.current;
        return { x: (r.width / 2 - v.x) / v.k, y: (r.height / 2 - v.y) / v.k };
      },
      getExportSvg() {
        const m = modelRef.current;
        if (!m.classes.length) return null;
        const clone = worldRef.current.cloneNode(true);
        clone.removeAttribute('transform');
        clone.querySelectorAll('[data-export-hide]').forEach((n) => n.remove());
        const b = getBounds(m);
        const pad = 40;
        const x = b.minX - pad;
        const y = b.minY - pad;
        const width = Math.ceil(b.maxX - b.minX + pad * 2);
        const height = Math.ceil(b.maxY - b.minY + pad * 2);
        const inner = new XMLSerializer().serializeToString(clone);
        const svg =
          `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}">` +
          `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${PAPER_LIGHT}"/>` +
          inner +
          `</svg>`;
        return { svg, width, height };
      },
    }),
    [fit, zoomAt]
  );

  // fit once on mount
  useLayoutEffect(() => {
    fit();
  }, [fit]);

  // wheel: ctrl/cmd (or pinch) = zoom, plain wheel = pan
  useEffect(() => {
    const el = svgRef.current;
    const onWheel = (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.004));
      } else {
        setVp((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  useEffect(() => {
    if (tool === 'select') setPending(null);
  }, [tool]);

  // ---------------------------------------------------------------- handlers
  const onNodeDown = (e, cls) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    if (tool !== 'select') {
      if (!pending) {
        setPending(cls.id);
        setMouse(toWorld(e));
      } else {
        onConnect(tool, pending, cls.id);
        setPending(null);
        onToolChange('select');
      }
      return;
    }
    onSelect({ type: 'class', id: cls.id });
    const w = toWorld(e);
    dragRef.current = { mode: 'node', id: cls.id, dx: w.x - cls.x, dy: w.y - cls.y, moved: false, sx: e.clientX, sy: e.clientY };
    svgRef.current.setPointerCapture(e.pointerId);
  };

  const onEdgeDown = (e, rel) => {
    e.stopPropagation();
    if (e.button !== 0 || tool !== 'select') return;
    onSelect({ type: 'relation', id: rel.id });
  };

  const onBgDown = (e) => {
    if (e.button !== 0 && e.button !== 1) return;
    if (tool !== 'select') {
      setPending(null);
      return;
    }
    const v = vpRef.current;
    dragRef.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, ox: v.x, oy: v.y, moved: false };
    svgRef.current.setPointerCapture(e.pointerId);
  };

  const onMove = (e) => {
    if (pending) setMouse(toWorld(e));
    const d = dragRef.current;
    if (!d) return;
    if (d.mode === 'pan') {
      const dx = e.clientX - d.sx;
      const dy = e.clientY - d.sy;
      if (!d.moved && Math.hypot(dx, dy) > 3) d.moved = true;
      if (d.moved) setVp((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
    } else if (d.mode === 'node') {
      if (!d.moved) {
        if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 3) return;
        d.moved = true;
        onDragStart();
      }
      const w = toWorld(e);
      let x = w.x - d.dx;
      let y = w.y - d.dy;
      if (!e.altKey) {
        x = snap(x);
        y = snap(y);
      }
      onMoveNode(d.id, x, y);
    }
  };

  const onUp = (e) => {
    const d = dragRef.current;
    if (d && d.mode === 'pan' && !d.moved) onSelect(null);
    dragRef.current = null;
    try {
      svgRef.current.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
  };

  const onDouble = (e) => {
    if (tool !== 'select') return;
    const w = toWorld(e);
    const hit = modelRef.current.classes.some((c) => {
      const r = nodeRect(c);
      return w.x >= r.x && w.x <= r.x + r.w && w.y >= r.y && w.y <= r.y + r.h;
    });
    if (!hit) onCreateAt(w.x, w.y);
  };

  // ------------------------------------------------------------------ render
  const pendingCls = pending ? model.classes.find((c) => c.id === pending) : null;
  const pendingRect = pendingCls ? nodeRect(pendingCls) : null;

  let hint = null;
  if (tool !== 'select') {
    hint = pending
      ? `${REL_TYPES[tool].label}: now click the target class (Esc to cancel)`
      : `${REL_TYPES[tool].label}: click the source class first (Esc to cancel)`;
  }

  return (
    <div
      className="canvas-wrap"
      style={{
        backgroundSize: `${24 * vp.k}px ${24 * vp.k}px`,
        backgroundPosition: `${vp.x}px ${vp.y}px`,
        cursor: tool === 'select' ? 'default' : 'crosshair',
      }}
    >
      <svg
        ref={svgRef}
        className="canvas-svg"
        onPointerDown={onBgDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={onDouble}
      >
        <g ref={worldRef} transform={`translate(${vp.x} ${vp.y}) scale(${vp.k})`} fontFamily={FONT_SANS}>
          {model.relations.map((r) => {
            const g = geoms.get(r.id);
            if (!g) return null;
            return (
              <EdgeShape
                key={r.id}
                rel={r}
                geom={g}
                selected={selection?.type === 'relation' && selection.id === r.id}
                onPointerDown={onEdgeDown}
              />
            );
          })}
          {model.classes.map((c) => (
            <ClassNode
              key={c.id}
              cls={c}
              selected={selection?.type === 'class' && selection.id === c.id}
              pending={pending === c.id}
              onPointerDown={onNodeDown}
            />
          ))}
          {pendingRect && mouse && (
            <line
              data-export-hide="true"
              x1={pendingRect.x + pendingRect.w / 2}
              y1={pendingRect.y + pendingRect.h / 2}
              x2={mouse.x}
              y2={mouse.y}
              stroke={ACCENT}
              strokeWidth="2"
              strokeDasharray="6 5"
              pointerEvents="none"
            />
          )}
        </g>
      </svg>

      {!model.classes.length && (
        <div className="empty-state">
          <strong>Empty diagram</strong>
          <span>Double-click the canvas or use the Add buttons to create your first class.</span>
        </div>
      )}
      {hint && <div className="canvas-hint">{hint}</div>}
      <div className="canvas-corner">
        <span>{Math.round(vp.k * 100)}%</span>
        <span className="canvas-tip">Drag background = pan · Ctrl + wheel = zoom · Double-click = new class</span>
      </div>
    </div>
  );
});

export default Canvas;
