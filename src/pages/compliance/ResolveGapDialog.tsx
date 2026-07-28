// Confirms marking a hard-gate gap resolved. Modal shell mirrors
// components/quarterly/ApproveConfirmDialog (overlay + centred card + Escape).

import { useEffect, useRef, useState } from 'react';
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
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const isHard = gap.gate === 'HARD';
  // Resolving a gap is an audit event recorded against the user's account, so
  // it doesn't happen without a stated justification — confirming alone isn't
  // enough. This is what holds the Yes button shut.
  const canConfirm = reason.trim().length > 0 && !saving;

  // The reason is the only thing to fill in, so start in it.
  useEffect(() => {
    reasonRef.current?.focus();
  }, []);

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
      aria-label={isHard ? 'Mark this hard-gate check resolved?' : 'Mark this check resolved?'}
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
            {isHard ? 'Mark this hard-gate check resolved?' : 'Mark this check resolved?'}
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
            {isHard
              ? 'This clears a hard-gate check that is currently blocking publication. It’s recorded against your account and can’t be undone here.'
              : 'This is recorded against your account and can’t be undone here.'}
          </p>

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
            ref={reasonRef}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={saving}
            rows={3}
            required
            aria-required="true"
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
          {/* Says why the button is dead, so a disabled control isn't a puzzle. */}
          {!reason.trim() && (
            <div style={{ marginTop: 6, fontSize: 11, color: MUTED }}>
              A reason is required — it’s recorded in the audit trail.
            </div>
          )}

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
            disabled={!canConfirm}
            title={reason.trim() ? undefined : 'Add a reason to continue'}
            style={{
              fontSize: 13,
              padding: '10px 22px',
              opacity: canConfirm ? 1 : 0.5,
              cursor: canConfirm ? 'pointer' : 'not-allowed',
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
