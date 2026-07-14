import type { EarningsVariant } from '@/types/earnings';
import { INK, MUTED, ACCENT, ACCENT_TINT, BORDER } from './tokens';

// Block 1 — report-type toggle. Two single-select cards.
const OPTIONS: { value: EarningsVariant; title: string; desc: string }[] = [
  { value: 'annual', title: 'Annual Earnings Report', desc: 'Full-year performance across four quarters' },
  { value: 'quarterly', title: 'Quarterly Earnings Report', desc: 'Single-quarter earnings snapshot' },
];

export function ReportTypeToggle({
  value,
  onChange,
}: {
  value: EarningsVariant | null;
  onChange: (v: EarningsVariant) => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {OPTIONS.map((o) => {
        const selected = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(o.value)}
            style={{
              textAlign: 'left',
              padding: '16px 18px',
              borderRadius: 14,
              cursor: 'pointer',
              background: selected ? ACCENT_TINT : '#fff',
              border: `1.5px solid ${selected ? ACCENT : BORDER}`,
              transition: 'border-color .15s, background .15s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span
                aria-hidden
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  flexShrink: 0,
                  border: `2px solid ${selected ? ACCENT : '#C9CDE4'}`,
                  background: selected ? ACCENT : '#fff',
                  boxShadow: selected ? `inset 0 0 0 3px #fff` : 'none',
                }}
              />
              <span style={{ fontSize: 14, fontWeight: 800, color: selected ? '#2B2B8F' : INK }}>
                {o.title}
              </span>
            </div>
            <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.45, marginLeft: 24 }}>{o.desc}</div>
          </button>
        );
      })}
    </div>
  );
}
