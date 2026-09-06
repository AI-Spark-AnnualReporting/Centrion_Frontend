import { useEffect, useRef, useState } from 'react';
import { readNarrativeEnvelope, writeNarrativeEnvelope } from '@/lib/sectionEnvelope';
import type { ProducedSection } from '@/types/quarterly';
import { SectionContent } from '@/components/quarterly/SectionContent';
import { asStringArray } from '@/components/quarterly/sectionState';

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
  showAnalysis = false,
  companyId,
}: {
  section: ProducedSection;
  editing: boolean;
  saving: boolean;
  error: string | null;
  onSave: (content: string) => void;
  onCancel: () => void;
  // Print the Analyse button's paragraphs under the table(s). The report view
  // sets this; Preview leaves it off because SectionAnalysis renders them there
  // along with the controls to rewrite or edit them.
  showAnalysis?: boolean;
  // Forwarded to SectionContent — resolves the "View PDF" link on an
  // attach-mode section. See SectionContent for details.
  companyId?: string | null;
}) {
  // The editor always works on the raw source, Markdown and all — that is what
  // gets saved, so it is what the reviewer must see while editing. Attach-mode
  // content (`{document_id}`) has no text form to edit — the file IS the
  // content — so it always renders read-only regardless of `editing`.
  if (!editing || section.mode === 'attach') {
    return <SectionContent section={section} showAnalysis={showAnalysis} companyId={companyId} />;
  }

  // Detect a tabular shape from the content itself (not just `mode`) — hybrid
  // sections (table + analysis JSON) report mode 'generate', not 'table'/'kpi'.
  const parsed = tryParse(section.content);

  // Table with a recognizable structure → cell grid; otherwise (prose, or
  // unparseable table) → a plain textarea on the raw content string.
  if (parsed !== undefined && editableTables(parsed).length > 0) {
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
  // A narrative section stores {heading, content} as a JSON string — the report
  // prints that heading above the paragraph. Edit the prose and the heading as
  // two fields; the textarea used to be seeded with the raw JSON, and saving it
  // back silently destroyed the heading (or the whole envelope). A section that
  // is NOT an envelope — plain prose, or JSON already broken by hand — still
  // opens on its raw string, so it stays fixable.
  const envelope = readNarrativeEnvelope(section.content);
  return (
    <ProseEditor
      value={envelope ? envelope.body : (section.content ?? '')}
      heading={envelope ? envelope.heading : undefined}
      saving={saving}
      error={error}
      onSave={(body, heading) =>
        onSave(envelope ? writeNarrativeEnvelope(section.content, heading, body) : body)
      }
      onCancel={onCancel}
    />
  );
}

// ─── prose editor (blur / ⌘-Enter save · Esc cancel) ──────────────────────────
function ProseEditor({
  value,
  heading: initialHeading,
  saving,
  error,
  onSave,
  onCancel,
}: {
  value: string;
  /** undefined for a plain-prose section — it has no heading to edit. */
  heading?: string | null;
  saving: boolean;
  error: string | null;
  onSave: (body: string, heading: string | null) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [heading, setHeading] = useState<string | null>(initialHeading ?? null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const headingRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);
  const hasHeading = initialHeading !== undefined;
  const headingChanged = (heading ?? '') !== (initialHeading ?? '');

  useEffect(() => {
    setDraft(value);
    setHeading(initialHeading ?? null);
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
  }, [value, initialHeading]);

  const commit = () => {
    const t = draft.trim();
    if (!t) return;
    onSave(t, hasHeading ? (heading ?? '').trim() || null : null);
  };

  return (
    <div>
      {/* Only when the section actually carries one — offering an empty box on
          plain prose would invent a shape the producer never wrote. */}
      {hasHeading && (
        <input
          ref={headingRef}
          value={heading ?? ''}
          disabled={saving}
          placeholder="Section heading"
          onChange={(e) => setHeading(e.target.value)}
          onBlur={(e) => {
            if (cancelledRef.current || saving) return;
            if (e.relatedTarget && e.relatedTarget === taRef.current) return;
            if (draft.trim() && (draft.trim() !== value || headingChanged)) commit();
            else onCancel();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              cancelledRef.current = true;
              onCancel();
            } else if (e.key === 'Enter') {
              e.preventDefault();
              taRef.current?.focus();
            }
          }}
          style={{
            width: '100%', padding: '9px 14px', marginBottom: 8, borderRadius: 8,
            border: `1.5px solid ${ACCENT}`, fontSize: 13, fontWeight: 700,
            color: DARK, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
            background: '#fff',
          }}
        />
      )}
      <textarea
        ref={taRef}
        value={draft}
        disabled={saving}
        onChange={(e) => {
          setDraft(e.target.value);
          e.target.style.height = 'auto';
          e.target.style.height = `${e.target.scrollHeight}px`;
        }}
        onBlur={(e) => {
          if (cancelledRef.current || saving) return;
          // Moving up to the heading field is not leaving the editor; committing
          // there would close it before the heading could be typed.
          if (e.relatedTarget && e.relatedTarget === headingRef.current) return;
          const t = draft.trim();
          if (t && (t !== value || headingChanged)) commit();
          else onCancel();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            cancelledRef.current = true;
            onCancel();
          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            commit();
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
      {/* Clicking away still saves, but nobody should have to know that.
          preventDefault on mousedown keeps the textarea focused, so the button
          click is the only save — without it, blur would fire one too. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
        {/* Unchanged text is not a save: it would PATCH the same string back and
            mark the section hand-edited, which then makes produce skip it. */}
        <button
          className="btn bp"
          disabled={saving || !draft.trim() || (draft.trim() === value.trim() && !headingChanged)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={commit}
          style={{ fontSize: 12.5, padding: '8px 18px' }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          className="btn bs"
          disabled={saving}
          onMouseDown={(e) => {
            e.preventDefault();
            cancelledRef.current = true;
          }}
          onClick={onCancel}
          style={{ fontSize: 12.5, padding: '8px 16px' }}
        >
          Cancel
        </button>
      </div>
      <EditHint saving={saving} error={error} hint="⌘+Enter to save · Esc to cancel" />
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
      if (row) {
        row[key] = value;
        // Change % + direction are derived, never hand-typed: recompute them whenever a
        // comparison row's current/prior display is edited. Guard on an existing change_pct
        // key so a non-comparison table never gains change columns.
        if ((key === 'current_display' || key === 'prior_display') && 'change_pct' in row) {
          const cur = parseDisplayValue(row.current_display);
          const prior = parseDisplayValue(row.prior_display);
          if (cur != null && prior != null && prior !== 0) {
            // abs(prior), matching backend _change_pct: a negative prior in the
            // denominator flips the sign of the result, so a cost that grew reads
            // as a fall. 1 dp, also matching the backend.
            const pct = Math.round(((cur - prior) / Math.abs(prior)) * 1000) / 10;
            // Direction from the % SIGN (matches backend _change_direction) — not cur>prior,
            // which disagrees when the prior is negative.
            row.change_pct = pct;
            row.change_direction = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
          } else {
            row.change_pct = null;
            row.change_direction = null;
          }
        }
      }
      return next;
    });
  };

  const tables = editableTables(draft);

  return (
    <div>
      {tables.map((t, ti) => {
        const cols = columnsOf(t.rows, t.columns);
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
                    {cols.map((c) => {
                      const readOnly = READONLY_COLS.has(c);
                      return (
                        <td key={c} style={{ padding: '3px 4px' }}>
                          <input
                            value={cellStr(r[c])}
                            disabled={saving}
                            readOnly={readOnly}
                            tabIndex={readOnly ? -1 : undefined}
                            title={readOnly ? 'Computed automatically from the current & prior values' : undefined}
                            onChange={readOnly ? undefined : (e) => setCell(ti, ri, c, e.target.value)}
                            style={{
                              width: '100%', minWidth: 90, padding: '6px 8px', borderRadius: 6,
                              border: '1px solid #E4E6F1', fontSize: 12.5,
                              color: readOnly ? MUTED : DARK,
                              fontFamily: /current|prior|value|change|amount|figure/i.test(c) ? MONO : 'inherit',
                              outline: 'none', background: readOnly ? '#F4F5FA' : '#fff', boxSizing: 'border-box',
                              cursor: readOnly ? 'not-allowed' : 'text',
                            }}
                            onFocus={readOnly ? undefined : (e) => (e.currentTarget.style.borderColor = ACCENT)}
                            onBlur={readOnly ? undefined : (e) => (e.currentTarget.style.borderColor = '#E4E6F1')}
                          />
                        </td>
                      );
                    })}
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
function editableTables(parsed: unknown): { title?: string; rows: Row[]; columns?: string[] }[] {
  if (Array.isArray(parsed)) {
    if (parsed.length && isRec(parsed[0]) && Array.isArray((parsed[0] as Row).rows)) {
      return (parsed as Row[]).map((t) => ({
        title: asStr(t.title),
        rows: (t.rows as Row[]) ?? [],
        columns: asStringArray(t.columns),
      }));
    }
    return [{ rows: parsed.filter(isRec) as Row[] }];
  }
  if (isRec(parsed)) {
    if (Array.isArray(parsed.tables)) {
      return (parsed.tables as Row[]).map((t) => ({
        title: asStr(t.title),
        rows: (t.rows as Row[]) ?? [],
        columns: asStringArray(t.columns),
      }));
    }
    if (Array.isArray(parsed.rows)) {
      return [{
        title: asStr(parsed.title),
        rows: parsed.rows as Row[],
        columns: asStringArray(parsed.columns),
      }];
    }
  }
  return [];
}

// Editable columns = the primitive-valued keys across the rows (objects/arrays
// are skipped so we don't try to text-edit nested structures).
// Layout metadata (statement_layout.py) — kept on the row and preserved through
// edits (the draft is deep-cloned), but not shown as editable columns.
const HIDDEN_COLS = new Set(['role', 'indent']);

// Derived columns — shown but NOT hand-editable. Change % + direction are recomputed
// from the current/prior values whenever those are edited (see setCell).
const READONLY_COLS = new Set(['change_pct', 'change_direction']);

// Reverse of the backend _fmt_value_exact3: turn a formatted display string like
// "$14.773B", "$-318.000M", "SAR 3.038B", "(SAR 1,755M)", or "188.000K" back into a
// number, so the change % can be recomputed when a figure is hand-edited. null when
// blank/unparseable.
//
// Accounting parentheses are how every filed statement writes a negative, so the
// backend formatter emits them and this has to read them back: without the unwrap,
// "(SAR 1,755M)" failed the regex and returned null, silently blanking the change
// column of every expense, outflow and loss row the moment it was edited. Also lets
// a user TYPE "(1,234)" the way they'd type it into a spreadsheet.
function parseDisplayValue(raw: unknown): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  const parenNegative = s.startsWith('(') && s.endsWith(')');
  if (parenNegative) s = s.slice(1, -1);
  s = s.replace(/(SAR|USD|GBP|EUR|SR)/gi, '').replace(/[$£€,\s]/g, '');
  const m = s.match(/^(-?\d*\.?\d+)([bmk])?$/i);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (Number.isNaN(n)) return null;
  if (parenNegative) n = -Math.abs(n);
  const suf = (m[2] || '').toLowerCase();
  const mult = suf === 'b' ? 1e9 : suf === 'm' ? 1e6 : suf === 'k' ? 1e3 : 1;
  return n * mult;
}

// `explicit` is the table's own column list where it has one — it fixes both the
// set and the order, so a grid edits in the same layout it renders in.
function columnsOf(rows: Row[], explicit?: string[]): string[] {
  const cols = new Set<string>(explicit ?? []);
  if (!explicit) {
    rows.forEach((r) => {
      Object.entries(r).forEach(([k, v]) => {
        if (v == null || typeof v !== 'object') cols.add(k);
      });
    });
  }
  HIDDEN_COLS.forEach((h) => cols.delete(h));
  return Array.from(cols);
}
