// ---------------------------------------------------------------------------
// Diagram data model
//
// {
//   classes:   [{ id, name, kind, x, y, attributes: [...], methods: [...] }],
//   relations: [{ id, type, from, to, label, fromMult, toMult, toRole }]
// }
//
// Relations are directed `from -> to`:
//   inheritance / realization : from (child)  extends / implements  to (parent)
//   association / aggregation / composition : from (owner) holds a field of type `to`
//   dependency : from uses to
// ---------------------------------------------------------------------------

export const uid = () => Math.random().toString(36).slice(2, 9);

export const KINDS = {
  class: { label: 'Class', stereotype: null, defaultName: 'NewClass' },
  abstract: { label: 'Abstract class', stereotype: 'abstract', defaultName: 'NewAbstractClass' },
  interface: { label: 'Interface', stereotype: 'interface', defaultName: 'NewInterface' },
  enum: { label: 'Enum', stereotype: 'enumeration', defaultName: 'NewEnum' },
};

export const REL_TYPES = {
  inheritance: { label: 'Inheritance', hint: 'child extends parent' },
  realization: { label: 'Realization', hint: 'class implements interface' },
  association: { label: 'Association', hint: 'source gets a field of the target type' },
  aggregation: { label: 'Aggregation', hint: 'source (whole) holds target (part) - shared lifetime' },
  composition: { label: 'Composition', hint: 'source (whole) owns target (part) - same lifetime' },
  dependency: { label: 'Dependency', hint: 'source uses target (noted as a comment)' },
};

export const VISIBILITIES = [
  { value: '+', java: 'public', label: '+ public' },
  { value: '-', java: 'private', label: '- private' },
  { value: '#', java: 'protected', label: '# protected' },
  { value: '~', java: '', label: '~ package' },
];

export const javaVisibility = (v) => {
  const found = VISIBILITIES.find((x) => x.value === v);
  return found ? found.java : 'public';
};

export function uniqueName(existing, base) {
  const set = new Set(existing);
  if (!set.has(base)) return base;
  let i = 2;
  while (set.has(base + i)) i += 1;
  return base + i;
}

export function newAttribute(cls) {
  const names = cls.attributes.map((a) => a.name);
  if (cls.kind === 'enum') {
    return { id: uid(), visibility: '+', name: uniqueName(names, 'CONSTANT'), type: '', isStatic: false, defaultValue: '' };
  }
  return {
    id: uid(),
    visibility: cls.kind === 'interface' ? '+' : '-',
    name: uniqueName(names, 'field'),
    type: 'String',
    isStatic: false,
    defaultValue: '',
  };
}

export function newMethod(cls) {
  const names = cls.methods.map((m) => m.name);
  return {
    id: uid(),
    visibility: '+',
    name: uniqueName(names, 'doSomething'),
    returnType: 'void',
    params: '',
    isStatic: false,
    isAbstract: false,
  };
}

export function createClass(id, kind, name, x, y) {
  return { id, name, kind, x, y, attributes: [], methods: [] };
}

export function formatAttribute(a, kind) {
  if (kind === 'enum') return a.name;
  const def = a.defaultValue ? ` = ${a.defaultValue}` : '';
  return `${a.visibility} ${a.name}: ${a.type || 'Object'}${def}`;
}

export function formatMethod(m) {
  return `${m.visibility} ${m.name}(${m.params || ''}): ${m.returnType || 'void'}`;
}

export const emptyModel = () => ({ classes: [], relations: [] });

// Make sure imported / stored data has every field the editor expects.
export function normalizeModel(raw) {
  if (!raw || !Array.isArray(raw.classes)) throw new Error('Not a valid diagram file (missing "classes").');
  const classes = raw.classes.map((c, i) => {
    const kind = KINDS[c.kind] ? c.kind : 'class';
    return {
      id: String(c.id || uid()),
      name: String(c.name ?? `Class${i + 1}`),
      kind,
      x: Number.isFinite(c.x) ? c.x : 40 + i * 40,
      y: Number.isFinite(c.y) ? c.y : 40 + i * 40,
      attributes: (Array.isArray(c.attributes) ? c.attributes : []).map((a) => ({
        id: String(a.id || uid()),
        visibility: ['+', '-', '#', '~'].includes(a.visibility) ? a.visibility : '-',
        name: String(a.name ?? ''),
        type: String(a.type ?? ''),
        isStatic: !!a.isStatic,
        defaultValue: String(a.defaultValue ?? ''),
      })),
      methods: (Array.isArray(c.methods) ? c.methods : []).map((m) => ({
        id: String(m.id || uid()),
        visibility: ['+', '-', '#', '~'].includes(m.visibility) ? m.visibility : '+',
        name: String(m.name ?? ''),
        returnType: String(m.returnType ?? 'void'),
        params: String(m.params ?? ''),
        isStatic: !!m.isStatic,
        isAbstract: !!m.isAbstract,
      })),
    };
  });
  const ids = new Set(classes.map((c) => c.id));
  const relations = (Array.isArray(raw.relations) ? raw.relations : [])
    .filter((r) => ids.has(r.from) && ids.has(r.to) && REL_TYPES[r.type])
    .map((r) => ({
      id: String(r.id || uid()),
      type: r.type,
      from: r.from,
      to: r.to,
      label: String(r.label ?? ''),
      fromMult: String(r.fromMult ?? ''),
      toMult: String(r.toMult ?? ''),
      toRole: String(r.toRole ?? ''),
    }));
  return { classes, relations };
}

// ---------------------------------------------------------------------------
// Sample diagram shown on first load
// ---------------------------------------------------------------------------
const attr = (visibility, name, type, extra = {}) => ({
  id: uid(), visibility, name, type, isStatic: false, defaultValue: '', ...extra,
});
const method = (visibility, name, returnType, params = '', extra = {}) => ({
  id: uid(), visibility, name, returnType, params, isStatic: false, isAbstract: false, ...extra,
});

export function sampleModel() {
  const classes = [
    {
      id: 'gradable', name: 'Gradable', kind: 'interface', x: 40, y: 40,
      attributes: [],
      methods: [method('+', 'grade', 'double')],
    },
    {
      id: 'person', name: 'Person', kind: 'abstract', x: 380, y: 40,
      attributes: [attr('-', 'name', 'String'), attr('-', 'email', 'String')],
      methods: [method('+', 'getRole', 'String', '', { isAbstract: true }), method('+', 'describe', 'String')],
    },
    {
      id: 'student', name: 'Student', kind: 'class', x: 40, y: 330,
      attributes: [attr('-', 'studentId', 'String')],
      methods: [method('+', 'enroll', 'void', 'Course course')],
    },
    {
      id: 'teacher', name: 'Teacher', kind: 'class', x: 470, y: 330,
      attributes: [attr('-', 'employeeId', 'String')],
      methods: [method('+', 'getRole', 'String'), method('+', 'assign', 'void', 'Course course')],
    },
    {
      id: 'course', name: 'Course', kind: 'class', x: 270, y: 590,
      attributes: [attr('-', 'title', 'String'), attr('-', 'credits', 'int')],
      methods: [],
    },
    {
      id: 'department', name: 'Department', kind: 'class', x: 700, y: 590,
      attributes: [attr('-', 'name', 'String')],
      methods: [],
    },
    {
      id: 'level', name: 'CourseLevel', kind: 'enum', x: 20, y: 600,
      attributes: [attr('+', 'BEGINNER', ''), attr('+', 'INTERMEDIATE', ''), attr('+', 'ADVANCED', '')],
      methods: [],
    },
  ];
  const rel = (type, from, to, extra = {}) => ({
    id: uid(), type, from, to, label: '', fromMult: '', toMult: '', toRole: '', ...extra,
  });
  const relations = [
    rel('inheritance', 'student', 'person'),
    rel('inheritance', 'teacher', 'person'),
    rel('realization', 'student', 'gradable'),
    rel('association', 'student', 'course', { fromMult: '*', toMult: '0..*', toRole: 'courses' }),
    rel('association', 'course', 'teacher', { toMult: '1', toRole: 'instructor' }),
    rel('association', 'course', 'level', { toMult: '1', toRole: 'level' }),
    rel('aggregation', 'department', 'course', { toMult: '0..*', toRole: 'courses' }),
    rel('association', 'teacher', 'department', { toMult: '1', toRole: 'department' }),
  ];
  return { classes, relations };
}
