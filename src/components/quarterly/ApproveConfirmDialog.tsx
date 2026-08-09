import { useEffect } from 'react';

const DARK = '#1A1D2E';
const MUTED = '#6B7280';

// Confirms the one-way approve/lock action on the Assembled Report screen.
// Mirrors CoverTemplatePicker's modal shell (overlay + centered card + Escape-to-close).
export function ApproveConfirmDialog({
  approving = false,
  error,
  onConfirm,
  onClose,
  title = 'Approve and lock this report?',
  confirmLabel = 'Approve & Lock',
  children,
}: {
  approving?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
  /** Defaults keep the original quarterly wording. */
  title?: string;
  confirmLabel?: string;
  /** Rendered under the copy — the board flow lists its approval blockers here. */
  children?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !approving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, approving]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={approving ? undefined : onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1400,
        background: 'rgba(20,22,40,.45)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        animation: 'fade-in .2s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(460px, 100%)',
          background: '#fff', borderRadius: 16,
          boxShadow: '0 24px 60px rgba(20,22,40,.28)', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '20px 22px 4px' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: DARK }}>{title}</div>
          <p style={{ margin: '10px 0 0', fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
            By approving, you confirm the report content is final. After this you will{' '}
            <strong>NOT</strong> be able to edit any section, regenerate content, or change the
            outline. The report will be locked and available for export.
          </p>
          {children}
          {error && <div style={{ marginTop: 10, fontSize: 12, color: '#DC2626' }}>{error}</div>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '18px 22px' }}>
          <button type="button" className="btn bs" onClick={onClose} disabled={approving} style={{ fontSize: 13, padding: '9px 18px' }}>
            Cancel
          </button>
          <button
            type="button"
            className="btn bp"
            onClick={onConfirm}
            disabled={approving}
            style={{ fontSize: 13, padding: '10px 22px', opacity: approving ? 0.6 : 1 }}
          >
            {approving ? 'Approving…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
