import { useState } from 'react';
import type { EarningsApproveBlocker, EarningsExportFormat } from '@/types/earnings';
import { INK, MUTED, FAINT, ACCENT, DANGER } from './tokens';

// "2026-07-30T09:16:44Z" → "Jul 30, 2026" (mirrors EarningsReportCard's date format).
function formatApprovedDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
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
      {children}
    </div>
  );
}

// Right-hand publish panel: status, read-only included list, optional report
// details, export (PDF/Word), and approve-and-lock with a blocker list on 409.
export function PublishBar({
  details,
  locked,
  approvedAt,
  blockers,
  approving,
  onApprove,
  onExport,
  onOpenCoverPicker,
  showApprove = true,
}: {
  details?: { label: string; value: string }[];
  locked: boolean;
  // When present, the status line reads "Approved <date>" instead of the
  // generic "final & locked" — omit (or pass null) when the backend hasn't
  // supplied a real approval timestamp, never fabricate one.
  approvedAt?: string | null;
  blockers: EarningsApproveBlocker[] | null;
  approving: boolean;
  onApprove: () => void;
  onExport: (format: EarningsExportFormat) => Promise<void>;
  // Opens the cover-design + brand-color picker. Omitted → the card is hidden.
  onOpenCoverPicker?: () => void;
  // Show the Approve & lock action. Earnings hides it in favour of "Share for
  // review" (in the review panel) as the primary publish action.
  showApprove?: boolean;
}) {
  const [exporting, setExporting] = useState<EarningsExportFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const runExport = async (format: EarningsExportFormat) => {
    setExporting(format);
    setExportError(null);
    try {
      await onExport(format);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Status */}
      <div className="card" style={{ padding: '14px 16px' }}>
        <SectionHeader>Report status</SectionHeader>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: locked ? '#10B981' : ACCENT,
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>
            {locked ? 'Approved' : 'Draft'}
          </span>
          <span style={{ fontSize: 12, color: MUTED, marginLeft: 2 }}>
            {locked
              ? formatApprovedDate(approvedAt ?? null)
                ? `· approved ${formatApprovedDate(approvedAt ?? null)}`
                : '· final & locked'
              : '· editing in progress'}
          </span>
        </div>
      </div>

      {/* Optional report details (rendered only when the page supplies them) */}
      {details && details.length > 0 && (
        <div className="card" style={{ padding: '14px 16px' }}>
          <SectionHeader>Report details</SectionHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {details.map((d) => (
              <div key={d.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontSize: 12, color: MUTED }}>{d.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: INK, textAlign: 'right' }}>{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cover design & brand colors — editable until the report is locked. */}
      {onOpenCoverPicker && !locked && (
        <div className="card" style={{ padding: '14px 16px' }}>
          <SectionHeader>Cover &amp; colors</SectionHeader>
          <p style={{ margin: '0 0 10px', fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>
            Choose a cover design and brand colors for the exported report.
          </p>
          <button className="btn bs" style={{ width: '100%' }} onClick={onOpenCoverPicker}>
            Choose cover &amp; colors
          </button>
        </div>
      )}

      {/* Export — only once the report is approved & locked; exporting a draft
          would hand out a document that can still change under it. */}
      {locked && (
        <div className="card" style={{ padding: '14px 16px' }}>
          <SectionHeader>Export</SectionHeader>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn bp" style={{ flex: 1 }} onClick={() => void runExport('pdf')} disabled={exporting !== null}>
              {exporting === 'pdf' ? 'Preparing…' : '⬇ PDF'}
            </button>
            <button className="btn bp" style={{ flex: 1 }} onClick={() => void runExport('docx')} disabled={exporting !== null}>
              {exporting === 'docx' ? 'Preparing…' : '⬇ Word'}
            </button>
          </div>
          {exportError && <div style={{ fontSize: 11.5, color: DANGER, marginTop: 8 }}>{exportError}</div>}
        </div>
      )}

      {/* Approve & lock */}
      {showApprove && !locked && (
        <div>
          <button
            className="btn bp"
            style={{ width: '100%', opacity: approving ? 0.6 : 1 }}
            onClick={onApprove}
            disabled={approving}
          >
            {approving ? 'Approving…' : 'Approve & lock'}
          </button>
          {blockers && blockers.length > 0 && (
            <div
              role="alert"
              style={{
                marginTop: 10,
                padding: '12px 14px',
                borderRadius: 8,
                background: '#FEF2F2',
                border: '1px solid #FECACA',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: '#DC2626', marginBottom: 6 }}>
                Resolve before approving:
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {blockers.map((b, i) => (
                  <li key={i} style={{ fontSize: 12, color: '#B91C1C' }}>
                    {b.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
