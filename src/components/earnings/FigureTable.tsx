import { useMemo } from 'react';
import type { EarningsFigure } from '@/types/earnings';
import { isFlagged, confidenceTier, formatFigureValue, formatDelta, deltaTone } from '@/pages/earnings/helpers';
import { ConfidenceBadge } from './ConfidenceBadge';
import { EditableValueCell } from './EditableValueCell';
import { INK, MUTED, FAINT, ACCENT } from './tokens';

// Fixed column widths (sum 100%) → even, predictable spacing regardless of content.
const COLS = [
  { key: 'metric', label: 'Metric', width: '20%', align: 'left' as const },
  { key: 'value', label: 'Value', width: '15%', align: 'left' as const },
  { key: 'prior', label: 'Prior', width: '12%', align: 'right' as const },
  { key: 'delta', label: 'Δ / YoY', width: '12%', align: 'right' as const },
  { key: 'period', label: 'Period', width: '11%', align: 'left' as const },
  { key: 'source', label: 'Source', width: '15%', align: 'left' as const },
  { key: 'confidence', label: 'Confidence', width: '15%', align: 'right' as const },
];

const TH: React.CSSProperties = {
  padding: '9px 16px',
  color: ACCENT,
  fontWeight: 700,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
  position: 'sticky',
  top: 0,
  background: '#FAFBFF',
};
const TD: React.CSSProperties = { padding: '11px 16px', color: INK, fontSize: 13, verticalAlign: 'top' };
const EDGE_L: React.CSSProperties = { paddingLeft: 24 };
const EDGE_R: React.CSSProperties = { paddingRight: 24 };

const DELTA_COLOR: Record<'up' | 'down' | 'flat', string> = { up: '#16A34A', down: '#DC2626', flat: MUTED };

function sourceText(f: EarningsFigure): string {
  if (f.is_derived) return `Derived · ${f.derivation ?? 'formula'}`;
  const parts = [f.source_label, f.source_ref].filter(Boolean) as string[];
  return parts.length ? parts.join(' · ') : '—';
}

// Sort key for confidence, highest first. Rows without a score (manual edits /
// needs-input) sink to the bottom.
function confSortKey(f: EarningsFigure): number {
  return f.confidence != null ? f.confidence : -1;
}

// Block 2 — the extracted financial data table.
export function FigureTable({
  figures,
  onSaveValue,
}: {
  figures: EarningsFigure[];
  onSaveValue: (figureId: string, value: number) => Promise<void>;
}) {
  // Highest confidence at the top, lowest at the bottom.
  const sorted = useMemo(
    () => [...figures].sort((a, b) => confSortKey(b) - confSortKey(a)),
    [figures],
  );

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ overflow: 'auto', maxHeight: 480 }}>
        <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: 13 }}>
          <colgroup>
            {COLS.map((c) => (
              <col key={c.key} style={{ width: c.width }} />
            ))}
          </colgroup>
          <thead>
            <tr style={{ borderBottom: `2px solid ${ACCENT}`, background: '#FAFBFF' }}>
              {COLS.map((c, i) => (
                <th
                  key={c.key}
                  style={{
                    ...TH,
                    textAlign: c.align,
                    ...(i === 0 ? EDGE_L : {}),
                    ...(i === COLS.length - 1 ? EDGE_R : {}),
                  }}
                  title={
                    c.key === 'confidence'
                      ? 'How confident the AI extraction is that this figure was read correctly from your source documents (0–100%).'
                      : undefined
                  }
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((f) => {
              const flagged = isFlagged(f.confidence, f.edited);
              const tier = confidenceTier(f.confidence, f.flag);
              const rowBg = flagged
                ? tier === 'red'
                  ? 'rgba(239,68,68,.045)'
                  : 'rgba(245,158,11,.05)'
                : '#fff';
              return (
                <tr key={f.id} style={{ borderBottom: '1px solid #F1F2F6', background: rowBg }}>
                  <td style={{ ...TD, ...EDGE_L }}>
                    <div style={{ fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.label}</div>
                    <div style={{ fontSize: 10.5, color: FAINT, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.metric_key}</div>
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
                  <td style={{ ...TD, color: MUTED, fontStyle: f.is_derived ? 'italic' : 'normal', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {sourceText(f)}
                  </td>
                  <td style={{ ...TD, ...EDGE_R, textAlign: 'right' }}>
                    <ConfidenceBadge confidence={f.confidence} flag={f.flag} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* What the confidence score is + why some rows are flagged. */}
      <div
        style={{
          padding: '11px 24px',
          borderTop: '1px solid #F1F2F6',
          fontSize: 11.5,
          color: MUTED,
          lineHeight: 1.6,
          display: 'flex',
          gap: 8,
          alignItems: 'flex-start',
          background: '#FCFCFE',
        }}
      >
        <span
          aria-hidden
          style={{
            flexShrink: 0,
            width: 15,
            height: 15,
            borderRadius: '50%',
            background: 'rgba(64,64,200,.12)',
            color: ACCENT,
            fontSize: 10,
            fontWeight: 800,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 1,
          }}
        >
          i
        </span>
        <span>
          <strong style={{ color: INK, fontWeight: 700 }}>Confidence</strong> is how sure the AI
          extraction is that each figure was read correctly from your source documents (0–100%).
          Anything below 90% is flagged for review — click a value to correct it.
        </span>
      </div>
    </div>
  );
}
