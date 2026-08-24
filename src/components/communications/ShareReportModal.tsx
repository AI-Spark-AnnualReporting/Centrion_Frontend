import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import {
  communications,
  ApiError,
  type CommunicationMember,
  type ShareReportResponse,
  type ThreadReport,
} from '@/lib/api';
import { SECTION_LABEL } from './helpers';
import { AttachedReportCard } from './AttachedReportCard';

/* Share-for-review modal.

   The four authority cards are NOT backend entities — they're preset
   `assigned_label` strings. A review is always assigned to a real person, so
   each card must resolve to a `users.id` UUID from GET /members before
   "Start review thread" enables.

   POST /reports/{id}/share does everything in one call and returns the full
   review-thread payload, which we hand straight to the caller so the thread
   modal can paint without a second request. */

// ApiError.message already carries the backend's `detail` (or a generic
// message for 429/5xx infra failures) — read it rather than re-parsing
// `err.body.detail` directly, which would bypass that sanitization.
function detailMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message || fallback;
  return fallback;
}

export function ShareReportModal({
  reportId,
  report,
  onClose,
  onShared,
}: {
  reportId: string;
  // The report being shared — drives the "Attached report" block.
  report?: ThreadReport;
  onClose: () => void;
  // Receives the full review-thread payload the share call returned.
  onShared?: (payload: ShareReportResponse) => void;
}) {
  const { toast } = useToast();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [members, setMembers] = useState<CommunicationMember[]>([]);
  // The backend rejects assigning a review to yourself (422) — drop yourself
  // from the picker up front instead of letting the user hit that error.
  const assignableMembers = members.filter((m) => m.user_id !== user?.user_id);

  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [comment, setComment] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadMembers = () => {
    setLoading(true);
    setLoadError(null);
    communications
      // Scoped to this report — only people who can open it can review it.
      .members(reportId)
      .then((res) => setMembers(res.members))
      .catch((e) => {
        // 401 → the request layer already ran the session-expired flow.
        if (e instanceof ApiError && e.status === 401) return;
        // 404 ("Report not found") carries a user-facing detail; keep it.
        setLoadError(detailMessage(e, 'Could not load members. Please try again.'));
      })
      .finally(() => setLoading(false));
  };

  useEffect(loadMembers, [reportId]);


  // An authority card is presentation; the assignment is what the API needs.
  const canSubmit = !!assignedTo && !submitting;

  const submit = async () => {
    if (!assignedTo || submitting) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await communications.shareReport(reportId, {
        assigned_to: assignedTo,
        comment: comment.trim() || undefined,
      });
      toast({ title: 'Shared for review', description: 'The reviewer has been notified.' });
      onShared?.(res);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return; // session flow ran
      // 422 (assigned to yourself), 403 (not an active member), 404 (no report)
      // all carry a user-facing detail string.
      setFormError(detailMessage(e, 'Something went wrong. Please try again.'));
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ width: 640 }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '20px 22px 16px' }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 11,
              background: 'linear-gradient(150deg,#5B5BF0,#4040C8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 4px 12px rgba(64,64,200,.28)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 14 14" fill="none">
              <path d="M4.7 6V4.6a2.3 2.3 0 0 1 4.6 0V6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
              <rect x="3" y="6" width="8" height="6" rx="1.3" stroke="#fff" strokeWidth="1.6" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9.5, fontWeight: 800, color: '#9BA3C4', letterSpacing: '.9px' }}>
              SHARE · FOR REVIEW
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#1A1D2E', marginTop: 2, letterSpacing: '-.2px' }}>
              Share for review
            </div>
            <div style={{ fontSize: 12.5, color: '#8890AE', marginTop: 3 }}>
              Choose who signs this off
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              flexShrink: 0,
              width: 28,
              height: 28,
              border: 'none',
              background: 'transparent',
              color: '#9BA3C4',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div style={{ padding: '0 22px 4px', maxHeight: '60vh', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '48px 0' }}>
              <div className="proc-ring" style={{ width: 34, height: 34, borderWidth: 3 }} />
              <div style={{ fontSize: 12, color: '#9BA3C4', fontWeight: 600 }}>Loading members…</div>
            </div>
          ) : loadError ? (
            <div style={{ padding: '40px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: '#DC2626', marginBottom: 12 }}>{loadError}</div>
              <button type="button" className="btn bs" onClick={loadMembers}>
                Retry
              </button>
            </div>
          ) : (
            <>
              {/* The report the review is about — linked, never copied. */}
              {report && (
                <>
                  <div style={SECTION_LABEL}>ATTACHED REPORT</div>
                  <div style={{ marginBottom: 20 }}>
                    <AttachedReportCard report={report} />
                  </div>
                </>
              )}

              {/* The assignment — always a real person. */}
              <div style={SECTION_LABEL}>ASSIGN TO</div>
              {assignableMembers.length === 0 ? (
                <div style={{ fontSize: 12.5, color: '#8890AE', lineHeight: 1.5, marginBottom: 20 }}>
                  No one in your company has access to this report yet — an admin can grant it in
                  Admin Console.
                </div>
              ) : (
              <select
                className="inp"
                value={assignedTo ?? ''}
                onChange={(e) => {
                  setAssignedTo(e.target.value || null);
                  if (formError) setFormError(null);
                }}
                style={{ marginBottom: 20 }}
              >
                <option value="">Choose a person…</option>
                {assignableMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name} · {m.display_role}
                  </option>
                ))}
              </select>
              )}

              <div style={SECTION_LABEL}>COMMENT (OPTIONAL)</div>
              <textarea
                className="inp"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Please review and sign off ahead of publication."
                style={{ minHeight: 84, resize: 'vertical', lineHeight: 1.5 }}
              />

              {formError && (
                <div style={{ fontSize: 11.5, fontWeight: 600, marginTop: 7, color: '#DC2626' }}>{formError}</div>
              )}
              {!formError && !assignedTo && assignableMembers.length > 0 && (
                <div style={{ fontSize: 11.5, fontWeight: 600, marginTop: 7, color: '#9BA3C4' }}>
                  Choose a person to assign the review to.
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '18px 22px 20px' }}>
          <button type="button" className="btn bs" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn bp"
            style={{ gap: 7, opacity: canSubmit ? 1 : 0.55, cursor: canSubmit ? 'pointer' : 'not-allowed' }}
            disabled={!canSubmit}
            onClick={submit}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M12.5 1.5L6 8M12.5 1.5L8.3 12.5l-2.3-4.5L1.5 5.7 12.5 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
            {submitting ? 'Starting…' : 'Start review thread'}
          </button>
        </div>
      </div>
    </div>
  );
}
