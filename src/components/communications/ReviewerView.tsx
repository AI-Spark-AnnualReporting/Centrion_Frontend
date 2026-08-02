import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import {
  communications,
  earnings,
  ApiError,
  type CommunicationMember,
  type ReviewComment,
  type ReviewViewResponse,
} from '@/lib/api';
import type { EarningsProducedSection } from '@/types/earnings';
import { SectionRenderer } from '@/components/earnings/SectionRenderer';
import { initials, relativeTime } from './helpers';

/* Reviewer screen — the "Open as reviewer" destination.

   Any company member may READ this (a creator watching their report get
   reviewed sees can_act: false); only the write calls are restricted:
     can_act     → you are the assigned reviewer (reassign / request changes)
     can_approve → additionally requires the report to be in review

   Approve is rendered DISABLED, not hidden, when can_act && !can_approve.

   Section bodies: the review payload carries metadata only (id/order/title),
   where `id` is the earnings `section_code` verbatim ("s01_cover"). The content
   comes from earnings.getEarningsSections() and is paired on that code. The
   review list is the source of truth — it returns only the ticked sections
   (e.g. 11 of 19), so iterating it drops the extras for free. Any section
   without a content match still renders its heading and Add comment. */

// FastAPI {"detail": "…"} strings are written to be shown to the user as-is.
function detailMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const detail = (err.body as { detail?: unknown } | null)?.detail;
    if (typeof detail === 'string' && detail) return detail;
  }
  return fallback;
}

// Report-level comments come back under the JSON key "null".
const REPORT_LEVEL_KEY = 'null';

const ICON_SHARE = (
  <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
    <circle cx="13.4" cy="4.2" r="2.1" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="4.6" cy="9" r="2.1" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="13.4" cy="13.8" r="2.1" stroke="currentColor" strokeWidth="1.5" />
    <path d="M6.5 7.9l5-2.6M6.5 10.1l5 2.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const ICON_COMMENT = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M12 8.4a1.4 1.4 0 0 1-1.4 1.4H4.3L1.9 12V3.1a1.4 1.4 0 0 1 1.4-1.4h7.3A1.4 1.4 0 0 1 12 3.1v5.3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

const RAIL_LABEL: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: '.6px',
  textTransform: 'uppercase',
  color: '#8890AE',
  marginBottom: 10,
};

function CommentRow({ comment, showSection }: { comment: ReviewComment; showSection?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 9, padding: '9px 0', borderTop: '1px solid #F4F5FB' }}>
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          flexShrink: 0,
          background: comment.author.is_you ? 'linear-gradient(150deg,#5B5BF0,#4040C8)' : '#EEEEFF',
          color: comment.author.is_you ? '#fff' : '#4040C8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          fontWeight: 800,
        }}
      >
        {comment.author.initials || initials(comment.author.full_name)}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#1A1D2E' }}>
            {comment.author.full_name}
            {comment.author.is_you && ' (you)'}
          </span>
          <span style={{ fontSize: 10.5, color: '#9BA3C4' }}>{relativeTime(comment.created_at)}</span>
          {comment.resolved && <span className="badge b-gy">Resolved</span>}
        </div>
        {showSection && comment.section_title && (
          <div style={{ fontSize: 10.5, fontWeight: 700, color: '#7C3AED', marginTop: 2 }}>
            {comment.section_title}
          </div>
        )}
        <div style={{ fontSize: 12, color: '#3A4066', marginTop: 3, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {comment.body}
        </div>
      </div>
    </div>
  );
}

export function ReviewerView({
  threadId,
  onClose,
  onBack,
  onChanged,
}: {
  threadId: string;
  onClose: () => void;
  // Back chevron — returns to the thread modal. Falls back to onClose.
  onBack?: () => void;
  // Fired after approve / request-changes / reassign so the parent re-fetches.
  onChanged?: () => void;
}) {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReviewViewResponse | null>(null);

  // Which section's composer is open. `null` = the report-level composer.
  const [composerFor, setComposerFor] = useState<string | null | undefined>(undefined);
  const [commentBody, setCommentBody] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  const [members, setMembers] = useState<CommunicationMember[]>([]);
  const [reassignTo, setReassignTo] = useState<string>('');
  const [reassigning, setReassigning] = useState(false);

  // Report body, keyed by section_code (== the review payload's section.id).
  const [bodies, setBodies] = useState<Record<string, EarningsProducedSection>>({});
  const [coverTemplateKey, setCoverTemplateKey] = useState<string | null>(null);

  // Approve / request-changes note panels.
  const [panel, setPanel] = useState<'approve' | 'send_back' | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await communications.reviewView(threadId);
      setData(res);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return; // session flow ran
      setError(detailMessage(e, 'Could not load the review. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  // The reassign dropdown needs the member list.
  useEffect(() => {
    communications
      .members()
      .then((r) => setMembers(r.members))
      .catch(() => {});
  }, []);

  // Pull the report body once we know the report id. Company-scoped on the
  // backend, so a non-owner reviewer can read it. Non-earnings report types
  // simply won't resolve here — the headings still render without a body.
  const reportId = data?.report?.id;
  useEffect(() => {
    if (!reportId) return;
    let cancelled = false;
    earnings
      .getEarningsSections(reportId)
      .then((res) => {
        if (cancelled) return;
        const byCode: Record<string, EarningsProducedSection> = {};
        for (const s of res.sections) byCode[s.section_code] = s;
        setBodies(byCode);
        setCoverTemplateKey(res.cover_template_key);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  const bySection = data?.comments_by_section ?? {};
  const reportLevel = data?.comments_by_section?.[REPORT_LEVEL_KEY] ?? [];
  const allComments = data?.comments ?? [];

  const openComposer = (sectionId: string | null) => {
    setComposerFor(sectionId);
    setCommentBody('');
  };

  const postComment = async (sectionId: string | null, sectionTitle: string | null) => {
    const body = commentBody.trim();
    if (!body || postingComment) return;
    setPostingComment(true);
    try {
      await communications.addReviewComment(threadId, {
        // Omit both for a report-level comment; the backend fills in the title.
        section_id: sectionId ?? undefined,
        section_title: sectionId ? (sectionTitle ?? undefined) : undefined,
        body,
      });
      setCommentBody('');
      setComposerFor(undefined);
      await load(); // re-read so counts and grouping stay authoritative
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      toast({ title: detailMessage(e, 'Could not post the comment.'), variant: 'destructive' });
    } finally {
      setPostingComment(false);
    }
  };

  const runReassign = async () => {
    if (!reassignTo || reassigning) return;
    setReassigning(true);
    setActionError(null);
    try {
      const res = await communications.reassignReview(threadId, { assigned_to: reassignTo });
      toast({ title: 'Review reassigned', description: `Now with ${res.full_name}.` });
      setReassignTo('');
      // The caller is no longer the reviewer — re-read rather than guess.
      await load();
      onChanged?.();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      setActionError(detailMessage(e, 'Could not reassign the review.'));
    } finally {
      setReassigning(false);
    }
  };

  const runPanelAction = async () => {
    if (busy || !panel) return;
    // Send-back's note is required (422 if blank) — gate it here too.
    if (panel === 'send_back' && !note.trim()) {
      setActionError('Add a note explaining what needs to change.');
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      if (panel === 'approve') {
        const res = await communications.approveReview(threadId, note.trim() || undefined);
        toast({ title: 'Report approved', description: res.status_label });
      } else {
        const res = await communications.sendBackReview(threadId, note.trim());
        toast({ title: 'Sent back to the creator', description: res.status_label });
      }
      setPanel(null);
      setNote('');
      await load();
      onChanged?.();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      setActionError(detailMessage(e, 'Something went wrong. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const report = data?.report;
  const assignment = data?.assignment ?? null;
  const assignedName = assignment ? (assignment.label ?? assignment.full_name) : null;
  const canAct = data?.can_act ?? false;
  const canApprove = data?.can_approve ?? false;
  const sections = data?.sections ?? [];
  // Once the report is approved (or otherwise finished) the review is over —
  // reassign / request-changes no longer make sense even though the backend
  // still reports can_act. Gate the reviewer actions on the review being open.
  const FINISHED_STATUSES = ['approved', 'locked', 'published', 'complete', 'completed'];
  const reviewClosed = !!report && FINISHED_STATUSES.includes(report.status);

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{ alignItems: 'stretch', justifyContent: 'stretch', padding: 10 }}
    >
      <div
        className="modal-content"
        style={{
          width: '100%',
          maxWidth: 'none',
          height: '100%',
          maxHeight: 'none',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 20px', borderBottom: '1px solid #ECEEF8' }}>
          <button
            type="button"
            onClick={onBack ?? onClose}
            aria-label="Back to thread"
            style={{
              flexShrink: 0,
              width: 32,
              height: 32,
              borderRadius: 9,
              border: '1.5px solid #E5E7EF',
              background: '#fff',
              color: '#5A6080',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M10 3.5L5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              flexShrink: 0,
              background: '#EDEAFB',
              color: '#5B34D6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {ICON_SHARE}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: '#1A1D2E', letterSpacing: '-.2px' }}>Review report</div>
            <div style={{ fontSize: 12, color: '#8890AE', marginTop: 1 }}>
              {!assignedName ? (
                'Unassigned'
              ) : assignment?.is_you ? (
                <>
                  Reviewing as <span style={{ fontWeight: 800, color: '#5A6080' }}>{assignedName}</span>
                </>
              ) : (
                // You're not the assignee — don't imply you are. Name who is.
                <>
                  Viewing · assigned to <span style={{ fontWeight: 800, color: '#5A6080' }}>{assignedName}</span>
                </>
              )}
            </div>
          </div>
          {report && (
            <span
              style={{
                flexShrink: 0,
                padding: '5px 13px',
                borderRadius: 20,
                background: '#FEF3C7',
                color: '#B45309',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {report.status_label}
            </span>
          )}
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
            <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <div className="proc-ring" style={{ width: 34, height: 34, borderWidth: 3 }} />
            <div style={{ fontSize: 12, color: '#9BA3C4', fontWeight: 600 }}>Loading review…</div>
          </div>
        ) : error ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <div style={{ fontSize: 13, color: '#DC2626' }}>{error}</div>
            <button type="button" className="btn bs" onClick={() => void load()}>
              Retry
            </button>
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px' }}>
            {/* Report + sections */}
            <div style={{ overflowY: 'auto', padding: '18px 24px 24px', background: '#F4F5FA', minWidth: 0 }}>
              <div
                style={{
                  padding: '13px 16px',
                  borderRadius: 10,
                  background: '#EFEDFC',
                  fontSize: 12.5,
                  color: '#4A5170',
                  lineHeight: 1.6,
                  marginBottom: 16,
                }}
              >
                Read the report below. Click <strong>Add comment</strong> on any section to leave a note or
                requested change. When you're done, approve it or send it back to the creator.
              </div>

              {sections.length === 0 && (
                <div
                  className="card"
                  style={{ padding: '28px 20px', textAlign: 'center', fontSize: 13, color: '#8890AE', marginBottom: 12 }}
                >
                  This report has no generated sections yet — leave a comment on the report as a whole below.
                </div>
              )}

              {sections.map((s) => {
                const comments = bySection[s.id] ?? [];
                const open = composerFor === s.id;
                // section.id is the earnings section_code verbatim.
                const body = bodies[s.id];
                return (
                  <div key={s.id} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 10 }}>
                      <span
                        style={{
                          minWidth: 24,
                          height: 24,
                          padding: '0 7px',
                          borderRadius: 7,
                          flexShrink: 0,
                          background: '#E6E7F5',
                          color: '#5A6080',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 11.5,
                          fontWeight: 800,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {s.order}
                      </span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 15.5, fontWeight: 800, color: '#1A1D2E' }}>
                        {s.title}
                      </span>
                      {comments.length > 0 && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minWidth: 18,
                            height: 18,
                            padding: '0 5px',
                            borderRadius: 6,
                            background: '#F1ECFF',
                            color: '#7C3AED',
                            fontSize: 11,
                            fontWeight: 800,
                          }}
                        >
                          {comments.length}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => (open ? setComposerFor(undefined) : openComposer(s.id))}
                        style={{
                          flexShrink: 0,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 7,
                          padding: '7px 13px',
                          borderRadius: 9,
                          border: '1.5px solid #E5E7EF',
                          background: '#fff',
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: '#4A5170',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        <span style={{ color: '#7C3AED', display: 'inline-flex' }}>{ICON_COMMENT}</span>
                        {open ? 'Cancel' : 'Add comment'}
                      </button>
                    </div>

                    {/* Section body — paired on section_code. */}
                    <div className="card" style={{ padding: '18px 22px' }}>
                      {body ? (
                        <SectionRenderer section={body} coverTemplateKey={coverTemplateKey} />
                      ) : (
                        <div style={{ fontSize: 12.5, color: '#9BA3C4', fontStyle: 'italic' }}>
                          This section hasn't been generated yet.
                        </div>
                      )}

                      {comments.map((c) => (
                        <CommentRow key={c.id} comment={c} />
                      ))}

                      {open && (
                        <div style={{ marginTop: 12 }}>
                          <textarea
                            className="inp"
                            value={commentBody}
                            onChange={(e) => setCommentBody(e.target.value)}
                            placeholder={`Comment on ${s.title}…`}
                            style={{ minHeight: 68, resize: 'vertical', lineHeight: 1.5 }}
                          />
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                            <button
                              type="button"
                              className="btn bp"
                              style={{ padding: '6px 12px', fontSize: 12, opacity: commentBody.trim() && !postingComment ? 1 : 0.55 }}
                              disabled={!commentBody.trim() || postingComment}
                              onClick={() => void postComment(s.id, s.title)}
                            >
                              {postingComment ? 'Posting…' : 'Post comment'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Report-level comments (section_id: null) */}
              <div className="card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 800, color: '#1A1D2E' }}>
                    On the report as a whole
                  </span>
                  {reportLevel.length > 0 && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: 18,
                        height: 18,
                        padding: '0 5px',
                        borderRadius: 6,
                        background: '#F1ECFF',
                        color: '#7C3AED',
                        fontSize: 11,
                        fontWeight: 800,
                      }}
                    >
                      {reportLevel.length}
                    </span>
                  )}
                  <button
                    type="button"
                    className="btn bs"
                    style={{ padding: '6px 11px', fontSize: 12 }}
                    onClick={() => (composerFor === null ? setComposerFor(undefined) : openComposer(null))}
                  >
                    {composerFor === null ? 'Cancel' : 'Add comment'}
                  </button>
                </div>

                {reportLevel.map((c) => (
                  <CommentRow key={c.id} comment={c} />
                ))}

                {composerFor === null && (
                  <div style={{ marginTop: 10 }}>
                    <textarea
                      className="inp"
                      value={commentBody}
                      onChange={(e) => setCommentBody(e.target.value)}
                      placeholder="Comment on the report…"
                      style={{ minHeight: 68, resize: 'vertical', lineHeight: 1.5 }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                      <button
                        type="button"
                        className="btn bp"
                        style={{ padding: '6px 12px', fontSize: 12, opacity: commentBody.trim() && !postingComment ? 1 : 0.55 }}
                        disabled={!commentBody.trim() || postingComment}
                        onClick={() => void postComment(null, null)}
                      >
                        {postingComment ? 'Posting…' : 'Post comment'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right rail */}
            <div
              style={{
                borderLeft: '1px solid #ECEEF8',
                overflowY: 'auto',
                padding: '18px 18px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              {/* Assignment + reassign */}
              <div className="card" style={{ padding: '14px 16px' }}>
                <div style={RAIL_LABEL}>Assignment</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      flexShrink: 0,
                      background: 'linear-gradient(150deg,#7C5CFF,#5B34D6)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11.5,
                      fontWeight: 800,
                    }}
                  >
                    {assignedName ? initials(assignedName) : '—'}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800, color: '#1A1D2E' }}>
                      {assignedName ?? 'Unassigned'}
                      {assignment?.is_you && ' (you)'}
                    </span>
                    <span style={{ display: 'block', fontSize: 11.5, color: '#8890AE' }}>Current reviewer</span>
                  </span>
                </div>

                {canAct && !reviewClosed && (
                  <>
                    <div style={{ ...RAIL_LABEL, marginTop: 16 }}>Reassign to</div>
                    <select
                      className="inp"
                      value={reassignTo}
                      onChange={(e) => setReassignTo(e.target.value)}
                      style={{ width: '100%' }}
                    >
                      <option value="">Choose a person…</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.full_name} · {m.display_role}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn bs"
                      style={{ width: '100%', marginTop: 8, gap: 7, opacity: reassignTo && !reassigning ? 1 : 0.55 }}
                      disabled={!reassignTo || reassigning}
                      onClick={() => void runReassign()}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2 12L12 2M8.4 2H12v3.6M5.6 12H2V8.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {reassigning ? 'Reassigning…' : 'Reassign review'}
                    </button>
                  </>
                )}
              </div>

              {/* Comments */}
              <div className="card" style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ ...RAIL_LABEL, marginBottom: 0 }}>Comments</span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 18,
                      height: 18,
                      padding: '0 5px',
                      borderRadius: 6,
                      background: '#F1ECFF',
                      color: '#7C3AED',
                      fontSize: 11,
                      fontWeight: 800,
                    }}
                  >
                    {allComments.length}
                  </span>
                </div>
                {allComments.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#9BA3C4', textAlign: 'center', padding: '18px 6px', lineHeight: 1.5 }}>
                    No comments yet. Click “Add comment” on a section.
                  </div>
                ) : (
                  allComments.map((c) => <CommentRow key={c.id} comment={c} showSection />)
                )}
              </div>

              {/* Actions. Order matters: a finished report is "review complete"
                  for everyone (the backend also flips can_act to false), so check
                  that before the not-the-reviewer messaging. */}
              {reviewClosed ? (
                <div
                  style={{
                    marginTop: 'auto',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '13px 15px',
                    borderRadius: 12,
                    background: '#ECFDF3',
                    border: '1px solid #C7EED8',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                    <circle cx="10" cy="10" r="8.4" fill="#16A34A" />
                    <path d="M6.4 10.2l2.4 2.4 4.8-4.8" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#15803D' }}>
                      Review complete
                    </span>
                    <span style={{ display: 'block', fontSize: 12, color: '#3F9E66', marginTop: 2, lineHeight: 1.5 }}>
                      This report has been {report?.status_label?.toLowerCase() ?? 'approved'}. No further review
                      actions are available.
                    </span>
                  </span>
                </div>
              ) : !canAct ? (
                assignment?.is_you ? (
                  // The payload says this assignment is yours, yet the server withheld
                  // the action gate on an open review — surface that rather than the
                  // generic read-only line.
                  <div style={{ fontSize: 12, color: '#B45309', lineHeight: 1.5, marginTop: 'auto' }}>
                    You're the assigned reviewer, but the review actions aren't available for this
                    report right now. Try reloading — if it persists, ask an admin to re-share it.
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#8890AE', lineHeight: 1.5, marginTop: 'auto' }}>
                    You're viewing this review. Only the assigned reviewer can approve, reassign, or request
                    changes.
                  </div>
                )
              ) : (
                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {panel && (
                    <div className="card" style={{ padding: '12px 14px' }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1A1D2E', marginBottom: 8 }}>
                        {panel === 'approve' ? 'Approve report' : 'Request changes'}
                      </div>
                      <textarea
                        className="inp"
                        value={note}
                        onChange={(e) => {
                          setNote(e.target.value);
                          if (actionError) setActionError(null);
                        }}
                        placeholder={
                          panel === 'approve' ? 'Sign-off note (optional)' : 'What needs to change? (required)'
                        }
                        style={{ minHeight: 76, resize: 'vertical', lineHeight: 1.5 }}
                      />
                      {actionError && (
                        <div style={{ fontSize: 11.5, fontWeight: 600, color: '#DC2626', marginTop: 7 }}>
                          {actionError}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button
                          type="button"
                          className="btn bs"
                          style={{ flex: 1 }}
                          onClick={() => {
                            setPanel(null);
                            setNote('');
                            setActionError(null);
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn bp"
                          style={{
                            flex: 1,
                            opacity: busy || (panel === 'send_back' && !note.trim()) ? 0.6 : 1,
                          }}
                          disabled={busy || (panel === 'send_back' && !note.trim())}
                          onClick={() => void runPanelAction()}
                        >
                          {busy ? 'Working…' : panel === 'approve' ? 'Approve' : 'Send back'}
                        </button>
                      </div>
                    </div>
                  )}

                  {!panel && actionError && (
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: '#DC2626' }}>{actionError}</div>
                  )}

                  {/* The triggers hide while a panel is open — the open panel
                      already carries its own Approve / Send back button. */}
                  {!panel && (
                    <>
                      <button
                        type="button"
                        className="btn bp"
                        style={{
                          width: '100%',
                          gap: 8,
                          padding: '12px 16px',
                          opacity: canApprove ? 1 : 0.5,
                          cursor: canApprove ? 'pointer' : 'not-allowed',
                        }}
                        disabled={!canApprove}
                        onClick={() => {
                          setPanel('approve');
                          setNote('');
                          setActionError(null);
                        }}
                      >
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                          <path d="M3.5 8.4l3 3 6-6.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Approve report
                      </button>
                      {!canApprove && (
                        <div style={{ fontSize: 11.5, color: '#8890AE', lineHeight: 1.45 }}>
                          Available once the report is in review.
                        </div>
                      )}

                      <button
                        type="button"
                        className="btn bs"
                        style={{ width: '100%', gap: 8, padding: '12px 16px' }}
                        onClick={() => {
                          setPanel('send_back');
                          setNote('');
                          setActionError(null);
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M9.5 1.9l2.6 2.6-7 7-3.1.5.5-3.1 7-7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                        </svg>
                        Request changes &amp; reassign
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
