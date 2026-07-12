/**
 * Compliance Snapshot — static/hardcoded for now (no compliance-score API exists yet).
 * Values and layout mirror the mockup; the card is the wide left tile of the row.
 */

const ACCENT = '#4040C8';

const BARS: { label: string; value: number; color: string }[] = [
  { label: 'Annual report', value: 88, color: '#16A34A' },
  { label: 'GRI alignment', value: 72, color: '#3B52E0' },
  { label: 'ISSB / TCFD', value: 61, color: '#E8A33D' },
  { label: 'Vision 2030', value: 81, color: '#16A34A' },
  { label: 'Governance', value: 79, color: '#7C3AED' },
];

// Relative bar heights (%) for the Revenue 2020–2025 mini chart; 2025 is highlighted.
const REVENUE: { year: string; height: number; highlight?: boolean }[] = [
  { year: '2020', height: 34 },
  { year: '2021', height: 46 },
  { year: '2022', height: 58 },
  { year: '2023', height: 66 },
  { year: '2024', height: 60 },
  { year: '2025', height: 100, highlight: true },
];

export function ComplianceSnapshotCard() {
  return (
    <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3B52E0', flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.6px', textTransform: 'uppercase', color: '#5A6080' }}>Compliance Snapshot</span>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: ACCENT }}>Full report →</span>
      </div>
      <div style={{ height: 1, background: '#ECEEF8', margin: '12px 0 16px' }} />

      {/* Score bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {BARS.map((b) => (
          <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#3A3F58', minWidth: 108, flexShrink: 0 }}>{b.label}</span>
            <div style={{ flex: 1, height: 6, borderRadius: 999, background: '#EEF0F6', overflow: 'hidden' }}>
              <div style={{ width: `${b.value}%`, height: '100%', background: b.color, borderRadius: 999 }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#1A1D2E', minWidth: 24, textAlign: 'right' }}>{b.value}</span>
          </div>
        ))}
      </div>

      {/* Revenue 2020–2025 mini chart */}
      <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid #ECEEF8' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', color: '#9BA3C4', marginBottom: 12 }}>Revenue 2020–2025</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 90 }}>
          {REVENUE.map((r) => (
            <div key={r.year} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
              <div
                style={{
                  width: '100%',
                  maxWidth: 56,
                  height: `${r.height}%`,
                  borderRadius: 6,
                  background: r.highlight ? '#16A34A' : 'rgba(22,163,74,.16)',
                }}
              />
              <span style={{ fontSize: 10, fontWeight: 600, color: r.highlight ? '#16A34A' : '#9BA3C4' }}>{r.year}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ComplianceSnapshotCard;
