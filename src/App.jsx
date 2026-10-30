import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import Toolbar from './components/Toolbar.jsx';
import Canvas from './components/Canvas.jsx';
import Inspector from './components/Inspector.jsx';
import CodePanel from './components/CodePanel.jsx';
import {
  KINDS, createClass, emptyModel, newAttribute, newMethod, normalizeModel, sampleModel, uid, uniqueName,
} from './utils/model.js';
import { generateJava, validateModel } from './utils/javaGenerator.js';
import { autoLayout } from './utils/layout.js';
import { downloadBlob, downloadText, downloadZip, svgToPngBlob } from './utils/download.js';

const STORAGE_KEY = 'uml-class-diagram-generator/v1';
const DEFAULT_OPTIONS = { packageName: '', constructors: true, accessors: true };
const HISTORY_LIMIT = 100;
const snap = (v) => Math.round(v / 10) * 10;

// ------------------------------------------------------------ undo / redo ---
function histReducer(state, a) {
  switch (a.type) {
    case 'commit': {
      const next = a.fn(state.present);
      if (next === state.present) return state;
      const coalesce = a.key && a.key === state.lastKey && a.time - state.lastTime < 1200;
      return {
        past: coalesce ? state.past : [...state.past, state.present].slice(-HISTORY_LIMIT),
        present: next,
        future: [],
        lastKey: a.key || null,
        lastTime: a.time,
      };
    }
    case 'live': {
      const next = a.fn(state.present);
      return next === state.present ? state : { ...state, present: next, lastKey: null };
    }
    case 'checkpoint':
      return { ...state, past: [...state.past, state.present].slice(-HISTORY_LIMIT), future: [], lastKey: null };
    case 'undo':
      if (!state.past.length) return state;
      return {
        past: state.past.slice(0, -1),
        present: state.past[state.past.length - 1],
        future: [state.present, ...state.future],
        lastKey: null,
        lastTime: 0,
      };
    case 'redo':
      if (!state.future.length) return state;
      return {
        past: [...state.past, state.present],
        present: state.future[0],
        future: state.future.slice(1),
        lastKey: null,
        lastTime: 0,
      };
    case 'reset':
      return { past: [], present: a.model, future: [], lastKey: null, lastTime: 0 };
    default:
      return state;
  }
}

function loadInitial() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { model: normalizeModel(parsed.model), options: { ...DEFAULT_OPTIONS, ...(parsed.options || {}) } };
    }
  } catch {
    /* fall through to the sample */
  }
  return { model: sampleModel(), options: DEFAULT_OPTIONS };
}

export default function App() {
  const initial = useMemo(loadInitial, []);
  const [hist, dispatch] = useReducer(histReducer, null, () => ({
    past: [], present: initial.model, future: [], lastKey: null, lastTime: 0,
  }));
  const model = hist.present;
  const modelRef = useRef(model);
  modelRef.current = model;

  const [options, setOptions] = useState(initial.options);
  const [selectionRaw, setSelection] = useState(null);
  const [tool, setTool] = useState('select');
  const [side, setSide] = useState('properties');
  const [toast, setToast] = useState(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  const notify = useCallback((msg) => setToast({ msg, id: uid() }), []);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // selection must point at something that still exists (e.g. after undo)
  const selection = useMemo(() => {
    if (!selectionRaw) return null;
    const list = selectionRaw.type === 'class' ? model.classes : model.relations;
    return list.some((x) => x.id === selectionRaw.id) ? selectionRaw : null;
  }, [selectionRaw, model]);

  // autosave
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ model, options }));
    } catch {
      /* storage full / unavailable */
    }
  }, [model, options]);

  const files = useMemo(() => generateJava(model, options), [model, options]);
  const issues = useMemo(() => validateModel(model), [model]);

  // ----------------------------------------------------------- model edits --
  const update = useCallback((fn, key) => dispatch({ type: 'commit', fn, key, time: Date.now() }), []);
  const live = useCallback((fn) => dispatch({ type: 'live', fn }), []);

  const mapClass = (id, fn) => (m) => ({ ...m, classes: m.classes.map((c) => (c.id === id ? fn(c) : c)) });

  const actions = useMemo(
    () => ({
      select: setSelection,
      updateClass: (id, patch, key) => update(mapClass(id, (c) => ({ ...c, ...patch })), key),
      addMember: (id, list) =>
        update(mapClass(id, (c) => ({ ...c, [list]: [...c[list], list === 'attributes' ? newAttribute(c) : newMethod(c)] }))),
      updateMember: (id, list, mid, patch, key) =>
        update(mapClass(id, (c) => ({ ...c, [list]: c[list].map((x) => (x.id === mid ? { ...x, ...patch } : x)) })), key),
      removeMember: (id, list, mid) => update(mapClass(id, (c) => ({ ...c, [list]: c[list].filter((x) => x.id !== mid) }))),
      deleteClass: (id) => {
        update((m) => ({
          classes: m.classes.filter((c) => c.id !== id),
          relations: m.relations.filter((r) => r.from !== id && r.to !== id),
        }));
        setSelection(null);
      },
      updateRelation: (id, patch, key) =>
        update((m) => ({ ...m, relations: m.relations.map((r) => (r.id === id ? { ...r, ...patch } : r)) }), key),
      swapRelation: (id) =>
        update((m) => ({
          ...m,
          relations: m.relations.map((r) =>
            r.id === id ? { ...r, from: r.to, to: r.from, fromMult: r.toMult, toMult: r.fromMult, toRole: '' } : r
          ),
        })),
      deleteRelation: (id) => {
        update((m) => ({ ...m, relations: m.relations.filter((r) => r.id !== id) }));
        setSelection(null);
      },
    }),
    [update]
  );

  const addClass = useCallback(
    (kind, at) => {
      const id = uid();
      const center = at || canvasRef.current?.getViewCenter() || { x: 240, y: 200 };
      update((m) => {
        const name = uniqueName(m.classes.map((c) => c.name), KINDS[kind].defaultName);
        const jitter = at ? 0 : (m.classes.length % 6) * 24;
        const cls = createClass(id, kind, name, snap(center.x - 100 + jitter), snap(center.y - 60 + jitter));
        return { ...m, classes: [...m.classes, cls] };
      });
      setSelection({ type: 'class', id });
      setSide('properties');
    },
    [update]
  );

  const connect = useCallback(
    (type, from, to) => {
      const m = modelRef.current;
      if ((type === 'inheritance' || type === 'realization') && from === to) {
        notify('A class cannot inherit from itself.');
        return;
      }
      if (m.relations.some((r) => r.type === type && r.from === from && r.to === to)) {
        notify('That relationship already exists.');
        return;
      }
      const id = uid();
      update((cur) => ({
        ...cur,
        relations: [...cur.relations, { id, type, from, to, label: '', fromMult: '', toMult: '', toRole: '' }],
      }));
      setSelection({ type: 'relation', id });
      setSide('properties');
    },
    [update, notify]
  );

  const deleteSelection = useCallback(() => {
    if (!selection) return;
    if (selection.type === 'class') actions.deleteClass(selection.id);
    else actions.deleteRelation(selection.id);
  }, [selection, actions]);

  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      const el = e.target;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === 'Escape') {
        setTool('select');
        if (!typing) setSelection(null);
        return;
      }
      if (typing) return;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelection();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteSelection]);

  // ------------------------------------------------------------ file menu ---
  const replaceModel = (next, msg) => {
    dispatch({ type: 'reset', model: next });
    setSelection(null);
    setTool('select');
    setTimeout(() => canvasRef.current?.fit(), 60);
    if (msg) notify(msg);
  };

  const onNew = () => {
    if (modelRef.current.classes.length && !window.confirm('Start a new empty diagram? Unsaved work will be lost.')) return;
    replaceModel(emptyModel(), 'New diagram');
  };
  const onSample = () => {
    if (modelRef.current.classes.length && !window.confirm('Replace the current diagram with the sample?')) return;
    replaceModel(sampleModel(), 'Sample loaded');
  };
  const onExportJson = () => {
    downloadText(JSON.stringify({ version: 1, model, options }, null, 2), 'uml-diagram.json', 'application/json');
  };
  const onImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      const next = normalizeModel(raw.model || raw);
      if (raw.options) setOptions({ ...DEFAULT_OPTIONS, ...raw.options });
      replaceModel(next, `Imported ${file.name}`);
    } catch (err) {
      notify(`Import failed: ${err.message}`);
    }
  };
  const onExportSvg = () => {
    const out = canvasRef.current?.getExportSvg();
    if (!out) return notify('Nothing to export yet.');
    downloadText(out.svg, 'uml-class-diagram.svg', 'image/svg+xml');
    return undefined;
  };
  const onExportPng = async () => {
    const out = canvasRef.current?.getExportSvg();
    if (!out) return notify('Nothing to export yet.');
    try {
      downloadBlob(await svgToPngBlob(out.svg, out.width, out.height, 2), 'uml-class-diagram.png');
    } catch (err) {
      notify(err.message);
    }
    return undefined;
  };
  const onZip = async () => {
    if (!files.length) return notify('Add at least one class first.');
    const dir = options.packageName.trim() ? `src/${options.packageName.trim().replace(/\./g, '/')}/` : 'src/';
    await downloadZip(files.map((f) => ({ path: dir + f.fileName, content: f.content })), 'java-classes.zip');
    const errs = issues.filter((i) => i.level === 'error').length;
    notify(errs ? `Downloaded ${files.length} files (diagram has ${errs} error${errs > 1 ? 's' : ''})` : `Downloaded ${files.length} Java files`);
    return undefined;
  };

  const autoArrange = () => {
    update((m) => autoLayout(m));
    setTimeout(() => canvasRef.current?.fit(), 60);
  };

  return (
    <div className="app">
      <Toolbar
        tool={tool}
        onTool={setTool}
        onAdd={(k) => addClass(k)}
        canUndo={hist.past.length > 0}
        canRedo={hist.future.length > 0}
        onUndo={undo}
        onRedo={redo}
        onAutoLayout={autoArrange}
        onFit={() => canvasRef.current?.fit()}
        onZoom={(f) => canvasRef.current?.zoomBy(f)}
        onZip={onZip}
        onNew={onNew}
        onSample={onSample}
        onImport={() => fileInputRef.current?.click()}
        onExportJson={onExportJson}
        onExportPng={onExportPng}
        onExportSvg={onExportSvg}
      />
      <div className="workspace">
        <Canvas
          ref={canvasRef}
          model={model}
          selection={selection}
          tool={tool}
          onSelect={setSelection}
          onDragStart={() => dispatch({ type: 'checkpoint' })}
          onMoveNode={(id, x, y) => live(mapClass(id, (c) => (c.x === x && c.y === y ? c : { ...c, x, y })))}
          onConnect={connect}
          onToolChange={setTool}
          onCreateAt={(x, y) => addClass('class', { x, y })}
        />
        <aside className="side">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={side === 'properties'} className={side === 'properties' ? 'on' : ''} onClick={() => setSide('properties')}>
              Properties
            </button>
            <button role="tab" aria-selected={side === 'code'} className={side === 'code' ? 'on' : ''} onClick={() => setSide('code')}>
              Java code <span className="badge">{files.length}</span>
              {issues.some((i) => i.level === 'error') && <span className="badge err" title="The diagram has errors">!</span>}
            </button>
          </div>
          <div className="side-body">
            {side === 'properties' ? (
              <Inspector model={model} selection={selection} issues={issues} actions={actions} />
            ) : (
              <CodePanel
                files={files}
                issues={issues}
                options={options}
                onOptions={setOptions}
                focusClassId={selection?.type === 'class' ? selection.id : null}
                notify={notify}
              />
            )}
          </div>
        </aside>
      </div>
      {toast && (
        <div className="toast" role="status" key={toast.id}>
          {toast.msg}
        </div>
      )}
      <input ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={onImportFile} />
    </div>
  );
}
