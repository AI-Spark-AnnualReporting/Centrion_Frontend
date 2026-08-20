import {
  normalizeTables,
  tryParseJson,
  cell,
  stringifyCell,
  rowBlankState,
  gapReason,
  rowCitation,
  matrixCell,
} from '@/pages/earnings/preview-helpers';
import type { NormTable } from '@/pages/earnings/preview-helpers';
import { INK, MUTED, BRAND } from './tokens';

// ConfidenceBadge's established amber — within-feature consistency.
const GAP_AMBER = { color: '#B45309', bg: 'rgba(245,158,11,.12)' };

// A section the source printed as a GRID — line items down the side, categories
// across the top. Flattened to Metric/Value it became "External revenue —
// Upstream" repeated once per segment: the same table with its shape thrown away
// and three times the rows. The columns come from the producer, which reads them
// off each figure\'s own position in its source table.
function MatrixTable({ table, TH }: { table: NormTable; TH: React.CSSProperties }) {
  const cols = table.matrixColumns ?? [];
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: `2px solid ${BRAND}` }}>
          <th style={{ ...TH, textAlign: 'left' }}>Line item</th>
          {cols.map((c) => (
            <th key={c.key} style={{ ...TH, textAlign: 'right' }}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((r, i) => (
          <tr key={i} style={{ borderBottom: '1px solid #F1F2F6' }}>
            <td style={{ padding: '9px 10px', color: INK }}>
              {stringifyCell(cell(r, 'label', 'metric', 'name'))}
            </td>
            {cols.map((c) => (
              <td
                key={c.key}
                style={{
                  padding: '9px 10px',
                  textAlign: 'right',
                  fontFamily: "'DM Mono', 'Courier New', monospace",
                  color: BRAND,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                {/* A blank cell is information — this line does not exist for
                    that category — so it reads as a dash, not as missing data. */}
                {matrixCell(r, c.key) ?? '—'}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// A section that prints its own named columns, with each row keyed BY those names.
// Consensus vs Actual is the one: Line, Actual, Expected, Result. Rendered here as
// well as in the exporter, from the identical `columns` shape, so what is on screen
// and what is in the PDF cannot drift apart.
//
// Without this branch such a section fell through to the Metric/Value renderer,
// which looks for `label` and `current_display` — found neither, and drew a table of
// blank rows all reading "Pending".
function ColumnsTable({ table, TH }: { table: NormTable; TH: React.CSSProperties }) {
  const cols = table.columns ?? [];
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: `2px solid ${BRAND}` }}>
          {cols.map((c, i) => (
            <th key={c} style={{ ...TH, textAlign: i === 0 ? 'left' : 'right' }}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((r, i) => (
          <tr key={i} style={{ borderBottom: '1px solid #F1F2F6' }}>
            {cols.map((c, ci) => (
              <td
                key={c}
                style={{
                  padding: '9px 10px',
                  textAlign: ci === 0 ? 'left' : 'right',
                  color: ci === 0 ? INK : BRAND,
                  fontWeight: ci === 0 ? 400 : 700,
                  fontFamily: ci === 0 ? undefined : "'DM Mono', 'Courier New', monospace",
                  whiteSpace: ci === 0 ? undefined : 'nowrap',
                }}
              >
                {stringifyCell(r[c]) || '—'}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Renders an earnings table/kpi envelope as Metric | Value — `label` +
// `current_display` ONLY. No Prior/Change columns are ever rendered: earnings data
// has no comparatives, and we never show a fabricated or blank delta column (D-12).
// Operational KPIs (S06): an out-of-catalog row shows its gap reason instead of a
// value, and a still-producing row shows "Pending" — never the same grey dash.
export function SectionTable({ content }: { content: string | null }) {
  const parsed = content ? tryParseJson(content) : undefined;
  if (parsed === undefined) {
    // Not valid JSON — treat as prose upstream; here just show nothing structured.
    return null;
  }
  const tables = normalizeTables(parsed)
    // A grid row has no single value to be blank, so the omitted-row filter is
    // for line-item tables only.
    .map((t) => (t.matrixColumns || t.columns
      ? t
      : { ...t, rows: t.rows.filter((r) => rowBlankState(r) !== 'omitted') }))
    .filter((t) => t.rows.length > 0);
  if (tables.length === 0) {
    return <p style={{ margin: 0, fontSize: 13, color: MUTED }}>No data available for this section.</p>;
  }
  // A Source column only appears when at least one row actually carries a
  // citation — existing sections with no citation fields render unchanged.
  const showSource = tables.some(
    (t) => !t.matrixColumns && !t.columns && t.rows.some((r) => rowCitation(r) != null),
  );

  const TH: React.CSSProperties = {
    padding: '8px 10px',
    color: BRAND,
    fontWeight: 700,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  };

  return (
    <>
      {tables.map((t, ti) => (
        <div key={ti} style={{ marginBottom: 20, overflowX: 'auto' }}>
          {tables.length > 1 && t.title && (
            <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: BRAND }}>{t.title}</h3>
          )}
          {t.columns ? (
            <ColumnsTable table={t} TH={TH} />
          ) : t.matrixColumns ? (
            <MatrixTable table={t} TH={TH} />
          ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${BRAND}` }}>
                <th style={{ ...TH, textAlign: 'left' }}>Metric</th>
                <th style={{ ...TH, textAlign: 'right' }}>Value</th>
                {showSource && <th style={{ ...TH, textAlign: 'left' }}>Source</th>}
              </tr>
            </thead>
            <tbody>
              {t.rows.map((r, i) => {
                const state = rowBlankState(r);
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #F1F2F6' }}>
                    <td style={{ padding: '9px 10px', color: INK }}>
                      {stringifyCell(cell(r, 'label', 'metric', 'name'))}
                    </td>
                    {state === 'gap' ? (
                      <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '3px 9px',
                            borderRadius: 20,
                            fontSize: 10,
                            fontWeight: 700,
                            color: GAP_AMBER.color,
                            background: GAP_AMBER.bg,
                          }}
                        >
                          {gapReason(r) ?? 'Gap'}
                        </span>
                      </td>
                    ) : state === 'pending' ? (
                      <td style={{ padding: '9px 10px', textAlign: 'right', fontStyle: 'italic', color: MUTED }}>
                        Pending
                      </td>
                    ) : (
                      <td
                        style={{
                          padding: '9px 10px',
                          textAlign: 'right',
                          fontFamily: "'DM Mono', 'Courier New', monospace",
                          color: BRAND,
                          fontWeight: 700,
                        }}
                      >
                        {stringifyCell(cell(r, 'current_display', 'current', 'value')) || '—'}
                      </td>
                    )}
                    {showSource && (
                      <td style={{ padding: '9px 10px', color: MUTED, fontSize: 11.5 }}>{rowCitation(r) ?? ''}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          )}
        </div>
      ))}
    </>
  );
}
