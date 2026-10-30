import { javaVisibility } from './model.js';

// ---------------------------------------------------------------------------
// UML -> Java source generator
//
//  * class / abstract class / interface / enum  -> one .java file each
//  * inheritance + realization                  -> extends / implements
//  * association / aggregation / composition    -> field (List<T> when multiplicity > 1)
//  * dependency                                 -> comment
//  * abstract methods of ancestors that a concrete class does not implement
//    are generated as @Override stubs, so the output compiles
// ---------------------------------------------------------------------------

const INDENT = '    ';

const JAVA_KEYWORDS = new Set(
  ('abstract assert boolean break byte case catch char class const continue default do double else enum ' +
    'extends final finally float for goto if implements import instanceof int interface long native new ' +
    'package private protected public return short static strictfp super switch synchronized this throw ' +
    'throws transient try void volatile while true false null var record yield sealed permits').split(' ')
);

export const isValidIdentifier = (s) =>
  /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s || '') && !JAVA_KEYWORDS.has(s);

export function sanitizeIdent(s, fallback = 'unnamed') {
  let t = String(s ?? '').trim().replace(/[^A-Za-z0-9_$]/g, '_');
  if (!t) t = fallback;
  if (/^[0-9]/.test(t)) t = `_${t}`;
  if (JAVA_KEYWORDS.has(t)) t = `${t}_`;
  return t;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const decap = (s) => s.charAt(0).toLowerCase() + s.slice(1);

const PRIMITIVE_DEFAULTS = {
  int: '0', long: '0L', short: '0', byte: '0', double: '0.0', float: '0.0f', boolean: 'false', char: "'\\0'",
};

export function defaultValueFor(type) {
  const t = String(type || '').trim();
  return Object.prototype.hasOwnProperty.call(PRIMITIVE_DEFAULTS, t) ? PRIMITIVE_DEFAULTS[t] : 'null';
}

const AUTO_IMPORTS = {
  List: 'java.util.List',
  ArrayList: 'java.util.ArrayList',
  LinkedList: 'java.util.LinkedList',
  Map: 'java.util.Map',
  HashMap: 'java.util.HashMap',
  Set: 'java.util.Set',
  HashSet: 'java.util.HashSet',
  Collection: 'java.util.Collection',
  Queue: 'java.util.Queue',
  Deque: 'java.util.Deque',
  Optional: 'java.util.Optional',
  Date: 'java.util.Date',
  UUID: 'java.util.UUID',
  LocalDate: 'java.time.LocalDate',
  LocalTime: 'java.time.LocalTime',
  LocalDateTime: 'java.time.LocalDateTime',
  BigDecimal: 'java.math.BigDecimal',
};

// ----------------------------- parameter helpers ---------------------------

function splitTopLevel(str) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of String(str || '')) {
    if (ch === '<' || ch === '(') depth += 1;
    else if (ch === '>' || ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

// "int a, List<String> names"  or UML style "a: int"  ->  [{type, name}]
function parseParams(str) {
  return splitTopLevel(str).map((p, i) => {
    const fallback = `arg${i + 1}`;
    if (p.includes(':')) {
      const [n, t] = p.split(':');
      return { type: t.trim() || 'Object', name: sanitizeIdent(n.trim(), fallback) };
    }
    const m = p.match(/^(.*\S)\s+(\S+)$/);
    return m ? { type: m[1].trim(), name: sanitizeIdent(m[2], fallback) } : { type: p, name: fallback };
  });
}

const paramString = (str) => parseParams(str).map((p) => `${p.type} ${p.name}`).join(', ');
const sigOf = (m) =>
  `${sanitizeIdent(m.name, 'method')}(${parseParams(m.params).map((p) => p.type.replace(/\s+/g, '')).join(',')})`;

const isVoid = (t) => !t || String(t).trim() === '' || String(t).trim() === 'void';

// ----------------------------- graph helpers ------------------------------

const mapById = (model) => new Map(model.classes.map((c) => [c.id, c]));

function parentsOf(model, map, cls) {
  const seen = new Set();
  const res = [];
  for (const r of model.relations) {
    if ((r.type === 'inheritance' || r.type === 'realization') && r.from === cls.id && r.to !== cls.id && !seen.has(r.to)) {
      const p = map.get(r.to);
      if (p) {
        seen.add(r.to);
        res.push(p);
      }
    }
  }
  return res;
}

function heritage(model, map, cls) {
  const parents = parentsOf(model, map, cls);
  const interfaces = parents.filter((p) => p.kind === 'interface');
  if (cls.kind === 'interface') return { superClass: null, interfaces };
  const superClass =
    cls.kind === 'enum' ? null : parents.find((p) => p.kind === 'class' || p.kind === 'abstract') || null;
  return { superClass, interfaces };
}

function ancestorMethods(model, map, cls) {
  const result = [];
  const visited = new Set([cls.id]);
  const walk = (c) => {
    const { superClass, interfaces } = heritage(model, map, c);
    for (const p of [superClass, ...interfaces]) {
      if (!p || visited.has(p.id)) continue;
      visited.add(p.id);
      for (const m of p.methods) {
        if (m.isStatic) continue;
        result.push({
          m,
          owner: p,
          sig: sigOf(m),
          fromInterface: p.kind === 'interface',
          abstract: p.kind === 'interface' || (p.kind === 'abstract' && m.isAbstract),
        });
      }
      walk(p);
    }
  };
  walk(cls);
  return result;
}

function collectCtorParams(model, map, cls, names, visited = new Set()) {
  if (visited.has(cls.id)) return [];
  visited.add(cls.id);
  const { superClass } = heritage(model, map, cls);
  const inherited = superClass ? collectCtorParams(model, map, superClass, names, visited) : [];
  const used = new Set(inherited.map((p) => p.name));
  const own = [];
  for (const a of cls.attributes) {
    if (a.isStatic) continue;
    let name = sanitizeIdent(a.name, 'field');
    let n = name;
    let i = 2;
    while (used.has(n)) n = `${name}${i++}`;
    used.add(n);
    own.push({ type: (a.type || 'Object').trim() || 'Object', name: n, field: sanitizeIdent(a.name, 'field') });
  }
  return [...inherited.map((p) => ({ ...p, inherited: true })), ...own];
}

const isMany = (m) => {
  if (!m) return false;
  const t = String(m).trim();
  if (t.includes('*')) return true;
  const upper = parseInt(t.split('..').pop(), 10);
  return Number.isFinite(upper) && upper > 1;
};

// ----------------------------- class generation ---------------------------

function uniqueNames(model) {
  const used = new Set();
  const names = new Map();
  for (const c of model.classes) {
    const base = sanitizeIdent(c.name, 'Unnamed');
    let n = base;
    let i = 2;
    while (used.has(n)) n = `${base}${i++}`;
    used.add(n);
    names.set(c.id, n);
  }
  return names;
}

function relationFields(model, map, cls, names, taken) {
  const fields = [];
  for (const r of model.relations) {
    if (r.from !== cls.id) continue;
    if (!['association', 'aggregation', 'composition'].includes(r.type)) continue;
    const target = map.get(r.to);
    if (!target) continue;
    const targetName = names.get(target.id);
    const many = isMany(r.toMult);
    let base = sanitizeIdent(r.toRole && r.toRole.trim() ? r.toRole.trim() : decap(targetName) + (many ? (/s$/.test(targetName) ? 'List' : 's') : ''), 'ref');
    let name = base;
    let i = 2;
    while (taken.has(name)) name = `${base}${i++}`;
    taken.add(name);
    fields.push({
      name,
      many,
      kind: r.type,
      type: many ? `List<${targetName}>` : targetName,
      init: many ? 'new ArrayList<>()' : '',
      comment: `${r.type}: ${names.get(cls.id)} -> ${targetName}${r.toMult ? ` (${r.toMult})` : ''}`,
    });
  }
  return fields;
}

function generateClass(model, map, cls, names, opts) {
  const kind = cls.kind;
  const className = names.get(cls.id);
  const { superClass, interfaces } = heritage(model, map, cls);
  const nm = (c) => names.get(c.id);

  // ---------- header ----------
  const keyword = { class: 'class', abstract: 'abstract class', interface: 'interface', enum: 'enum' }[kind];
  let header = `public ${keyword} ${className}`;
  if (kind === 'interface') {
    if (interfaces.length) header += ` extends ${interfaces.map(nm).join(', ')}`;
  } else {
    if (superClass) header += ` extends ${nm(superClass)}`;
    if (interfaces.length) header += ` implements ${interfaces.map(nm).join(', ')}`;
  }

  const sections = [];
  const taken = new Set();
  const uniq = (base) => {
    let n = base;
    let i = 2;
    while (taken.has(n)) n = `${base}${i++}`;
    taken.add(n);
    return n;
  };

  // ---------- dependency comment ----------
  const deps = [
    ...new Set(
      model.relations
        .filter((r) => r.type === 'dependency' && r.from === cls.id && map.get(r.to))
        .map((r) => nm(map.get(r.to)))
    ),
  ];
  if (deps.length) sections.push([`// Depends on: ${deps.join(', ')}`]);

  // ---------- enum constants ----------
  if (kind === 'enum') {
    const consts = cls.attributes.map((a) => uniq(sanitizeIdent(a.name, 'VALUE')));
    if (consts.length) sections.push(consts.map((c, i) => (i === consts.length - 1 ? `${c};` : `${c},`)));
  }

  // ---------- fields ----------
  const accessorFields = [];
  if (kind === 'class' || kind === 'abstract') {
    const lines = [];
    for (const a of cls.attributes) {
      const name = uniq(sanitizeIdent(a.name, 'field'));
      const type = (a.type || 'Object').trim() || 'Object';
      const dv = (a.defaultValue || '').trim();
      const mods = [javaVisibility(a.visibility), a.isStatic ? 'static' : ''].filter(Boolean).join(' ');
      lines.push(`${mods ? mods + ' ' : ''}${type} ${name}${dv ? ` = ${dv}` : ''};`);
      if (!a.isStatic) accessorFields.push({ name, type });
    }
    for (const f of relationFields(model, map, cls, names, taken)) {
      lines.push(`// ${f.comment}`);
      lines.push(`private ${f.type} ${f.name}${f.init ? ` = ${f.init}` : ''};`);
      accessorFields.push({ name: f.name, type: f.type });
    }
    if (lines.length) sections.push(lines);
  } else if (kind === 'interface') {
    const lines = cls.attributes.map((a) => {
      const name = uniq(sanitizeIdent(a.name, 'CONSTANT'));
      const type = (a.type || 'Object').trim() || 'Object';
      const dv = (a.defaultValue || '').trim() || defaultValueFor(type);
      return `${type} ${name} = ${dv};`;
    });
    if (lines.length) sections.push(lines);
  }

  // ---------- constructor ----------
  if ((kind === 'class' || kind === 'abstract') && opts.constructors) {
    const params = collectCtorParams(model, map, cls, names);
    if (params.length) {
      const body = [];
      const superArgs = params.filter((p) => p.inherited).map((p) => p.name);
      if (superArgs.length) body.push(`super(${superArgs.join(', ')});`);
      for (const p of params.filter((x) => !x.inherited)) body.push(`this.${p.field} = ${p.name};`);
      sections.push([
        `public ${className}(${params.map((p) => `${p.type} ${p.name}`).join(', ')}) {`,
        ...body.map((l) => INDENT + l),
        '}',
      ]);
    }
  }

  // ---------- accessors ----------
  const ownNames = new Set(cls.methods.map((m) => sanitizeIdent(m.name, 'method')));
  const accessorSigs = new Set();
  if (opts.accessors && (kind === 'class' || kind === 'abstract')) {
    const lines = [];
    for (const f of accessorFields) {
      const base = cap(f.name);
      const getter = (f.type === 'boolean' ? 'is' : 'get') + base;
      const setter = `set${base}`;
      if (!ownNames.has(getter)) {
        if (lines.length) lines.push('');
        lines.push(`public ${f.type} ${getter}() {`, `${INDENT}return ${f.name};`, '}');
        accessorSigs.add(`${getter}()`);
      }
      if (!ownNames.has(setter)) {
        if (lines.length) lines.push('');
        lines.push(`public void ${setter}(${f.type} ${f.name}) {`, `${INDENT}this.${f.name} = ${f.name};`, '}');
        accessorSigs.add(`${setter}(${f.type.replace(/\s+/g, '')})`);
      }
    }
    if (lines.length) sections.push(lines);
  }

  // ---------- declared methods ----------
  const ancestors = ancestorMethods(model, map, cls);
  const ancestorBySig = new Map();
  for (const a of ancestors) if (!ancestorBySig.has(a.sig)) ancestorBySig.set(a.sig, a);

  const emitBody = (ret) => [
    `${INDENT}// TODO: implement`,
    ...(isVoid(ret) ? [] : [`${INDENT}return ${defaultValueFor(ret)};`]),
  ];

  for (const m of cls.methods) {
    const name = sanitizeIdent(m.name, 'method');
    const ret = (m.returnType || 'void').trim() || 'void';
    const params = paramString(m.params);
    const sig = sigOf(m);
    const lines = [];

    if (kind === 'interface') {
      if (m.isStatic) {
        lines.push(`static ${ret} ${name}(${params}) {`, ...emitBody(ret), '}');
      } else {
        lines.push(`${ret} ${name}(${params});`);
      }
    } else {
      const match = !m.isStatic ? ancestorBySig.get(sig) : null;
      const isAbstract = kind === 'abstract' && m.isAbstract && !m.isStatic;
      let vis = javaVisibility(m.visibility);
      if (match && match.fromInterface) vis = 'public';
      const mods = [vis, isAbstract ? 'abstract' : '', m.isStatic ? 'static' : ''].filter(Boolean).join(' ');
      const head = `${mods ? mods + ' ' : ''}${ret} ${name}(${params})`;
      if (isAbstract) {
        lines.push(`${head};`);
      } else {
        if (match) lines.push('@Override');
        lines.push(`${head} {`, ...emitBody(ret), '}');
      }
    }
    sections.push(lines);
  }

  // ---------- stubs for inherited abstract methods ----------
  if (kind === 'class' || kind === 'enum') {
    const implemented = new Set([
      ...cls.methods.map(sigOf),
      ...accessorSigs,
      ...ancestors.filter((a) => !a.abstract).map((a) => a.sig),
    ]);
    const done = new Set();
    for (const a of ancestors) {
      if (!a.abstract || implemented.has(a.sig) || done.has(a.sig)) continue;
      done.add(a.sig);
      const ret = (a.m.returnType || 'void').trim() || 'void';
      sections.push([
        '@Override',
        `public ${ret} ${sanitizeIdent(a.m.name, 'method')}(${paramString(a.m.params)}) {`,
        ...emitBody(ret),
        '}',
      ]);
    }
  }

  // ---------- assemble ----------
  const body = [];
  for (const s of sections) {
    if (!s.length) continue;
    if (body.length) body.push('');
    body.push(...s);
  }
  const classLines = [`${header} {`, ...body.map((l) => (l ? INDENT + l : l)), '}'];
  const text = classLines.join('\n');

  // imports
  const modelNames = new Set(names.values());
  const imports = Object.keys(AUTO_IMPORTS)
    .filter((k) => !modelNames.has(k) && new RegExp(`\\b${k}\\b`).test(text))
    .map((k) => AUTO_IMPORTS[k])
    .sort();

  const head = [];
  const pkg = (opts.packageName || '').trim();
  if (pkg) head.push(`package ${pkg};`, '');
  if (imports.length) head.push(...imports.map((i) => `import ${i};`), '');
  return head.join('\n') + (head.length ? '\n' : '') + text + '\n';
}

export function generateJava(model, options = {}) {
  const opts = { packageName: '', constructors: true, accessors: true, ...options };
  if (opts.packageName && !/^[A-Za-z_][\w]*(\.[A-Za-z_][\w]*)*$/.test(opts.packageName.trim())) opts.packageName = '';
  const map = mapById(model);
  const names = uniqueNames(model);
  return model.classes.map((cls) => {
    const className = names.get(cls.id);
    let content;
    try {
      content = generateClass(model, map, cls, names, opts);
    } catch (err) {
      content = `// Could not generate ${className}: ${err.message}\n`;
    }
    return { classId: cls.id, className, fileName: `${className}.java`, content };
  });
}

// ----------------------------- validation ---------------------------------

export function validateModel(model) {
  const issues = [];
  const map = mapById(model);
  const counts = new Map();
  for (const c of model.classes) counts.set(c.name, (counts.get(c.name) || 0) + 1);
  const reportedDup = new Set();

  for (const c of model.classes) {
    const label = c.name || '(unnamed)';
    if (!isValidIdentifier(c.name)) {
      issues.push({ level: 'error', classId: c.id, message: `"${label}" is not a valid Java class name.` });
    }
    if (counts.get(c.name) > 1 && !reportedDup.has(c.name)) {
      reportedDup.add(c.name);
      issues.push({ level: 'error', classId: c.id, message: `More than one class is named "${label}".` });
    }
    for (const a of c.attributes) {
      if (c.kind === 'enum' ? !isValidIdentifier(a.name) : !isValidIdentifier(a.name)) {
        issues.push({
          level: 'warning', classId: c.id,
          message: `${label}: "${a.name}" is not a valid Java name (will be exported as ${sanitizeIdent(a.name)}).`,
        });
      }
    }
    for (const m of c.methods) {
      if (!isValidIdentifier(m.name)) {
        issues.push({
          level: 'warning', classId: c.id,
          message: `${label}: method "${m.name}" is not a valid Java name (will be exported as ${sanitizeIdent(m.name, 'method')}).`,
        });
      }
    }
    if (c.kind === 'class' && c.methods.some((m) => m.isAbstract && !m.isStatic)) {
      issues.push({
        level: 'warning', classId: c.id,
        message: `${label} has abstract methods - change its kind to "Abstract class". They are generated with a body for now.`,
      });
    }

    const parents = parentsOf(model, map, c);
    const classParents = parents.filter((p) => p.kind === 'class' || p.kind === 'abstract');
    if (parents.some((p) => p.kind === 'enum')) {
      issues.push({ level: 'error', classId: c.id, message: `${label} cannot extend or implement an enum.` });
    }
    if (c.kind === 'interface' && parents.some((p) => p.kind !== 'interface')) {
      issues.push({ level: 'error', classId: c.id, message: `Interface ${label} can only extend other interfaces.` });
    }
    if (c.kind === 'enum' && classParents.length) {
      issues.push({ level: 'error', classId: c.id, message: `Enum ${label} cannot extend a class.` });
    }
    if ((c.kind === 'class' || c.kind === 'abstract') && classParents.length > 1) {
      issues.push({
        level: 'error', classId: c.id,
        message: `${label} extends ${classParents.length} classes. Java has single inheritance - only "${classParents[0].name}" is used.`,
      });
    }
    if ((c.kind === 'interface' || c.kind === 'enum') &&
        model.relations.some((r) => r.from === c.id && ['association', 'aggregation', 'composition'].includes(r.type))) {
      issues.push({
        level: 'warning', classId: c.id,
        message: `${label}: ${c.kind === 'interface' ? 'interfaces' : 'enums'} do not get fields from relationships.`,
      });
    }
  }

  for (const r of model.relations) {
    if (r.from === r.to && (r.type === 'inheritance' || r.type === 'realization')) {
      issues.push({ level: 'error', classId: r.from, message: `${map.get(r.from)?.name} cannot inherit from itself.` });
    }
  }

  // inheritance cycles
  const state = new Map();
  const reported = new Set();
  const dfs = (c) => {
    state.set(c.id, 1);
    for (const p of parentsOf(model, map, c)) {
      if (state.get(p.id) === 1 && !reported.has(p.id)) {
        reported.add(p.id);
        issues.push({ level: 'error', classId: p.id, message: `Inheritance cycle involving ${p.name} and ${c.name}.` });
      } else if (!state.get(p.id)) dfs(p);
    }
    state.set(c.id, 2);
  };
  model.classes.forEach((c) => {
    if (!state.get(c.id)) dfs(c);
  });

  return issues;
}
