import {
  normalizeTables,
  tryParseJson,
  cell,
  stringifyCell,
  rowBlankState,
  gapReason,
  rowCitation,
} from '@/pages/earnings/preview-helpers';
import { INK, MUTED, ACCENT } from './tokens';

// ConfidenceBadge's established amber — within-feature consistency.
const GAP_AMBER = { color: '#B45309', bg: 'rgba(245,158,11,.12)' };

// Non-IFRS reconciliation (S15) — reported → adjustments → adjusted, per line,
// cited. A gap row shows its reason instead of guessed/blank values; citation
// renders unconditionally per row (the spec requires "per line, cited" here,
// unlike the plain KPI table where a Source column is optional).
export function ReconciliationTable({ content }: { content: string | null }) {
  const parsed = content ? tryParseJson(content) : undefined;
  if (parsed === undefined) return null;
  const tables = normalizeTables(parsed)
    .map((t) => ({ ...t, rows: t.rows.filter((r) => rowBlankState(r) !== 'omitted') }))
    .filter((t) => t.rows.length > 0);
  if (tables.length === 0) {
    return <p style={{ margin: 0, fontSize: 13, color: MUTED }}>No data available for this section.</p>;
  }

  const TH: React.CSSProperties = {
    padding: '8px 10px',
    color: ACCENT,
    fontWeight: 700,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  };
  const valueStyle: React.CSSProperties = {
    padding: '9px 10px',
    textAlign: 'right',
    fontFamily: "'DM Mono', 'Courier New', monospace",
    color: ACCENT,
    fontWeight: 700,
  };

  return (
    <>
      {tables.map((t, ti) => (
        <div key={ti} style={{ marginBottom: 20, overflowX: 'auto' }}>
          {tables.length > 1 && t.title && (
            <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: ACCENT }}>{t.title}</h3>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${ACCENT}` }}>
                <th style={{ ...TH, textAlign: 'left' }}>Line item</th>
                <th style={{ ...TH, textAlign: 'right' }}>Reported</th>
                <th style={{ ...TH, textAlign: 'right' }}>Adjustments</th>
                <th style={{ ...TH, textAlign: 'right' }}>Adjusted</th>
                <th style={{ ...TH, textAlign: 'left' }}>Source</th>
              </tr>
            </thead>
            <tbody>
              {t.rows.map((r, i) => {
                const state = rowBlankState(r);
                const citation = rowCitation(r);
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #F1F2F6' }}>
                    <td style={{ padding: '9px 10px', color: INK }}>
                      {stringifyCell(cell(r, 'label', 'metric', 'name'))}
                    </td>
                    {state === 'gap' ? (
                      <td colSpan={3} style={{ padding: '9px 10px', textAlign: 'right' }}>
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
                      <td
                        colSpan={3}
                        style={{ padding: '9px 10px', textAlign: 'right', fontStyle: 'italic', color: MUTED }}
                      >
                        Pending
                      </td>
                    ) : (
                      <>
                        <td style={valueStyle}>
                          {stringifyCell(cell(r, 'reported_display', 'reported')) || '—'}
                        </td>
                        <td style={valueStyle}>
                          {stringifyCell(cell(r, 'adjustments_display', 'adjustment_display', 'adjustments')) || '—'}
                        </td>
                        <td style={valueStyle}>
                          {stringifyCell(cell(r, 'adjusted_display', 'adjusted')) || '—'}
                        </td>
                      </>
                    )}
                    <td style={{ padding: '9px 10px', color: MUTED, fontSize: 11.5 }}>{citation ?? ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}
