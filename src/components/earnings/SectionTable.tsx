import { normalizeTables, tryParseJson, cell, stringifyCell } from '@/pages/earnings/preview-helpers';
import { INK, MUTED, ACCENT } from './tokens';

// Renders an earnings table/kpi envelope as Metric | Value — `label` +
// `current_display` ONLY. No Prior/Change columns are ever rendered: earnings data
// has no comparatives, and we never show a fabricated or blank delta column (D-12).
export function SectionTable({ content }: { content: string | null }) {
  const parsed = content ? tryParseJson(content) : undefined;
  if (parsed === undefined) {
    // Not valid JSON — treat as prose upstream; here just show nothing structured.
    return null;
  }
  const tables = normalizeTables(parsed).filter((t) => t.rows.length > 0);
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
                <th style={{ ...TH, textAlign: 'left' }}>Metric</th>
                <th style={{ ...TH, textAlign: 'right' }}>Value</th>
              </tr>
            </thead>
            <tbody>
              {t.rows.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #F1F2F6' }}>
                  <td style={{ padding: '9px 10px', color: INK }}>
                    {stringifyCell(cell(r, 'label', 'metric', 'name'))}
                  </td>
                  <td
                    style={{
                      padding: '9px 10px',
                      textAlign: 'right',
                      fontFamily: "'DM Mono', 'Courier New', monospace",
                      color: ACCENT,
                      fontWeight: 700,
                    }}
                  >
                    {stringifyCell(cell(r, 'current_display', 'current', 'value')) || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}
