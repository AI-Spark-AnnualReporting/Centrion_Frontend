import type { EarningsFigure } from '@/types/earnings';
import { isFlagged, confidenceTier, formatFigureValue, formatDelta, deltaTone } from '@/pages/earnings/helpers';
import { ConfidenceBadge } from './ConfidenceBadge';
import { EditableValueCell } from './EditableValueCell';
import { INK, MUTED, FAINT, ACCENT } from './tokens';

const TH: React.CSSProperties = {
  padding: '8px 10px',
  color: ACCENT,
  fontWeight: 700,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
};
const TD: React.CSSProperties = { padding: '11px 10px', color: INK, fontSize: 13, verticalAlign: 'top' };

// Mirrors ConfidenceBadge's own green/red hexes — within-feature consistency,
// not quarterly's slightly different palette.
const DELTA_COLOR: Record<'up' | 'down' | 'flat', string> = { up: '#16A34A', down: '#DC2626', flat: MUTED };

// Source column text: derived rows show "Derived · <formula>"; others show
// "<doc label> · <ref>".
function sourceText(f: EarningsFigure): string {
  if (f.is_derived) return `Derived · ${f.derivation ?? 'formula'}`;
  const parts = [f.source_label, f.source_ref].filter(Boolean) as string[];
  return parts.length ? parts.join(' · ') : '—';
}

// Block 2 — the extracted financial data table.
export function FigureTable({
  figures,
  onSaveValue,
}: {
  figures: EarningsFigure[];
  onSaveValue: (figureId: string, value: number) => Promise<void>;
}) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ overflow: 'auto', maxHeight: 480 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${ACCENT}`, background: '#FAFBFF' }}>
              <th style={{ ...TH, textAlign: 'left', position: 'sticky', top: 0, background: '#FAFBFF' }}>Metric</th>
              <th style={{ ...TH, textAlign: 'left', position: 'sticky', top: 0, background: '#FAFBFF' }}>Value</th>
              <th style={{ ...TH, textAlign: 'right', position: 'sticky', top: 0, background: '#FAFBFF' }}>Prior</th>
              <th style={{ ...TH, textAlign: 'right', position: 'sticky', top: 0, background: '#FAFBFF' }}>Δ / YoY</th>
              <th style={{ ...TH, textAlign: 'left', position: 'sticky', top: 0, background: '#FAFBFF' }}>Period</th>
              <th style={{ ...TH, textAlign: 'left', position: 'sticky', top: 0, background: '#FAFBFF' }}>Source</th>
              <th style={{ ...TH, textAlign: 'right', position: 'sticky', top: 0, background: '#FAFBFF' }}>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {figures.map((f) => {
              const flagged = isFlagged(f.confidence, f.edited);
              const tier = confidenceTier(f.confidence, f.flag);
              const rowBg = flagged
                ? tier === 'red'
                  ? 'rgba(239,68,68,.045)'
                  : 'rgba(245,158,11,.05)'
                : '#fff';
              return (
                <tr key={f.id} style={{ borderBottom: '1px solid #F1F2F6', background: rowBg }}>
                  <td style={{ ...TD }}>
                    <div style={{ fontWeight: 700, color: INK }}>{f.label}</div>
                    <div style={{ fontSize: 10.5, color: FAINT, marginTop: 2 }}>{f.metric_key}</div>
                  </td>
                  <td style={{ ...TD }}>
                    <EditableValueCell figure={f} onSave={(v) => onSaveValue(f.id, v)} />
                  </td>
                  <td style={{ ...TD, textAlign: 'right', color: MUTED }}>
                    {formatFigureValue(f.prior_value, f.unit)}
                  </td>
                  <td style={{ ...TD, textAlign: 'right', fontWeight: 700 }}>
                    {(() => {
                      const tone = deltaTone(f.change_pct, f.comparative_status);
                      return (
                        <span style={{ color: tone ? DELTA_COLOR[tone] : MUTED }}>
                          {formatDelta(f.change_pct, f.comparative_status)}
                        </span>
                      );
                    })()}
                  </td>
                  <td style={{ ...TD, color: MUTED }}>{f.period ?? '—'}</td>
                  <td style={{ ...TD, color: MUTED, fontStyle: f.is_derived ? 'italic' : 'normal' }}>
                    {sourceText(f)}
                  </td>
                  <td style={{ ...TD, textAlign: 'right' }}>
                    <ConfidenceBadge confidence={f.confidence} flag={f.flag} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '10px 14px', borderTop: '1px solid #F1F2F6', fontSize: 11.5, color: FAINT }}>
        Values below 90% confidence are flagged for review — click a value to correct it.
      </div>
    </div>
  );
}
