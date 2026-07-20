import { useState } from 'react';
import type { EarningsProducedSection, EarningsApproveBlocker, EarningsExportFormat } from '@/types/earnings';
import { INK, MUTED, FAINT, ACCENT, DANGER } from './tokens';

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
  sections,
  details,
  locked,
  blockers,
  approving,
  onApprove,
  onExport,
}: {
  sections: EarningsProducedSection[];
  details?: { label: string; value: string }[];
  locked: boolean;
  blockers: EarningsApproveBlocker[] | null;
  approving: boolean;
  onApprove: () => void;
  onExport: (format: EarningsExportFormat) => Promise<void>;
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

  const included = sections.filter((s) => s.included);

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
            {locked ? '· final & locked' : '· editing in progress'}
          </span>
        </div>
      </div>

      {/* Included sections (read-only; inclusion is set on the Outline step) */}
      <div className="card" style={{ padding: '14px 16px' }}>
        <SectionHeader>Included sections</SectionHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {included.map((s) => (
            <div key={s.section_code} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
                <rect width="16" height="16" rx="4" fill={ACCENT} />
                <path d="M4.5 8.2l2.2 2.2 4.8-4.8" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span style={{ fontSize: 12.5, color: INK }}>{s.title}</span>
            </div>
          ))}
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

      {/* Export */}
      <div className="card" style={{ padding: '14px 16px' }}>
        <SectionHeader>Export</SectionHeader>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn bs" style={{ flex: 1 }} onClick={() => void runExport('pdf')} disabled={exporting !== null}>
            {exporting === 'pdf' ? 'Preparing…' : '⬇ PDF'}
          </button>
          <button className="btn bs" style={{ flex: 1 }} onClick={() => void runExport('docx')} disabled={exporting !== null}>
            {exporting === 'docx' ? 'Preparing…' : '⬇ Word'}
          </button>
        </div>
        {exportError && <div style={{ fontSize: 11.5, color: DANGER, marginTop: 8 }}>{exportError}</div>}
      </div>

      {/* Approve & lock */}
      {!locked && (
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
