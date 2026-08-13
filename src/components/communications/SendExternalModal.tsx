import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { communications, companies, ApiError, type ComposeRecipient } from '@/lib/api';
import type { Company } from '@/types/company';
import { RecipientChip } from './RecipientChip';
import { RichTextEditor, openAnchorFromEvent } from './RichTextEditor';
import { SECTION_LABEL, companyDomain } from './helpers';

/* "Send externally" — available on any open thread (ad-hoc or report-based).
   Same write/preview layout as ExternalEmailModal (the report-centric
   History → Email sends compose flow) — two columns, rich-text editor, live
   branded "what the investor receives" preview — so the two don't look like
   different products. What's intentionally different: no report to attach
   (this endpoint has no attachment concept), no draft-saving or scheduling
   (send-external is a one-shot send, not the same trackable/draftable object
   EmailSendSavePayload rows are), and the body is pre-filled from the
   thread's latest message rather than a report blurb.

   The body is composed as rich HTML for the live preview (visual parity with
   the other modal), but sent to the backend as plain text — the thread's own
   messages are plain text and the send-external `body` field mirrors that,
   so formatting marks are stripped at send time rather than risking raw HTML
   tags landing in the email. */

type ComposeRow = { id: string; name: string; org?: string | null; contact?: string | null; email?: string | null };

const ICON_GRID = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="2.5" y="2.5" width="4.2" height="4.2" rx="1" stroke="currentColor" strokeWidth="1.3" />
    <rect x="9.3" y="2.5" width="4.2" height="4.2" rx="1" stroke="currentColor" strokeWidth="1.3" />
    <rect x="2.5" y="9.3" width="4.2" height="4.2" rx="1" stroke="currentColor" strokeWidth="1.3" />
    <rect x="9.3" y="9.3" width="4.2" height="4.2" rx="1" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Rich HTML (from the editor) → plain text for the actual send payload.
// Paragraph/line breaks survive as newlines; formatting marks don't.
function htmlToPlainText(html: string): string {
  const withBreaks = html
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n');
  const text = new DOMParser().parseFromString(withBreaks, 'text/html').body.textContent ?? '';
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

export function SendExternalModal({
  threadId,
  defaultSubject,
  onClose,
  onSent,
}: {
  threadId: string;
  defaultSubject: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [subject, setSubject] = useState(defaultSubject);
  // `defaultSubject` is only ever a caller's best guess — the row-level
  // "External" button seeds it from the list-summary row (ThreadSummary),
  // which can be stale/incomplete. Once the full thread detail loads below,
  // it overwrites this with the authoritative value, unless the user has
  // already started editing (tracked via a ref so the async .then always
  // reads the live value, not a stale closure).
  const subjectTouchedRef = useRef(false);

  // Company profile — enriches the preview (name, city, sender domain), same
  // as ExternalEmailModal.
  const [company, setCompany] = useState<Company | null>(null);
  useEffect(() => {
    let cancelled = false;
    companies
      .getMyCompany()
      .then((c) => {
        if (!cancelled) setCompany(c);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const initialCompanyName = user?.company_name ?? 'Your company';
  const companyName = company?.name ?? initialCompanyName;
  const city = company?.headquarter_city ?? null;
  const senderEmail = `investor.relations@${companyDomain(company, companyName)}`;

  const [recipients, setRecipients] = useState<ComposeRow[]>([]);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const makeRecipient = (value: string): ComposeRow => ({
    id: `r-${recipients.length}-${value}`,
    name: value,
    email: value.includes('@') ? value : null,
  });
  const addRecipient = () => {
    const value = draft.trim();
    if (!value) {
      setAdding(false);
      return;
    }
    setRecipients((prev) => [...prev, makeRecipient(value)]);
    setDraft('');
  };
  // The input only commits on Enter/blur — flush it here so a typed-but-uncommitted
  // address isn't silently dropped when the user goes straight for Send.
  const commitPendingRecipient = () => {
    const value = draft.trim();
    if (!value) return recipients;
    const next = [...recipients, makeRecipient(value)];
    setRecipients(next);
    setDraft('');
    setAdding(false);
    return next;
  };
  const removeRecipient = (id: string) => setRecipients((prev) => prev.filter((r) => r.id !== id));
  const recipientsLine = recipients.map((r) => r.email ?? r.name).join(', ');

  // Body — pre-filled from the thread's latest message. `editorKey` remounts
  // RichTextEditor (uncontrolled) once the async fetch resolves, same pattern
  // ExternalEmailModal uses to re-seed after a draft loads.
  const [bodyHtml, setBodyHtml] = useState('');
  const [bodyLoading, setBodyLoading] = useState(true);
  const [editorKey, setEditorKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    communications
      .getThread(threadId)
      .then((detail) => {
        if (cancelled) return;
        const text = detail.messages[detail.messages.length - 1]?.body ?? '';
        setBodyHtml(text ? `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>` : '');
        setEditorKey((k) => k + 1);
        if (!subjectTouchedRef.current) {
          const authoritative = detail.thread.report
            ? detail.thread.report.title
            : detail.thread.subject?.trim() || defaultSubject;
          setSubject(authoritative);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setBodyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const subjectEmpty = subject.trim().length === 0;
  const recipientsEmpty = recipients.length === 0 && draft.trim().length === 0;

  const send = async () => {
    if (subjectEmpty || sending) return;
    const finalRecipients = commitPendingRecipient();
    if (finalRecipients.length === 0) {
      setFormError('Add at least one recipient.');
      return;
    }
    setSending(true);
    setFormError(null);
    try {
      const plainBody = htmlToPlainText(bodyHtml);
      const res = await communications.sendExternal(threadId, {
        subject: subject.trim(),
        recipients: finalRecipients.map(
          (r): ComposeRecipient => ({ name: r.name, org: r.org ?? null, contact: r.contact ?? null, email: r.email ?? null }),
        ),
        audience_label: 'Investors',
        body: plainBody ? plainBody : undefined,
      });
      if (res.delivery_status === 'failed') {
        toast({ title: 'Could not deliver the email', variant: 'destructive' });
      } else {
        toast({
          title: 'Sent externally',
          description: `${res.recipient_count} recipient${res.recipient_count === 1 ? '' : 's'}`,
        });
      }
      onSent();
      onClose();
    } catch (e) {
      if (!(e instanceof ApiError)) {
        setFormError('Something went wrong. Please try again.');
      } else if (e.status === 422) {
        setFormError(e.message);
      } else if (e.status === 404) {
        toast({ title: 'That conversation is no longer available', variant: 'destructive' });
        onClose();
        return;
      } else if (e.status !== 401) {
        setFormError('Something went wrong. Please try again.');
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ width: 1140, maxWidth: '96vw', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 24px' }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 11,
              background: 'linear-gradient(150deg,#22C55E,#16A34A)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 4px 12px rgba(22,163,74,.28)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="2.6" y="4.4" width="14.8" height="11.2" rx="2" stroke="#fff" strokeWidth="1.5" />
              <path d="M3.2 5.4L10 10.4l6.8-5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9.5, fontWeight: 800, color: '#9BA3C4', letterSpacing: '.9px' }}>
              EXTERNAL · EMAIL INVESTORS
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#1A1D2E', marginTop: 2, letterSpacing: '-.2px' }}>
              {subject || 'Send externally'}
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

        {/* Two columns */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0, borderTop: '1px solid #ECEEF8' }}>
          {/* ── Left: compose ─────────────────────────────────────────── */}
          <div style={{ flex: '1 1 0', minWidth: 0, padding: '20px 24px', overflowY: 'auto', maxHeight: 'min(64vh, 560px)' }}>
            <div style={SECTION_LABEL}>WRITE</div>

            {/* To */}
            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', paddingBottom: 16 }}>
              <span style={{ fontSize: 12.5, color: '#8890AE', fontWeight: 600, paddingTop: 7, width: 48, flexShrink: 0 }}>To</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, flex: 1 }}>
                {recipients.map((r) => (
                  <RecipientChip key={r.id} label={r.email ?? r.name} onRemove={() => removeRecipient(r.id)} />
                ))}
                {adding ? (
                  <input
                    className="inp"
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addRecipient();
                      } else if (e.key === 'Escape') {
                        setDraft('');
                        setAdding(false);
                      }
                    }}
                    onBlur={addRecipient}
                    placeholder="name@investor.com"
                    style={{ width: 200, padding: '6px 12px', fontSize: 12.5 }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setAdding(true)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '6px 12px',
                      borderRadius: 20,
                      border: 'none',
                      background: 'transparent',
                      color: '#16A34A',
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    + Add recipients
                  </button>
                )}
              </div>
            </div>

            {/* Subject */}
            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', padding: '16px 0', borderTop: '1px solid #F0F1F8' }}>
              <span style={{ fontSize: 12.5, color: '#8890AE', fontWeight: 600, paddingTop: 10, width: 48, flexShrink: 0 }}>Subject</span>
              <input
                className="inp"
                value={subject}
                onChange={(e) => {
                  subjectTouchedRef.current = true;
                  setSubject(e.target.value);
                  if (formError) setFormError(null);
                }}
                style={{ flex: 1, fontSize: 14, fontWeight: 700, color: '#1A1D2E' }}
              />
            </div>

            {/* Body — WYSIWYG editor. `editorKey` remounts it to re-seed once
                the thread's latest message finishes loading. */}
            <RichTextEditor key={editorKey} initialHtml={bodyHtml} onChange={setBodyHtml} />
            {bodyLoading && (
              <div style={{ fontSize: 11.5, color: '#9BA3C4', marginTop: 6 }}>Loading the thread's latest message…</div>
            )}

            {(formError || recipientsEmpty) && (
              <div style={{ fontSize: 11.5, fontWeight: 600, marginTop: 16, color: formError ? '#DC2626' : '#9BA3C4' }}>
                {formError ?? 'Add at least one recipient to send.'}
              </div>
            )}
          </div>

          {/* ── Right: preview ────────────────────────────────────────── */}
          <div
            style={{
              flex: '1 1 0',
              minWidth: 0,
              background: '#F3F4F8',
              borderLeft: '1px solid #ECEEF8',
              padding: '16px 22px 22px',
              overflowY: 'auto',
              maxHeight: 'min(64vh, 560px)',
            }}
          >
            {/* Window chrome + caption */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 7 }}>
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#FF5F57' }} />
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#FEBC2E' }} />
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#28C840' }} />
              </div>
              <span style={{ fontSize: 11.5, color: '#9BA3C4', fontWeight: 600 }}>What the investor receives</span>
            </div>

            {/* Email card */}
            <div style={{ borderRadius: 14, overflow: 'hidden', boxShadow: '0 10px 30px rgba(26,29,46,.10)', background: '#fff' }}>
              {/* Sender header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '18px 20px',
                  background: 'linear-gradient(120deg,#2B1D66,#4B2FB0)',
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    background: 'rgba(255,255,255,.16)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {ICON_GRID}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 800, color: '#fff' }}>{companyName} · Investor Relations</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,.72)', marginTop: 1 }}>{senderEmail}</div>
                </div>
              </div>

              {/* Email body */}
              <div style={{ padding: '18px 22px 22px' }}>
                <div style={{ fontSize: 12.5, color: '#5A6080', marginBottom: 14 }}>
                  <span style={{ color: '#9BA3C4' }}>To:</span>{' '}
                  <strong style={{ color: '#1A1D2E' }}>{recipientsLine || '—'}</strong>
                </div>
                <div style={{ fontSize: 19, fontWeight: 800, color: '#1A1D2E', lineHeight: 1.3, letterSpacing: '-.3px' }}>
                  {subject}
                </div>
                {/* Body mirrors exactly what was authored on the left. */}
                <div
                  className="ext-preview-body"
                  style={{ fontSize: 13.5, color: '#3A4066', lineHeight: 1.7, marginTop: 16 }}
                  onClick={openAnchorFromEvent}
                  dangerouslySetInnerHTML={{ __html: bodyHtml }}
                />

                {/* Footer */}
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #F0F1F8', fontSize: 11, color: '#9BA3C4', lineHeight: 1.7 }}>
                  <div>
                    {companyName}
                    {city ? ` · ${city}` : ''} · <span style={{ color: '#7C8AB0' }}>Investor Relations</span>
                  </div>
                  <div>
                    You&apos;re on {companyName}&apos;s investor distribution list.{' '}
                    <span style={{ color: '#7C8AB0' }}>Manage preferences</span> · <span style={{ color: '#7C8AB0' }}>Unsubscribe</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 10,
            padding: '14px 24px',
            borderTop: '1px solid #ECEEF8',
          }}
        >
          <button type="button" className="btn bs" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn bp"
            style={{ gap: 7, opacity: sending || subjectEmpty || recipientsEmpty ? 0.55 : 1 }}
            disabled={sending || subjectEmpty || recipientsEmpty}
            title={recipientsEmpty ? 'Add at least one recipient' : undefined}
            onClick={send}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M12.5 1.5L6 8M12.5 1.5L8.3 12.5l-2.3-4.5L1.5 5.7 12.5 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
            {sending ? 'Sending…' : 'Send email'}
          </button>
        </div>
      </div>
    </div>
  );
}
