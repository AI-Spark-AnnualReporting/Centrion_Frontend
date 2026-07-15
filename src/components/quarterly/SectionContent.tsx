import type { ProducedSection } from '@/types/quarterly';

// ─── colours (match Coverage / Gaps / Preview conventions) ────────────────────
const GREEN = '#10B981';
const RED = '#EF4444';
const MUTED = '#6B7280';
const DARK = '#1F2340';
const MONO = "'DM Mono', 'Courier New', monospace";
// Report-content accent — the chosen brand color (falls back to app indigo when
// no --brand-primary is set on an ancestor). Applies to headings, table headers,
// and KPI/highlight numbers only; body/label text stays dark.
const BRAND = 'var(--brand-primary, #4040C8)';

// Section content is stored keyed by `mode`:
//   table / kpi  → a JSON string that must be parsed and rendered as a real table
//   generate     → analytical prose
//   template     → filled boilerplate prose
// This renderer branches on mode and NEVER prints a raw JSON blob.
export function SectionContent({ section }: { section: ProducedSection }) {
  const { mode } = section;
  // Some endpoints (e.g. /assemble) return table content as a parsed object/array
  // rather than a JSON string. Normalise to a string so `.trim()`/JSON.parse work.
  const raw = section.content as unknown;
  const content = raw == null ? null : typeof raw === 'string' ? raw : JSON.stringify(raw);

  if (content == null || content.trim() === '') {
    return <NoData />;
  }

  const isTabular = mode === 'table' || mode === 'kpi';
  if (isTabular) {
    const parsed = tryParseJson(content);
    if (parsed !== undefined) {
      const tables = normalizeTables(parsed);
      if (tables.some((t) => t.rows.length > 0)) {
        return (
          <>
            {tables.map((t, i) => (
              <TableBlock key={i} table={t} showTitle={tables.length > 1} />
            ))}
          </>
        );
      }
      // Valid table JSON but no rows ({"rows": []}) → empty, never a blob.
      return <NoData />;
    }
    // Not valid JSON — treat the string as prose.
    return <Prose text={content} />;
  }

  // generate / template / anything else → prose.
  return <Prose text={content} />;
}

// Honest empty state — shown when a section produced no usable content.
function NoData() {
  return (
    <p style={{ margin: 0, fontSize: 13, color: MUTED }}>No data available for this section.</p>
  );
}

// ─── prose ────────────────────────────────────────────────────────────────────
function Prose({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const blocks = paragraphs.length ? paragraphs : [text];
  return (
    <>
      {blocks.map((p, i) => (
        <p
          key={i}
          style={{ margin: i === 0 ? 0 : '14px 0 0', fontSize: 14, lineHeight: 1.75, color: '#2A2E47', whiteSpace: 'pre-wrap', textAlign: 'justify' }}
        >
          {p}
        </p>
      ))}
    </>
  );
}

// ─── table ────────────────────────────────────────────────────────────────────
type LooseRow = Record<string, unknown>;
interface NormTable {
  title?: string;
  rows: LooseRow[];
}

function tryParseJson(s: string): unknown | undefined {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

// Normalise arbitrary parsed JSON into a list of { title?, rows[] }.
function normalizeTables(parsed: unknown): NormTable[] {
  if (parsed == null) return [];
  if (Array.isArray(parsed)) {
    if (parsed.length && isRecord(parsed[0]) && Array.isArray((parsed[0] as LooseRow).rows)) {
      return (parsed as LooseRow[]).map((t) => ({
        title: asString(t.title),
        rows: Array.isArray(t.rows) ? (t.rows as LooseRow[]) : [],
      }));
    }
    return [{ rows: parsed.filter(isRecord) as LooseRow[] }];
  }
  if (isRecord(parsed)) {
    if (Array.isArray(parsed.tables)) {
      return (parsed.tables as LooseRow[]).map((t) => ({
        title: asString(t.title),
        rows: Array.isArray(t.rows) ? (t.rows as LooseRow[]) : [],
      }));
    }
    if (Array.isArray(parsed.rows)) {
      return [{ title: asString(parsed.title), rows: parsed.rows as LooseRow[] }];
    }
    // Plain object → key/value pairs as a 2-column table.
    return [{ rows: Object.entries(parsed).map(([k, v]) => ({ label: k, current_display: stringifyCell(v) })) }];
  }
  return [];
}

function TableBlock({ table, showTitle }: { table: NormTable; showTitle: boolean }) {
  const rows = table.rows;
  if (rows.length === 0) return null;

  // Financial shape (label + current_display[/prior/change]) vs generic object rows.
  const financial = rows.some((r) => cell(r, 'current_display', 'current', 'value') != null);

  return (
    <div style={{ marginBottom: 24, overflowX: 'auto' }}>
      {showTitle && table.title && (
        <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: BRAND }}>{table.title}</h3>
      )}
      {financial ? <FinancialTable rows={rows} /> : <GenericTable rows={rows} />}
    </div>
  );
}

const TH: React.CSSProperties = {
  padding: '8px 10px',
  color: BRAND, // table-header row → brand accent
  fontWeight: 700,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

function FinancialTable({ rows }: { rows: LooseRow[] }) {
  const showPrior = rows.some((r) => cell(r, 'prior_display', 'prior') != null);
  const showChange = rows.some((r) => cell(r, 'change_pct', 'change') != null);
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: `2px solid ${BRAND}` }}>
          <th style={{ ...TH, textAlign: 'left' }}>Metric</th>
          <th style={{ ...TH, textAlign: 'right' }}>Current</th>
          {showPrior && <th style={{ ...TH, textAlign: 'right' }}>Prior</th>}
          {showChange && <th style={{ ...TH, textAlign: 'right' }}>Change</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ borderBottom: '1px solid #F1F2F6' }}>
            <td style={{ padding: '9px 10px', color: DARK }}>{stringifyCell(cell(r, 'label', 'metric', 'name'))}</td>
            <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: MONO, color: BRAND, fontWeight: 700 }}>
              {stringifyCell(cell(r, 'current_display', 'current', 'value'))}
            </td>
            {showPrior && (
              <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: MONO, color: MUTED }}>
                {stringifyCell(cell(r, 'prior_display', 'prior')) || '—'}
              </td>
            )}
            {showChange && (
              <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                <ChangeCell value={cell(r, 'change_pct', 'change')} dir={cell(r, 'change_direction', 'direction')} />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GenericTable({ rows }: { rows: LooseRow[] }) {
  const cols = Array.from(
    rows.reduce((set, r) => {
      Object.keys(r).forEach((k) => set.add(k));
      return set;
    }, new Set<string>()),
  );
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: `2px solid ${BRAND}` }}>
          {cols.map((c) => (
            <th key={c} style={{ ...TH, textAlign: 'left' }}>{c.replace(/_/g, ' ')}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ borderBottom: '1px solid #F1F2F6' }}>
            {cols.map((c) => (
              <td key={c} style={{ padding: '9px 10px', color: DARK }}>{stringifyCell(r[c])}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ChangeCell({ value, dir }: { value: unknown; dir: unknown }) {
  const pct = typeof value === 'number' ? value : typeof value === 'string' ? parseFloat(value) : null;
  if (pct == null || Number.isNaN(pct)) return <span style={{ color: MUTED }}>—</span>;
  const color = dir === 'up' ? GREEN : dir === 'down' ? RED : MUTED;
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '';
  return (
    <span style={{ color, fontFamily: MONO, fontWeight: 600 }}>
      {arrow} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function isRecord(v: unknown): v is LooseRow {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}
function cell(r: LooseRow, ...keys: string[]): unknown {
  for (const k of keys) if (r[k] != null) return r[k];
  return null;
}
function stringifyCell(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
