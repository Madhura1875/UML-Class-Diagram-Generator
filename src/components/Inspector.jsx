import React from 'react';
import { KINDS, REL_TYPES, VISIBILITIES } from '../utils/model.js';

export function IssueList({ issues, onPick }) {
  if (!issues.length) return null;
  return (
    <ul className="issues">
      {issues.map((it, i) => (
        <li key={i} className={it.level} onClick={() => onPick?.(it)} style={{ cursor: onPick ? 'pointer' : 'default' }}>
          <span className="issue-tag">{it.level === 'error' ? 'Error' : 'Warning'}</span>
          {it.message}
        </li>
      ))}
    </ul>
  );
}

function VisSelect({ value, onChange }) {
  return (
    <select className="vis" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Visibility">
      {VISIBILITIES.map((v) => (
        <option key={v.value} value={v.value}>
          {v.label}
        </option>
      ))}
    </select>
  );
}

function ClassEditor({ cls, actions }) {
  const isEnum = cls.kind === 'enum';
  const isInterface = cls.kind === 'interface';
  const key = (f, id = '') => `${cls.id}:${id}:${f}`;

  return (
    <div className="panel">
      <div className="field-row">
        <label className="field grow">
          <span>Name</span>
          <input
            className="mono"
            value={cls.name}
            onChange={(e) => actions.updateClass(cls.id, { name: e.target.value }, key('name'))}
            spellCheck={false}
          />
        </label>
        <label className="field">
          <span>Kind</span>
          <select value={cls.kind} onChange={(e) => actions.updateClass(cls.id, { kind: e.target.value })}>
            {Object.entries(KINDS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="section-head">
        <h4>{isEnum ? 'Constants' : isInterface ? 'Constants (static final)' : 'Attributes'}</h4>
        <button className="mini" onClick={() => actions.addMember(cls.id, 'attributes')}>
          + {isEnum ? 'Constant' : 'Attribute'}
        </button>
      </div>
      {cls.attributes.length === 0 && <p className="muted small">None yet.</p>}
      {cls.attributes.map((a) => (
        <div className={`member-row ${isEnum ? 'enum-row' : 'attr-row'}`} key={a.id}>
          {!isEnum && <VisSelect value={a.visibility} onChange={(v) => actions.updateMember(cls.id, 'attributes', a.id, { visibility: v })} />}
          <input
            className="mono"
            placeholder={isEnum ? 'CONSTANT' : 'name'}
            value={a.name}
            onChange={(e) => actions.updateMember(cls.id, 'attributes', a.id, { name: e.target.value }, key('an', a.id))}
            spellCheck={false}
            aria-label="Name"
          />
          {!isEnum && (
            <>
              <input
                className="mono"
                placeholder="Type"
                value={a.type}
                onChange={(e) => actions.updateMember(cls.id, 'attributes', a.id, { type: e.target.value }, key('at', a.id))}
                spellCheck={false}
                aria-label="Type"
              />
              <input
                className="mono"
                placeholder="= default"
                value={a.defaultValue}
                onChange={(e) => actions.updateMember(cls.id, 'attributes', a.id, { defaultValue: e.target.value }, key('ad', a.id))}
                spellCheck={false}
                aria-label="Default value"
              />
              <label className="chk" title="static">
                <input
                  type="checkbox"
                  checked={a.isStatic}
                  onChange={(e) => actions.updateMember(cls.id, 'attributes', a.id, { isStatic: e.target.checked })}
                />
                S
              </label>
            </>
          )}
          <button className="icon-btn" title="Remove" aria-label="Remove attribute" onClick={() => actions.removeMember(cls.id, 'attributes', a.id)}>
            ×
          </button>
        </div>
      ))}

      <div className="section-head">
        <h4>Methods</h4>
        <button className="mini" onClick={() => actions.addMember(cls.id, 'methods')}>
          + Method
        </button>
      </div>
      {cls.methods.length === 0 && <p className="muted small">None yet.</p>}
      {cls.methods.map((m) => (
        <div className="method-block" key={m.id}>
          <div className="member-row method-row">
            <VisSelect value={m.visibility} onChange={(v) => actions.updateMember(cls.id, 'methods', m.id, { visibility: v })} />
            <input
              className="mono"
              placeholder="name"
              value={m.name}
              onChange={(e) => actions.updateMember(cls.id, 'methods', m.id, { name: e.target.value }, key('mn', m.id))}
              spellCheck={false}
              aria-label="Method name"
            />
            <input
              className="mono"
              placeholder="returns"
              value={m.returnType}
              onChange={(e) => actions.updateMember(cls.id, 'methods', m.id, { returnType: e.target.value }, key('mr', m.id))}
              spellCheck={false}
              aria-label="Return type"
            />
            <label className="chk" title="static">
              <input
                type="checkbox"
                checked={m.isStatic}
                onChange={(e) => actions.updateMember(cls.id, 'methods', m.id, { isStatic: e.target.checked })}
              />
              S
            </label>
            <label className="chk" title={isInterface ? 'interface methods are abstract by default' : 'abstract (use on abstract classes)'}>
              <input
                type="checkbox"
                checked={isInterface ? !m.isStatic : m.isAbstract}
                disabled={isInterface}
                onChange={(e) => actions.updateMember(cls.id, 'methods', m.id, { isAbstract: e.target.checked })}
              />
              A
            </label>
            <button className="icon-btn" title="Remove" aria-label="Remove method" onClick={() => actions.removeMember(cls.id, 'methods', m.id)}>
              ×
            </button>
          </div>
          <input
            className="mono params"
            placeholder="parameters, e.g.  String name, int age"
            value={m.params}
            onChange={(e) => actions.updateMember(cls.id, 'methods', m.id, { params: e.target.value }, key('mp', m.id))}
            spellCheck={false}
            aria-label="Parameters"
          />
        </div>
      ))}

      <div className="panel-actions">
        <button className="btn-light danger" onClick={() => actions.deleteClass(cls.id)}>
          Delete class
        </button>
      </div>
    </div>
  );
}

function RelationEditor({ rel, model, actions }) {
  const from = model.classes.find((c) => c.id === rel.from);
  const to = model.classes.find((c) => c.id === rel.to);
  const isField = ['association', 'aggregation', 'composition'].includes(rel.type);
  const key = (f) => `${rel.id}:${f}`;

  return (
    <div className="panel">
      <div className="rel-summary">
        <code>{from?.name}</code>
        <span aria-hidden="true">→</span>
        <code>{to?.name}</code>
      </div>
      <label className="field">
        <span>Type</span>
        <select value={rel.type} onChange={(e) => actions.updateRelation(rel.id, { type: e.target.value })}>
          {Object.entries(REL_TYPES).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </label>
      <p className="muted small">{REL_TYPES[rel.type].hint}</p>

      <label className="field">
        <span>Label (optional)</span>
        <input value={rel.label} onChange={(e) => actions.updateRelation(rel.id, { label: e.target.value }, key('label'))} />
      </label>

      <div className="field-row">
        <label className="field grow">
          <span>Multiplicity at source</span>
          <input
            className="mono"
            placeholder="e.g. 1"
            value={rel.fromMult}
            onChange={(e) => actions.updateRelation(rel.id, { fromMult: e.target.value }, key('fm'))}
          />
        </label>
        <label className="field grow">
          <span>Multiplicity at target</span>
          <input
            className="mono"
            placeholder="e.g. 0..*"
            value={rel.toMult}
            onChange={(e) => actions.updateRelation(rel.id, { toMult: e.target.value }, key('tm'))}
          />
        </label>
      </div>

      {isField && (
        <label className="field">
          <span>Field name in {from?.name} (role)</span>
          <input
            className="mono"
            placeholder={to ? to.name.charAt(0).toLowerCase() + to.name.slice(1) : 'field'}
            value={rel.toRole}
            onChange={(e) => actions.updateRelation(rel.id, { toRole: e.target.value }, key('role'))}
            spellCheck={false}
          />
          <small className="muted">A target multiplicity above 1 (e.g. 0..*, 2, 1..*) generates a List&lt;{to?.name}&gt;.</small>
        </label>
      )}

      <div className="panel-actions">
        <button className="btn-light" onClick={() => actions.swapRelation(rel.id)}>
          Reverse direction
        </button>
        <button className="btn-light danger" onClick={() => actions.deleteRelation(rel.id)}>
          Delete relationship
        </button>
      </div>
    </div>
  );
}

export default function Inspector({ model, selection, issues, actions }) {
  if (selection?.type === 'class') {
    const cls = model.classes.find((c) => c.id === selection.id);
    if (cls) return <ClassEditor key={cls.id} cls={cls} actions={actions} />;
  }
  if (selection?.type === 'relation') {
    const rel = model.relations.find((r) => r.id === selection.id);
    if (rel) return <RelationEditor key={rel.id} rel={rel} model={model} actions={actions} />;
  }

  return (
    <div className="panel">
      <h3 className="panel-title">Getting started</h3>
      <ol className="howto">
        <li>Add classes, interfaces or enums with the <b>Add</b> buttons (or double-click the canvas).</li>
        <li>Click a class to edit its name, attributes and methods here.</li>
        <li>Pick a relationship under <b>Link</b>, then click the source class and the target class.</li>
        <li>Open the <b>Java code</b> tab for live-generated source, then download it as a zip.</li>
      </ol>
      <div className="stats">
        <div><b>{model.classes.length}</b><span>classes</span></div>
        <div><b>{model.relations.length}</b><span>relationships</span></div>
        <div><b>{issues.filter((i) => i.level === 'error').length}</b><span>errors</span></div>
      </div>
      <h4 className="section-title">Checks</h4>
      {issues.length ? <IssueList issues={issues} onPick={(it) => it.classId && actions.select({ type: 'class', id: it.classId })} /> : <p className="muted small">No problems found - the diagram maps cleanly to Java.</p>}
    </div>
  );
}
