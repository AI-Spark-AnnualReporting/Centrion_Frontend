import type { ReportTone } from '@/types/earnings';
import { EARNINGS_TONES } from './tones';
import { ACCENT, ACCENT_TINT, BORDER } from './tokens';

// Block 3 — report tone. Options + default live in ./tones (component-only file
// keeps fast-refresh happy).

export function ToneSelector({
  value,
  onChange,
}: {
  value: ReportTone | null;
  onChange: (t: ReportTone) => void;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {EARNINGS_TONES.map((t) => {
        const selected = value === t.value;
        return (
          <button
            key={t.value}
            type="button"
            title={t.desc}
            aria-pressed={selected}
            onClick={() => onChange(t.value)}
            style={{
              padding: '9px 16px',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              transition: 'border-color .15s, background .15s, color .15s',
              background: selected ? ACCENT_TINT : '#fff',
              color: selected ? '#2B2B8F' : '#3A3F5C',
              border: `1.5px solid ${selected ? ACCENT : BORDER}`,
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
