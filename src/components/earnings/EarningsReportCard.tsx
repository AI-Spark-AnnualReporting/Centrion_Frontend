import type { EarningsReportSummary } from '@/types/earnings';

// Indigo gradient — product UI stays indigo (D-05); no violet/cyan.
const GRADIENT = 'linear-gradient(135deg,#3535B5,#4747CC)';

// "2026-07-16T10:00:00Z" → "Jul 16, 2026" for the card footer.
function formatGenDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function variantLabel(variant: string): string {
  if (variant === 'annual') return 'Annual';
  if (variant === 'quarterly') return 'Quarterly';
  return variant ? variant.charAt(0).toUpperCase() + variant.slice(1) : 'Earnings';
}

function statusLabel(status: string): string {
  return status
    .split('_')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

// One earnings report tile on the dashboard. Clicking anywhere on the card opens
// the report (the parent decides where — the earnings preview screen).
export function EarningsReportCard({
  report,
  onOpen,
}: {
  report: EarningsReportSummary;
  onOpen: (report: EarningsReportSummary) => void;
}) {
  const generated = formatGenDate(report.generated_at);
  const actionText = `${report.action || 'Open'} →`;

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
      title={`${report.action || 'Open'} this earnings report`}
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
          {report.title || 'Earnings Report'}
        </div>
        <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.05, letterSpacing: '-.5px', marginBottom: 14, position: 'relative' }}>
          {report.period_display}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, position: 'relative' }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 9px', borderRadius: 999, background: 'rgba(255,255,255,.16)' }}>
            {variantLabel(report.variant)}
          </span>
          {report.status && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 9px', borderRadius: 999, background: 'rgba(255,255,255,.16)' }}>
              {statusLabel(report.status)}
            </span>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#4040C8', background: 'rgba(64,64,200,.08)', padding: '4px 10px', borderRadius: 999 }}>
          {actionText}
        </span>
        <span style={{ fontSize: 10, color: '#9BA3C4' }}>
          {generated ? `Generated ${generated}` : 'In progress'}
        </span>
      </div>
    </div>
  );
}
