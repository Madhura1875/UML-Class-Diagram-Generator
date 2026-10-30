import { KINDS, formatAttribute, formatMethod } from './model.js';

export const ROW_H = 20;
export const HEAD_H = 34;
export const HEAD_H_STEREO = 52;
export const COMP_PAD = 6;
export const MIN_W = 170;
export const MAX_W = 480;
const CHAR_W = 7.6; // monospace 12.5px

export function getNodeSize(cls) {
  const attrs = cls.attributes.map((a) => formatAttribute(a, cls.kind));
  const methods = cls.methods.map((m) => formatMethod(m));
  const headH = KINDS[cls.kind].stereotype ? HEAD_H_STEREO : HEAD_H;
  const comp = (n) => Math.max(n * ROW_H + COMP_PAD * 2, 20);
  const maxChars = Math.max(0, ...attrs.map((s) => s.length), ...methods.map((s) => s.length));
  const nameW = (cls.name || '').length * 9 + 36;
  const w = Math.round(Math.min(MAX_W, Math.max(MIN_W, maxChars * CHAR_W + 28, nameW)));
  const attrH = comp(attrs.length);
  const methodH = comp(methods.length);
  return { w, h: headH + attrH + methodH, headH, attrH, methodH, attrs, methods };
}

export function nodeRect(cls) {
  const { w, h } = getNodeSize(cls);
  return { x: cls.x, y: cls.y, w, h };
}

const unit = (v) => {
  const len = Math.hypot(v.x, v.y);
  return len ? { x: v.x / len, y: v.y / len } : { x: 1, y: 0 };
};

// Where a ray starting at q (inside rect) heading in direction d leaves the rect.
function rayExit(rect, q, d) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const qx = q.x - cx;
  const qy = q.y - cy;
  const tx = d.x > 0 ? (rect.w / 2 - qx) / d.x : d.x < 0 ? (-rect.w / 2 - qx) / d.x : Infinity;
  const ty = d.y > 0 ? (rect.h / 2 - qy) / d.y : d.y < 0 ? (-rect.h / 2 - qy) / d.y : Infinity;
  let t = Math.min(tx, ty);
  if (!Number.isFinite(t) || t < 0) t = 0;
  return { x: q.x + d.x * t, y: q.y + d.y * t };
}

function loopGeometry(rect, index) {
  const s = 36 + index * 18;
  const p0 = { x: rect.x + rect.w - 44, y: rect.y };
  const c1 = { x: p0.x, y: rect.y - s };
  const c2 = { x: rect.x + rect.w + s, y: rect.y - s };
  const c3 = { x: rect.x + rect.w + s, y: rect.y + 38 };
  const p1 = { x: rect.x + rect.w, y: rect.y + 38 };
  return {
    points: [p0, c1, c2, c3, p1],
    p0,
    p1,
    fStart: { x: 0, y: -1 },
    fEnd: { x: -1, y: 0 },
    mid: { x: (c1.x + c2.x) / 2, y: c1.y },
    loop: true,
  };
}

// Returns Map(relationId -> geometry) for every drawable relation.
export function computeEdgeGeometry(model) {
  const rects = new Map(model.classes.map((c) => [c.id, nodeRect(c)]));
  const groups = new Map();
  for (const r of model.relations) {
    const key = r.from === r.to ? `loop|${r.from}` : [r.from, r.to].sort().join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r.id);
  }
  const out = new Map();
  for (const r of model.relations) {
    const a = rects.get(r.from);
    const b = rects.get(r.to);
    if (!a || !b) continue;
    const key = r.from === r.to ? `loop|${r.from}` : [r.from, r.to].sort().join('|');
    const group = groups.get(key);
    const idx = group.indexOf(r.id);

    if (r.from === r.to) {
      out.set(r.id, loopGeometry(a, idx));
      continue;
    }

    const cA = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
    const cB = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    // consistent normal for the pair, so A->B and B->A fan out on opposite sides
    const [lowId] = [r.from, r.to].sort();
    const lowC = lowId === r.from ? cA : cB;
    const highC = lowId === r.from ? cB : cA;
    const dirC = unit({ x: highC.x - lowC.x, y: highC.y - lowC.y });
    const normal = { x: -dirC.y, y: dirC.x };
    const offset = (idx - (group.length - 1) / 2) * 24;
    const A = { x: cA.x + normal.x * offset, y: cA.y + normal.y * offset };
    const B = { x: cB.x + normal.x * offset, y: cB.y + normal.y * offset };
    const f = unit({ x: B.x - A.x, y: B.y - A.y });
    const p0 = rayExit(a, A, f);
    const p1 = rayExit(b, B, { x: -f.x, y: -f.y });
    const fe = unit({ x: p1.x - p0.x, y: p1.y - p0.y });
    out.set(r.id, {
      points: [p0, p1],
      p0,
      p1,
      fStart: fe,
      fEnd: fe,
      mid: { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 },
      loop: false,
    });
  }
  return out;
}

export function getBounds(model) {
  if (!model.classes.length) return { minX: 0, minY: 0, maxX: 400, maxY: 300 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of model.classes) {
    const r = nodeRect(c);
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  if (model.relations.some((r) => r.from === r.to)) {
    maxX += 60;
    minY -= 60;
  }
  return { minX, minY, maxX, maxY };
}
