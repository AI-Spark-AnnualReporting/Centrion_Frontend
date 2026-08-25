// Consensus vs Actual: what landed, what was expected, and the verdict.
//
// Its own component rather than a mode inside FigureLedger. The shapes diverge too
// far to share honestly — this one has an input column, a verdict column, and no
// unit hoisting, because a row's actual and its expectation share a unit and the
// section as a whole may not.
//
// Every row takes an expectation and almost none of them will get one. A row nobody
// forecast keeps its actual and shows an em dash for the rest: present, and visibly
// unanswered. Hiding it would lose a real figure and a zero would invent a forecast.

import { useEffect, useState } from 'react';
import type { EarningsSectionFigure } from '@/types/earnings';
import { beatMiss, verdictLabel, surpriseLabel } from './beatMiss';
import { INK, MUTED, FAINT, BORDER_SOFT, DANGER } from './tokens';

const GREEN = '#15803D';

function figureText(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function unitLabel(unit: string | null): string {
  return unit ? unit.replace(/_/g, ' ').toLowerCase() : '';
}

function ExpectedInput({
  figure,
  onSave,
}: {
  figure: EarningsSectionFigure;
  onSave: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState(
    figure.expected_value == null ? '' : String(figure.expected_value),
  );

  // A save that failed, or a value changed elsewhere, has to land here rather than
  // being held out by stale local state.
  useEffect(() => {
    setDraft(figure.expected_value == null ? '' : String(figure.expected_value));
  }, [figure.expected_value]);

  const commit = () => {
    const text = draft.trim();
    if (text === '') {
      if (figure.expected_value != null) onSave(null);
      return;
    }
    const n = Number(text.replace(/,/g, ''));
    if (!Number.isFinite(n)) {
      // Not a number is not an expectation. Put back what was there rather than
      // storing something nobody meant.
      setDraft(figure.expected_value == null ? '' : String(figure.expected_value));
      return;
    }
    if (n !== figure.expected_value) onSave(n);
  };

  return (
    <input
      aria-label={`Expected ${figure.display_label}`}
      inputMode="decimal"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(figure.expected_value == null ? '' : String(figure.expected_value));
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder="—"
      style={{
        width: 104,
        textAlign: 'right',
        border: `1px solid ${BORDER_SOFT}`,
        borderRadius: 7,
        padding: '4px 8px',
        fontFamily: "'DM Mono', monospace",
        fontSize: 12.5,
        color: INK,
        background: '#fff',
      }}
    />
  );
}

export function ConsensusLedger({
  figures,
  onSetExpected,
  onRemove,
}: {
  figures: EarningsSectionFigure[];
  onSetExpected: (figureId: string, value: number | null) => void;
  onRemove: (figureId: string) => void;
}) {
  if (figures.length === 0) return null;

  const answered = figures.filter((f) => f.expected_value != null).length;

  const TH: React.CSSProperties = {
    padding: '0 2px 7px',
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: '.7px',
    textTransform: 'uppercase',
    color: FAINT,
  };

  return (
    <div style={{ marginTop: 14 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${BORDER_SOFT}` }}>
            <th style={{ ...TH, textAlign: 'left' }}>Line</th>
            <th style={{ ...TH, textAlign: 'right' }}>Actual</th>
            <th style={{ ...TH, textAlign: 'right' }}>Expected</th>
            <th style={{ ...TH, textAlign: 'right', minWidth: 132 }}>Result</th>
            <th style={{ ...TH, width: 20 }} aria-hidden />
          </tr>
        </thead>
        <tbody>
          {figures.map((f) => {
            const bm = beatMiss(f.value, f.expected_value ?? null);
            const colour =
              bm?.verdict === 'beat' ? GREEN : bm?.verdict === 'miss' ? DANGER : MUTED;
            return (
              <tr key={f.id} style={{ borderBottom: `1px solid #F1F2F6` }}>
                <td style={{ padding: '7px 2px', fontSize: 12.5, color: INK }}>
                  {f.display_label}
                </td>
                <td
                  style={{
                    padding: '7px 2px',
                    textAlign: 'right',
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 12.5,
                    fontWeight: 500,
                    color: INK,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {figureText(f.value)}
                  {f.unit && (
                    <span style={{ color: FAINT, fontSize: 11 }}> {unitLabel(f.unit)}</span>
                  )}
                </td>
                <td style={{ padding: '7px 2px', textAlign: 'right' }}>
                  <ExpectedInput figure={f} onSave={(v) => onSetExpected(f.id, v)} />
                </td>
                <td
                  style={{
                    padding: '7px 2px',
                    textAlign: 'right',
                    fontSize: 12,
                    fontWeight: 700,
                    color: colour,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {/* Nothing at all until somebody says what they expected. */}
                  {bm ? (
                    <>
                      {verdictLabel(bm.verdict)}{' '}
                      <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 500 }}>
                        {surpriseLabel(bm.pct)}
                      </span>
                    </>
                  ) : (
                    <span style={{ color: FAINT, fontWeight: 400 }}>—</span>
                  )}
                </td>
                <td style={{ padding: '7px 2px', textAlign: 'right' }}>
                  <button
                    type="button"
                    aria-label={`Remove ${f.display_label}`}
                    onClick={() => onRemove(f.id)}
                    className="fig-remove"
                    style={{
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      color: FAINT,
                      fontSize: 15,
                      lineHeight: 1,
                      padding: '2px 3px',
                    }}
                  >
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div
        style={{
          padding: '8px 2px 0',
          fontSize: 11,
          color: MUTED,
          fontFamily: "'DM Mono', monospace",
        }}
      >
        {figures.length} {figures.length === 1 ? 'line' : 'lines'} ·{' '}
        {answered} with an expectation
      </div>
    </div>
  );
}
