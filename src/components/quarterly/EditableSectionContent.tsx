import { useEffect, useRef, useState } from 'react';
import type { ProducedSection } from '@/types/quarterly';
import { SectionContent } from '@/components/quarterly/SectionContent';

const ACCENT = '#4040C8';
const DARK = '#1F2340';
const MUTED = '#6B7280';
const RED = '#EF4444';
const MONO = "'DM Mono', 'Courier New', monospace";

// Read-only rendering (SectionContent) with an inline edit mode. Prose sections
// edit as text; table/kpi sections edit per-cell and re-serialize to the same
// JSON shape. Save persists the section's `content` string.
export function EditableSectionContent({
  section,
  editing,
  saving,
  error,
  onSave,
  onCancel,
}: {
  section: ProducedSection;
  editing: boolean;
  saving: boolean;
  error: string | null;
  onSave: (content: string) => void;
  onCancel: () => void;
}) {
  if (!editing) return <SectionContent section={section} />;

  const isTable = section.mode === 'table' || section.mode === 'kpi';
  const parsed = isTable ? tryParse(section.content) : undefined;

  // Table with a recognizable structure → cell grid; otherwise (prose, or
  // unparseable table) → a plain textarea on the raw content string.
  if (isTable && parsed !== undefined && editableTables(parsed).length > 0) {
    return (
      <TableEditor
        initial={parsed}
        saving={saving}
        error={error}
        onSave={(obj) => onSave(JSON.stringify(obj))}
        onCancel={onCancel}
      />
    );
  }
  return (
    <ProseEditor
      value={section.content ?? ''}
      saving={saving}
      error={error}
      onSave={onSave}
      onCancel={onCancel}
    />
  );
}

// ─── prose editor (blur / ⌘-Enter save · Esc cancel) ──────────────────────────
function ProseEditor({
  value,
  saving,
  error,
  onSave,
  onCancel,
}: {
  value: string;
  saving: boolean;
  error: string | null;
  onSave: (v: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    setDraft(value);
    cancelledRef.current = false;
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (el) {
        el.focus();
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  }, [value]);

  return (
    <div>
      <textarea
        ref={taRef}
        value={draft}
        disabled={saving}
        onChange={(e) => {
          setDraft(e.target.value);
          e.target.style.height = 'auto';
          e.target.style.height = `${e.target.scrollHeight}px`;
        }}
        onBlur={() => {
          if (cancelledRef.current || saving) return;
          const t = draft.trim();
          if (t && t !== value) onSave(t);
          else onCancel();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            cancelledRef.current = true;
            onCancel();
          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (draft.trim()) onSave(draft.trim());
          }
        }}
        rows={4}
        style={{
          width: '100%', padding: '12px 14px', borderRadius: 8,
          border: `1.5px solid ${error ? '#FECACA' : ACCENT}`,
          fontSize: 14, lineHeight: 1.75, color: DARK, fontFamily: 'inherit',
          resize: 'none', outline: 'none', boxSizing: 'border-box', background: '#fff',
        }}
      />
      <EditHint saving={saving} error={error} hint="Blur or ⌘+Enter to save · Esc to cancel" />
    </div>
  );
}

// ─── table editor (per-cell inputs, shape-preserving) ─────────────────────────
type Row = Record<string, unknown>;

function TableEditor({
  initial,
  saving,
  error,
  onSave,
  onCancel,
}: {
  initial: unknown;
  saving: boolean;
  error: string | null;
  onSave: (obj: unknown) => void;
  onCancel: () => void;
}) {
  // Hold a mutable clone; edits mutate it immutably and it is serialized as-is,
  // preserving whatever top-level shape the backend uses.
  const [draft, setDraft] = useState<unknown>(() => clone(initial));

  const setCell = (ti: number, ri: number, key: string, value: string) => {
    setDraft((prev) => {
      const next = clone(prev);
      const tables = editableTables(next);
      const row = tables[ti]?.rows[ri];
      if (row) row[key] = value;
      return next;
    });
  };

  const tables = editableTables(draft);

  return (
    <div>
      {tables.map((t, ti) => {
        const cols = columnsOf(t.rows);
        return (
          <div key={ti} style={{ marginBottom: 18, overflowX: 'auto' }}>
            {t.title && (
              <div style={{ fontSize: 13, fontWeight: 700, color: DARK, marginBottom: 8 }}>{t.title}</div>
            )}
            <table style={{ borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr>
                  {cols.map((c) => (
                    <th key={c} style={{ padding: '4px 8px', textAlign: 'left', color: MUTED, fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {c.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.rows.map((r, ri) => (
                  <tr key={ri}>
                    {cols.map((c) => (
                      <td key={c} style={{ padding: '3px 4px' }}>
                        <input
                          value={cellStr(r[c])}
                          disabled={saving}
                          onChange={(e) => setCell(ti, ri, c, e.target.value)}
                          style={{
                            width: '100%', minWidth: 90, padding: '6px 8px', borderRadius: 6,
                            border: '1px solid #E4E6F1', fontSize: 12.5, color: DARK,
                            fontFamily: /current|prior|value|change|amount|figure/i.test(c) ? MONO : 'inherit',
                            outline: 'none', background: '#fff', boxSizing: 'border-box',
                          }}
                          onFocus={(e) => (e.currentTarget.style.borderColor = ACCENT)}
                          onBlur={(e) => (e.currentTarget.style.borderColor = '#E4E6F1')}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
        <button className="btn bp" disabled={saving} onClick={() => onSave(draft)} style={{ fontSize: 12.5, padding: '8px 18px', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button className="btn bs" disabled={saving} onClick={onCancel} style={{ fontSize: 12.5, padding: '8px 16px' }}>
          Cancel
        </button>
        {error && <span style={{ fontSize: 12, color: RED }}>{error}</span>}
      </div>
    </div>
  );
}

function EditHint({ saving, error, hint }: { saving: boolean; error: string | null; hint: string }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 11, color: '#9BA3C4' }}>
        {saving ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: ACCENT }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}>
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            Saving…
          </span>
        ) : (
          <span>{hint}</span>
        )}
      </div>
      {error && <div style={{ marginTop: 4, fontSize: 12, color: RED }}>{error}</div>}
    </>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function tryParse(s: string | null): unknown | undefined {
  if (s == null) return undefined;
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}
function isRec(v: unknown): v is Row {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function asStr(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}
function cellStr(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// Return references to the editable row arrays inside `parsed` (mutating them
// mutates parsed). Handles {rows}, {tables:[{rows}]}, array-of-rows/tables.
function editableTables(parsed: unknown): { title?: string; rows: Row[] }[] {
  if (Array.isArray(parsed)) {
    if (parsed.length && isRec(parsed[0]) && Array.isArray((parsed[0] as Row).rows)) {
      return (parsed as Row[]).map((t) => ({ title: asStr(t.title), rows: (t.rows as Row[]) ?? [] }));
    }
    return [{ rows: parsed.filter(isRec) as Row[] }];
  }
  if (isRec(parsed)) {
    if (Array.isArray(parsed.tables)) {
      return (parsed.tables as Row[]).map((t) => ({ title: asStr(t.title), rows: (t.rows as Row[]) ?? [] }));
    }
    if (Array.isArray(parsed.rows)) {
      return [{ title: asStr(parsed.title), rows: parsed.rows as Row[] }];
    }
  }
  return [];
}

// Editable columns = the primitive-valued keys across the rows (objects/arrays
// are skipped so we don't try to text-edit nested structures).
// Layout metadata (statement_layout.py) — kept on the row and preserved through
// edits (the draft is deep-cloned), but not shown as editable columns.
const HIDDEN_COLS = new Set(['role', 'indent']);

function columnsOf(rows: Row[]): string[] {
  const cols = new Set<string>();
  rows.forEach((r) => {
    Object.entries(r).forEach(([k, v]) => {
      if (v == null || typeof v !== 'object') cols.add(k);
    });
  });
  HIDDEN_COLS.forEach((h) => cols.delete(h));
  return Array.from(cols);
}
