import type { ProducedSection } from '@/types/quarterly';
import { asStringArray } from '@/components/quarterly/sectionState';

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
// One prior period a comparison table compares against (YoY/QoQ). `key` is
// "yoy"/"qoq"; `label` is the human period, e.g. "Q3 2024".
interface ComparePeriod {
  key: string;
  label: string;
}
interface NormTable {
  title?: string;
  rows: LooseRow[];
  // Explicit column list AND order, for tables whose shape varies per section
  // (governance grids: director profiles, remuneration, meeting attendance —
  // which grows a column per meeting held). Absent → derived from the row keys.
  // Its presence also means the table is NOT a financial statement.
  columns?: string[];
  comparePeriods?: ComparePeriod[]; // present → render one value+change column per period
  currentLabel?: string | null; // header for the current column, e.g. "Q3 2025"
}

function normalizeComparePeriods(v: unknown): ComparePeriod[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .filter(isRecord)
    .map((p) => ({ key: asString(p.key) ?? '', label: asString(p.label) ?? '' }))
    .filter((p) => p.label);
  return out.length ? out : undefined;
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
        columns: asStringArray(t.columns),
      }));
    }
    return [{ rows: parsed.filter(isRecord) as LooseRow[] }];
  }
  if (isRecord(parsed)) {
    if (Array.isArray(parsed.tables)) {
      return (parsed.tables as LooseRow[]).map((t) => ({
        title: asString(t.title),
        rows: Array.isArray(t.rows) ? (t.rows as LooseRow[]) : [],
        columns: asStringArray(t.columns),
      }));
    }
    if (Array.isArray(parsed.rows)) {
      return [{
        title: asString(parsed.title),
        rows: parsed.rows as LooseRow[],
        columns: asStringArray(parsed.columns),
        comparePeriods: normalizeComparePeriods(parsed.compare_periods),
        currentLabel: asString(parsed.current_label) ?? null,
      }];
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
  // An explicit column list settles it: only grids carry one, so a grid with a
  // column literally named "value" can't be misread as a financial statement.
  const financial =
    !table.columns && rows.some((r) => cell(r, 'current_display', 'current', 'value') != null);

  return (
    <div style={{ marginBottom: 24, overflowX: 'auto' }}>
      {showTitle && table.title && (
        <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: BRAND }}>{table.title}</h3>
      )}
      {financial ? (
        <FinancialTable
          rows={rows}
          comparePeriods={table.comparePeriods}
          currentLabel={table.currentLabel}
        />
      ) : (
        <GenericTable rows={rows} columns={table.columns} />
      )}
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

// Header label for a compare period's change column, e.g. "YoY %" / "QoQ %".
function changeHeader(key: string): string {
  if (key === 'yoy') return 'YoY %';
  if (key === 'qoq') return 'QoQ %';
  return `${key.toUpperCase()} %`;
}
// A row's comparison entry for a given period key (from the row's `comparisons`).
function compFor(r: LooseRow, key: string): LooseRow | undefined {
  const arr = cell(r, 'comparisons');
  if (!Array.isArray(arr)) return undefined;
  return (arr as unknown[]).find((c) => isRecord(c) && c.key === key) as LooseRow | undefined;
}

function FinancialTable({
  rows,
  comparePeriods,
  currentLabel,
}: {
  rows: LooseRow[];
  comparePeriods?: ComparePeriod[];
  currentLabel?: string | null;
}) {
  const compare = comparePeriods ?? [];
  const hasCompare = compare.length > 0;
  // Legacy single-prior columns only when there's no per-period comparison data
  // (older produced content / sections that don't compare) — unchanged behavior.
  const showPrior = !hasCompare && rows.some((r) => cell(r, 'prior_display', 'prior') != null);
  const showChange = !hasCompare && rows.some((r) => cell(r, 'change_pct', 'change') != null);
  const currentHeader = currentLabel || 'Current';
  const colCount =
    2 + (hasCompare ? compare.length * 2 : (showPrior ? 1 : 0) + (showChange ? 1 : 0));

  const cellPad = { padding: '9px 10px' } as const;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: `2px solid ${BRAND}` }}>
          <th style={{ ...TH, textAlign: 'left' }}>Metric</th>
          <th style={{ ...TH, textAlign: 'right' }}>{currentHeader}</th>
          {hasCompare
            ? compare.flatMap((p) => [
                <th key={`v-${p.key}`} style={{ ...TH, textAlign: 'right' }}>{p.label}</th>,
                <th key={`c-${p.key}`} style={{ ...TH, textAlign: 'right' }}>{changeHeader(p.key)}</th>,
              ])
            : [
                showPrior ? <th key="prior" style={{ ...TH, textAlign: 'right' }}>Prior</th> : null,
                showChange ? <th key="change" style={{ ...TH, textAlign: 'right' }}>Change</th> : null,
              ]}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          // role: header | line | subtotal | total; indent: 0/1/2 (see statement_layout.py).
          // Rows without these keys (old content) render as plain lines — unchanged.
          const role = String(cell(r, 'role') ?? 'line');
          const indent = Number(cell(r, 'indent') ?? 0) || 0;

          // Group header — a bold brand label spanning the row, no value.
          if (role === 'header') {
            return (
              <tr key={i}>
                <td
                  colSpan={colCount}
                  style={{
                    padding: '16px 10px 6px', color: BRAND, fontWeight: 800, fontSize: 11,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    borderBottom: '1px solid #EDEEF3',
                  }}
                >
                  {stringifyCell(cell(r, 'label', 'metric', 'name'))}
                </td>
              </tr>
            );
          }

          const isTotal = role === 'total' || role === 'subtotal';
          const topBorder = isTotal ? '1px solid #D6D8E0' : undefined;
          return (
            <tr key={i} style={{ borderBottom: '1px solid #F1F2F6' }}>
              <td style={{
                ...cellPad, paddingLeft: 10 + indent * 18, color: DARK,
                fontWeight: isTotal ? 700 : 400, borderTop: topBorder,
              }}>
                {stringifyCell(cell(r, 'label', 'metric', 'name'))}
              </td>
              <td style={{
                ...cellPad, textAlign: 'right', fontFamily: MONO, color: BRAND,
                fontWeight: 700, borderTop: topBorder,
              }}>
                {stringifyCell(cell(r, 'current_display', 'current', 'value'))}
              </td>
              {hasCompare
                ? compare.flatMap((p) => {
                    const c = compFor(r, p.key);
                    return [
                      <td key={`v-${p.key}`} style={{
                        ...cellPad, textAlign: 'right', fontFamily: MONO, color: MUTED,
                        borderTop: topBorder,
                      }}>
                        {stringifyCell(c ? c.prior_display : null) || '—'}
                      </td>,
                      <td key={`c-${p.key}`} style={{ ...cellPad, textAlign: 'right', borderTop: topBorder }}>
                        <ChangeCell value={c ? c.change_pct : null} dir={c ? c.change_direction : null} />
                      </td>,
                    ];
                  })
                : [
                    showPrior ? (
                      <td key="prior" style={{
                        ...cellPad, textAlign: 'right', fontFamily: MONO, color: MUTED, borderTop: topBorder,
                      }}>
                        {stringifyCell(cell(r, 'prior_display', 'prior')) || '—'}
                      </td>
                    ) : null,
                    showChange ? (
                      <td key="change" style={{ ...cellPad, textAlign: 'right', borderTop: topBorder }}>
                        <ChangeCell value={cell(r, 'change_pct', 'change')} dir={cell(r, 'change_direction', 'direction')} />
                      </td>
                    ) : null,
                  ]}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function GenericTable({ rows, columns }: { rows: LooseRow[]; columns?: string[] }) {
  // ponytail: the derived fallback is Object.keys order, which puts integer-like
  // keys ("2024", "2025") first regardless of where they sit in the row. Send an
  // explicit `columns` when order matters; fixing the derivation itself is a
  // bigger diff than the bug and no current payload without `columns` hits it.
  const cols =
    columns ??
    Array.from(
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
