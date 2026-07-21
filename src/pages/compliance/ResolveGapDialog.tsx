// Confirms marking a hard-gate gap resolved. Modal shell mirrors
// components/quarterly/ApproveConfirmDialog (overlay + centred card + Escape).

import { useEffect, useState } from 'react';
import type { Gap } from '@/types/compliance';
import { DARK, MONO, MUTED, PRIMARY } from './compliance-ui';

export function ResolveGapDialog({
  gap,
  saving = false,
  error,
  onConfirm,
  onClose,
}: {
  gap: Gap;
  saving?: boolean;
  error?: string | null;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mark this hard-gate check resolved?"
      onClick={saving ? undefined : onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1400,
        background: 'rgba(20,22,40,.45)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        animation: 'fade-in .2s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(480px, 100%)',
          background: '#fff',
          borderRadius: 16,
          boxShadow: '0 24px 60px rgba(20,22,40,.28)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '20px 22px 4px' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: DARK }}>
            Mark this hard-gate check resolved?
          </div>

          <div
            style={{
              marginTop: 12,
              padding: '11px 13px',
              borderRadius: 10,
              background: '#FAFBFE',
              border: '1px solid #ECEEF8',
            }}
          >
            <div style={{ fontSize: 11.5, fontFamily: MONO, color: PRIMARY }}>
              {gap.regulator} · {gap.rule_id}
            </div>
            <div style={{ fontSize: 12.5, color: DARK, marginTop: 5, lineHeight: 1.55 }}>
              {gap.finding}
            </div>
          </div>

          <p style={{ margin: '12px 0 0', fontSize: 11.5, color: MUTED, lineHeight: 1.6 }}>
            This is recorded against your account with the reason, and can&apos;t be undone here.
          </p>

          {/* The API rejects a blank reason with a 400, so it's required here. */}
          <label
            style={{
              display: 'block',
              fontSize: 11.5,
              fontWeight: 700,
              color: '#5A6080',
              marginTop: 14,
              marginBottom: 6,
            }}
          >
            Reason <span style={{ color: '#DC2626' }}>*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={saving}
            rows={3}
            placeholder="How was this gap addressed? e.g. Disclosed in the standalone Sustainability Report, section 4.2."
            style={{
              width: '100%',
              padding: '9px 11px',
              borderRadius: 10,
              border: '1.5px solid #E2E4F0',
              fontSize: 12.5,
              color: DARK,
              fontFamily: 'inherit',
              resize: 'vertical',
              outline: 'none',
            }}
          />

          {error && <div style={{ marginTop: 10, fontSize: 12, color: '#DC2626' }}>{error}</div>}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 10,
            padding: '18px 22px',
          }}
        >
          <button
            type="button"
            className="btn bs"
            onClick={onClose}
            disabled={saving}
            style={{ fontSize: 13, padding: '9px 18px' }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn bp"
            onClick={() => onConfirm(reason.trim())}
            disabled={saving || !reason.trim()}
            style={{
              fontSize: 13,
              padding: '10px 22px',
              opacity: saving || !reason.trim() ? 0.5 : 1,
              cursor: saving || !reason.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : 'Yes, mark resolved'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ResolveGapDialog;
