import React, { useEffect, useMemo, useState } from 'react';
import { IssueList } from './Inspector.jsx';
import { copyText, downloadText } from '../utils/download.js';

const KEYWORDS =
  'abstract boolean byte char class double else enum extends final float implements import int interface long new null package private protected public return short static super this true false void';
const TOKEN = new RegExp(
  [
    '(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)', // 1 comment
    '("(?:[^"\\\\\\n]|\\\\.)*"|\'(?:[^\'\\\\\\n]|\\\\.)*\')', // 2 string
    '(@\\w+)', // 3 annotation
    `\\b(${KEYWORDS.split(' ').join('|')})\\b`, // 4 keyword
    '\\b([A-Z][A-Za-z0-9_]*)\\b', // 5 type
    '\\b(\\d+(?:\\.\\d+)?[fFlLdD]?)\\b', // 6 number
  ].join('|'),
  'g'
);
const CLASSES = ['', 'cm', 'st', 'an', 'kw', 'ty', 'nu'];

function highlight(code) {
  const out = [];
  let last = 0;
  let m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(code)) !== null) {
    if (m.index > last) out.push(code.slice(last, m.index));
    const g = m.slice(1).findIndex((x) => x !== undefined) + 1;
    out.push(
      <span key={m.index} className={`tok-${CLASSES[g]}`}>
        {m[0]}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

export default function CodePanel({ files, issues, options, onOptions, focusClassId, notify }) {
  const [activeId, setActiveId] = useState(null);

  // follow the class selected on the canvas
  useEffect(() => {
    if (focusClassId && files.some((f) => f.classId === focusClassId)) setActiveId(focusClassId);
  }, [focusClassId, files]);

  const active = files.find((f) => f.classId === activeId) || files[0];
  const rendered = useMemo(() => (active ? highlight(active.content) : null), [active]);
  const pkgDir = options.packageName.trim() ? options.packageName.trim().replace(/\./g, '/') + '/' : '';
  const errors = issues.filter((i) => i.level === 'error');

  return (
    <div className="code-panel">
      <div className="panel code-options">
        <label className="field">
          <span>Package (optional)</span>
          <input
            className="mono"
            placeholder="com.example.model"
            value={options.packageName}
            onChange={(e) => onOptions({ ...options, packageName: e.target.value })}
            spellCheck={false}
          />
        </label>
        <div className="checks">
          <label>
            <input type="checkbox" checked={options.constructors} onChange={(e) => onOptions({ ...options, constructors: e.target.checked })} />
            Constructors
          </label>
          <label>
            <input type="checkbox" checked={options.accessors} onChange={(e) => onOptions({ ...options, accessors: e.target.checked })} />
            Getters &amp; setters
          </label>
        </div>
        {errors.length > 0 && <IssueList issues={issues.filter((i) => i.level === 'error').slice(0, 3)} />}
        {errors.length > 3 && <p className="muted small">…and {errors.length - 3} more (see the Properties tab).</p>}
      </div>

      {!files.length ? (
        <p className="muted pad">Add a class to see the generated Java code.</p>
      ) : (
        <>
          <div className="file-tabs" role="tablist">
            {files.map((f) => (
              <button
                key={f.classId}
                role="tab"
                aria-selected={active?.classId === f.classId}
                className={active?.classId === f.classId ? 'on' : ''}
                onClick={() => setActiveId(f.classId)}
              >
                {f.fileName}
              </button>
            ))}
          </div>
          <div className="code-actions">
            <span className="muted small mono">{pkgDir}{active.fileName}</span>
            <span className="grow" />
            <button
              className="btn-light"
              onClick={async () => notify((await copyText(active.content)) ? `Copied ${active.fileName}` : 'Copy failed - select the text manually')}
            >
              Copy
            </button>
            <button className="btn-light" onClick={() => downloadText(active.content, active.fileName, 'text/x-java-source')}>
              Download .java
            </button>
          </div>
          <pre className="code" tabIndex={0}>
            <code>{rendered}</code>
          </pre>
        </>
      )}
    </div>
  );
}
