import type { BoardReportSummary } from '@/types/board';

// One board report tile on the setup screen. Mirrors EarningsReportCard's design
// — a copy rather than a shared component, because that one is typed to
// EarningsReportSummary and reads variant/generated_at/action, none of which the
// board API sends. Generalising over two shapes costs more than this.

// Indigo gradient — product UI stays indigo; no violet/cyan.
const GRADIENT = 'linear-gradient(135deg,#3535B5,#4747CC)';

// "2026-07-16T10:00:00Z" → "Jul 16, 2026" for the card footer.
function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// "FY-2025" → "FY 2025"; anything else passes through.
function periodDisplay(period: string): string {
  return period?.replace(/^FY-/, 'FY ') || 'Board Report';
}

function titleCase(s: string): string {
  return s
    .split('_')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

const CHIP: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: '4px 9px',
  borderRadius: 999,
  background: 'rgba(255,255,255,.16)',
};

export function BoardReportCard({
  report,
  onOpen,
}: {
  report: BoardReportSummary;
  onOpen: (report: BoardReportSummary) => void;
}) {
  const locked = report.status !== 'draft';
  const action = locked ? 'View' : 'Continue';
  const updated = formatDate(report.updated_at);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(report)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(report);
        }
      }}
      title={`${action} this board report`}
      style={{
        background: '#fff',
        borderRadius: 14,
        overflow: 'hidden',
        border: '1px solid #E2E4F0',
        display: 'flex',
        flexDirection: 'column',
        cursor: 'pointer',
        transition: 'transform .15s ease, box-shadow .15s ease',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 22px rgba(26,29,46,.08)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = 'none';
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
      }}
    >
      {/* Gradient header */}
      <div style={{ background: GRADIENT, padding: '20px 20px 22px', color: '#fff', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -34, right: -34, width: 124, height: 124, borderRadius: '50%', background: 'rgba(255,255,255,.08)' }} />
        <div style={{ position: 'absolute', bottom: -48, right: 26, width: 84, height: 84, borderRadius: '50%', background: 'rgba(255,255,255,.05)' }} />
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.8, marginBottom: 10, position: 'relative' }}>
          Board Report
        </div>
        <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.05, letterSpacing: '-.5px', marginBottom: 14, position: 'relative' }}>
          {periodDisplay(report.period)}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, position: 'relative' }}>
          <span style={CHIP}>
            {report.issuer_profile?.issuer_type === 'bank' ? 'Bank' : 'Non-financial'}
          </span>
          {report.status && <span style={CHIP}>{titleCase(report.status)}</span>}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#4040C8', background: 'rgba(64,64,200,.08)', padding: '4px 10px', borderRadius: 999 }}>
          {action} →
        </span>
        <span style={{ fontSize: 10, color: '#9BA3C4' }}>{updated ? `Updated ${updated}` : ''}</span>
      </div>
    </div>
  );
}
