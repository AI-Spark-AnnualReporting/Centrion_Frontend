// The "Report status" rail card — a dot, Approved/Draft, and the approval date.
//
// Extracted from PublishBar so the quarterly assembled report shows the same
// card the earnings preview does. Kept as one component rather than two
// hardcoded copies: report-status.ts already records what happened last time a
// status indicator was duplicated instead of shared.

const INK = '#1A1D2E';
const MUTED = '#5A6080';
const FAINT = '#9BA3C4';
const ACCENT = '#4040C8';
const APPROVED_GREEN = '#10B981';

// "2026-07-30T09:16:44Z" → "Jul 30, 2026". Null for a missing/unparseable
// timestamp so the caller falls back rather than printing "Invalid Date".
export function formatApprovedDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function ReportStatusCard({
  approved,
  approvedAt,
  className = 'card',
}: {
  approved: boolean;
  // When present, the status line reads "· approved <date>" instead of the
  // generic "· final & locked" — pass null when the backend hasn't supplied a
  // real approval timestamp, never fabricate one.
  approvedAt?: string | null;
  className?: string;
}) {
  const date = formatApprovedDate(approvedAt);
  return (
    <div className={className} style={{ padding: '14px 16px' }}>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: '.6px',
          textTransform: 'uppercase',
          color: FAINT,
          marginBottom: 10,
        }}
      >
        Report status
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: '50%',
            background: approved ? APPROVED_GREEN : ACCENT,
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>{approved ? 'Approved' : 'Draft'}</span>
        <span style={{ fontSize: 12, color: MUTED, marginLeft: 2 }}>
          {approved ? (date ? `· approved ${date}` : '· final & locked') : '· editing in progress'}
        </span>
      </div>
    </div>
  );
}
