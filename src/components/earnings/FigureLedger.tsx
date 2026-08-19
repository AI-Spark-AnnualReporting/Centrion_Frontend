// A section's chosen figures, in the form these numbers actually take in the
// document they came from.
//
// Not a list with a number on the right. A statement extract: the unit hoisted
// into a column header so it stops repeating on every row, labels left, values
// right-aligned in DM Mono so digits and decimal points line up down the column,
// and each group captioned with the source table it was read from. The company's
// own workbook already tells us all of that — it just was not being shown.

import type { EarningsSectionFigure } from '@/types/earnings';
import { INK, MUTED, FAINT, BORDER_SOFT, DANGER } from './tokens';

// "SAR_million" is how the parser stores it; nobody writes it that way.
function unitLabel(unit: string | null): string {
  if (!unit) return '';
  return unit.replace(/_/g, ' ').toLowerCase();
}

// Statements right-align on the decimal, so every row needs the same number of
// them. Whole numbers stay whole — 1,355,276 not 1,355,276.00.
function figureText(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function FigureLedger({
  figures,
  onRemove,
  animate = false,
}: {
  figures: EarningsSectionFigure[];
  onRemove: (figureId: string) => void;
  /** Stagger the rows in on the beat after a search. Off for a plain re-render. */
  animate?: boolean;
}) {
  if (figures.length === 0) return null;

  // Group by the table each line was read from. One group is the common case and
  // renders without a caption — a caption that never varies is just noise.
  const groups = new Map<string, EarningsSectionFigure[]>();
  for (const f of figures) {
    const key = f.table ?? 'Other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f);
  }
  const multi = groups.size > 1;

  // The unit belongs in the header when the whole section shares one, which is
  // almost always. Mixed units fall back to showing it per row.
  const units = new Set(figures.map((f) => unitLabel(f.unit)).filter(Boolean));
  const sharedUnit = units.size === 1 ? [...units][0] : null;

  let row = 0;

  return (
    <div style={{ marginTop: 14 }}>
      {/* Column header. The rule sits under it and nowhere else — statements rule
          the head and the total, not every line. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          padding: '0 2px 7px',
          borderBottom: `1px solid ${BORDER_SOFT}`,
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: '.7px',
          textTransform: 'uppercase',
          color: FAINT,
        }}
      >
        <span>Line</span>
        <span style={{ fontFamily: "'DM Mono', monospace", letterSpacing: '.4px' }}>
          {sharedUnit || 'Value'}
        </span>
      </div>

      {[...groups.entries()].map(([table, rows]) => (
        <div key={table}>
          {multi && (
            <div
              style={{
                fontSize: 9.5,
                fontWeight: 600,
                letterSpacing: '.6px',
                textTransform: 'uppercase',
                color: FAINT,
                fontFamily: "'DM Mono', monospace",
                padding: '11px 2px 4px',
              }}
            >
              {table}
            </div>
          )}
          {rows.map((f) => {
            const i = row++;
            return (
              <div
                key={f.id}
                className={animate ? 'analysis-rise' : undefined}
                style={{
                  // Rows arrive in reading order rather than all at once — the
                  // eye follows the column down as it fills.
                  ...(animate ? { animationDelay: `${Math.min(i, 12) * 34}ms` } : null),
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 14,
                  padding: '7px 2px',
                  borderBottom: `1px solid ${BORDER_SOFT}`,
                }}
              >
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 12.5,
                    color: INK,
                    lineHeight: 1.4,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {f.display_label}
                </span>

                {!multi && f.table && (
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: 9,
                      fontWeight: 600,
                      letterSpacing: '.5px',
                      textTransform: 'uppercase',
                      color: FAINT,
                      fontFamily: "'DM Mono', monospace",
                    }}
                  >
                    {f.table}
                  </span>
                )}

                <span
                  style={{
                    flexShrink: 0,
                    minWidth: 116,
                    textAlign: 'right',
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 12.5,
                    fontWeight: 500,
                    color: INK,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {figureText(f.value)}
                  {!sharedUnit && f.unit && (
                    <span style={{ color: FAINT, fontSize: 11 }}> {unitLabel(f.unit)}</span>
                  )}
                </span>

                <button
                  type="button"
                  aria-label={`Remove ${f.display_label}`}
                  onClick={() => onRemove(f.id)}
                  className="fig-remove"
                  style={{
                    flexShrink: 0,
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    color: FAINT,
                    fontSize: 15,
                    lineHeight: 1,
                    padding: '2px 3px',
                    borderRadius: 5,
                    transition: 'color .12s, background .12s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = DANGER;
                    e.currentTarget.style.background = 'rgba(229,72,77,.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = FAINT;
                    e.currentTarget.style.background = 'none';
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      ))}

      <div
        style={{
          padding: '8px 2px 0',
          fontSize: 11,
          color: MUTED,
          fontFamily: "'DM Mono', monospace",
        }}
      >
        {figures.length} {figures.length === 1 ? 'line' : 'lines'}
        {multi && ` · ${groups.size} tables`}
      </div>
    </div>
  );
}
