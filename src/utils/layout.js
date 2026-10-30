import { getNodeSize } from './geometry.js';

const H_GAP = 70;
const V_GAP = 100;
const MAX_ROW_WIDTH = 1500;
const MARGIN = 60;

// Layered auto layout: parents / owners on top, children / owned things below.
export function autoLayout(model) {
  if (!model.classes.length) return model;
  const ids = model.classes.map((c) => c.id);
  const idSet = new Set(ids);

  // "above -> below" edges
  const down = new Map(ids.map((id) => [id, []]));
  for (const r of model.relations) {
    if (r.from === r.to || !idSet.has(r.from) || !idSet.has(r.to)) continue;
    const parentFirst = r.type === 'inheritance' || r.type === 'realization';
    const [above, below] = parentFirst ? [r.to, r.from] : [r.from, r.to];
    down.get(above).push(below);
  }

  // drop back edges so cycles can't produce infinite depth
  const state = new Map();
  const dag = new Map(ids.map((id) => [id, []]));
  const visit = (u) => {
    state.set(u, 1);
    for (const v of down.get(u)) {
      const s = state.get(v);
      if (s === 1) continue;
      dag.get(u).push(v);
      if (!s) visit(v);
    }
    state.set(u, 2);
  };
  ids.forEach((id) => {
    if (!state.get(id)) visit(id);
  });

  const preds = new Map(ids.map((id) => [id, []]));
  for (const [u, vs] of dag) for (const v of vs) preds.get(v).push(u);

  const levelMemo = new Map();
  const levelOf = (v) => {
    if (levelMemo.has(v)) return levelMemo.get(v);
    const ps = preds.get(v);
    const lvl = ps.length ? 1 + Math.max(...ps.map(levelOf)) : 0;
    levelMemo.set(v, lvl);
    return lvl;
  };

  const byLevel = new Map();
  for (const c of model.classes) {
    const l = levelOf(c.id);
    if (!byLevel.has(l)) byLevel.set(l, []);
    byLevel.get(l).push(c);
  }

  const sizes = new Map(model.classes.map((c) => [c.id, getNodeSize(c)]));
  const pos = new Map();
  let y = MARGIN;

  for (const level of [...byLevel.keys()].sort((a, b) => a - b)) {
    const row = byLevel.get(level);
    // order by the average x of already-placed parents to reduce crossings
    const key = (c) => {
      const xs = preds.get(c.id).filter((p) => pos.has(p)).map((p) => pos.get(p).x + sizes.get(p).w / 2);
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Infinity;
    };
    const indexed = row.map((c, i) => ({ c, i, k: key(c) }));
    indexed.sort((a, b) => (a.k === b.k ? a.i - b.i : a.k - b.k));

    // wrap very wide levels into several lines
    const lines = [[]];
    let width = 0;
    for (const { c } of indexed) {
      const w = sizes.get(c.id).w;
      if (width + w > MAX_ROW_WIDTH && lines[lines.length - 1].length) {
        lines.push([]);
        width = 0;
      }
      lines[lines.length - 1].push(c);
      width += w + H_GAP;
    }
    const lineWidths = lines.map((ln) => ln.reduce((s, c) => s + sizes.get(c.id).w, 0) + H_GAP * (ln.length - 1));
    const widest = Math.max(...lineWidths);

    lines.forEach((ln, li) => {
      let x = MARGIN + (widest - lineWidths[li]) / 2;
      let rowH = 0;
      for (const c of ln) {
        pos.set(c.id, { x: Math.round(x / 10) * 10, y: Math.round(y / 10) * 10 });
        x += sizes.get(c.id).w + H_GAP;
        rowH = Math.max(rowH, sizes.get(c.id).h);
      }
      y += rowH + V_GAP;
    });
  }

  return { ...model, classes: model.classes.map((c) => ({ ...c, ...pos.get(c.id) })) };
}
