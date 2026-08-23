import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  communications,
  ApiError,
  type CommunicationMember,
  type ThreadAttachment,
  type ThreadDetail,
  type ThreadMemberSummary,
  type ThreadDetailResponse,
  type ThreadMessage,
} from '@/lib/api';
import { MentionComposer, MemberPicker } from './MentionComposer';
import { AttachedReportCard } from './AttachedReportCard';
import { SendExternalModal } from './SendExternalModal';
import {
  ATTACHMENT_ACCEPT,
  formatFileSize,
  initials,
  relativeTime,
  roleLabel,
  SECTION_LABEL,
  validateAttachmentFile,
} from './helpers';

/* ══════════════════════════════════════════════════════════════════════
   Review thread — opens from the hub panel's Discuss button, a row's Internal
   button, or a notification deep-link (/communications/threads/{id}).

   The attached-report card is load-bearing: without it the assigned reviewer
   opens the thread and can't tell which report they've been asked to review.
   Clicking it goes straight to the reviewer screen.

   `kind` drives the bubble: "system" renders as the Communication Hub itself
   (ignore `sender` for the display name); "user" renders as a person.
═══════════════════════════════════════════════════════════════════════ */

const ICON_SHARE = (
  <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
    <circle cx="13.4" cy="4.2" r="2.1" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="4.6" cy="9" r="2.1" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="13.4" cy="13.8" r="2.1" stroke="currentColor" strokeWidth="1.5" />
    <path d="M6.5 7.9l5-2.6M6.5 10.1l5 2.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const ICON_EXTERNAL = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M5.6 2.6H2.9a.9.9 0 0 0-.9.9v7.6a.9.9 0 0 0 .9.9h7.6a.9.9 0 0 0 .9-.9V8.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M8.2 2.3h3.5v3.5M11.4 2.6L6.6 7.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ICON_MAIL = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="1.8" y="3" width="10.4" height="8" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
    <path d="M2.2 3.8L7 7.4l4.8-3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ICON_CHECK_CIRCLE = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="8.4" fill="#16A34A" />
    <path d="M6.4 10.2l2.4 2.4 4.8-4.8" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ICON_PAPERCLIP = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path
      d="M21.44 11.05l-9.19 9.19a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95l-9.2 9.19a1.5 1.5 0 0 1-2.12-2.12l8.49-8.48"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ICON_FILE = (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
    <path d="M12 2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M12 2v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

const ICON_DOWNLOAD = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M7 1.5v7.5M3.8 6.3L7 9.5l3.2-3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 11.5h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

function AttachmentChip({ attachment, onPreview }: { attachment: ThreadAttachment; onPreview: (a: ThreadAttachment) => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onPreview(attachment)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPreview(attachment);
        }
      }}
      title={`Preview ${attachment.filename}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 13px',
        borderRadius: 10,
        background: '#F6F7FC',
        border: '1px solid #E2E4F0',
        maxWidth: 320,
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          flexShrink: 0,
          background: '#EEEEFF',
          color: '#4040C8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {ICON_FILE}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span
          style={{
            display: 'block',
            fontSize: 12.5,
            fontWeight: 700,
            color: '#1A1D2E',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {attachment.filename}
        </span>
        <span style={{ display: 'block', fontSize: 11, color: '#9BA3C4', marginTop: 1 }}>
          {formatFileSize(attachment.file_size_bytes)}
        </span>
      </span>
      <a
        href={attachment.download_url}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        aria-label={`Download ${attachment.filename}`}
        title="Download"
        style={{ flexShrink: 0, color: '#4040C8', display: 'flex' }}
      >
        {ICON_DOWNLOAD}
      </a>
    </div>
  );
}

const PREVIEWABLE_IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];

function fileExt(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i === -1 ? '' : filename.slice(i + 1).toLowerCase();
}

function AttachmentPreviewModal({ attachment, onClose }: { attachment: ThreadAttachment; onClose: () => void }) {
  const ext = fileExt(attachment.filename);
  const isPdf = ext === 'pdf';
  const isImage = PREVIEWABLE_IMAGE_EXTS.includes(ext);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ width: 'min(880px, 92vw)', height: 'min(86vh, 900px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid #ECEEF8' }}>
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              flexShrink: 0,
              background: '#EEEEFF',
              color: '#4040C8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {ICON_FILE}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13.5,
                fontWeight: 800,
                color: '#1A1D2E',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {attachment.filename}
            </div>
            <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 1 }}>{formatFileSize(attachment.file_size_bytes)}</div>
          </div>
          <a
            href={attachment.download_url}
            target="_blank"
            rel="noreferrer"
            className="btn bs"
            style={{ gap: 6, textDecoration: 'none', flexShrink: 0 }}
          >
            {ICON_DOWNLOAD}
            Download
          </a>
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

        <div style={{ flex: 1, minHeight: 0, background: '#F4F5FB' }}>
          {isPdf ? (
            <iframe src={attachment.download_url} title={attachment.filename} style={{ width: '100%', height: '100%', border: 'none' }} />
          ) : isImage ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 20 }}>
              <img
                src={attachment.download_url}
                alt={attachment.filename}
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }}
              />
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                gap: 14,
                padding: 20,
                textAlign: 'center',
              }}
            >
              <span
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 14,
                  background: '#EEEEFF',
                  color: '#4040C8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ transform: 'scale(1.8)' }}>{ICON_FILE}</span>
              </span>
              <div style={{ fontSize: 13, color: '#5A6080', fontWeight: 600 }}>
                Preview isn't available for this file type.
              </div>
              <a href={attachment.download_url} target="_blank" rel="noreferrer" className="btn bp" style={{ textDecoration: 'none' }}>
                Download {attachment.filename}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// "Sara", "Sara and Omar", "Sara, Omar and Lina" — for the add-member warning.
function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function MessageRow({ message, onPreview }: { message: ThreadMessage; onPreview: (a: ThreadAttachment) => void }) {
  const { sender, body, created_at, kind, attachment } = message;
  const isSystem = kind === 'system';

  return (
    <div style={{ display: 'flex', gap: 11, padding: '9px 0' }}>
      {isSystem ? (
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            flexShrink: 0,
            background: '#EFF0F7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 800, color: '#8890AE' }}>{initials(sender.full_name)}</span>
        </span>
      ) : (
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            flexShrink: 0,
            background: sender.is_you ? 'linear-gradient(150deg,#5B5BF0,#4040C8)' : '#EEEEFF',
            color: sender.is_you ? '#fff' : '#4040C8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 800,
          }}
        >
          {initials(sender.full_name)}
        </span>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
          {isSystem ? (
            <span style={{ fontSize: 13, fontWeight: 800, color: '#1A1D2E' }}>
              {sender.full_name}
              {sender.is_you && ' (you)'}
            </span>
          ) : (
            <>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#1A1D2E' }}>
                {sender.full_name}
                {/* Append " (you)" unless the backend already named the sender "You". */}
                {sender.is_you && sender.full_name.trim().toLowerCase() !== 'you' && ' (you)'}
              </span>
              <span className="badge b-gy">{roleLabel(sender.role)}</span>
            </>
          )}
          <span style={{ fontSize: 11.5, color: '#9BA3C4' }}>{relativeTime(created_at)}</span>
        </div>
        {attachment ? (
          <AttachmentChip attachment={attachment} onPreview={onPreview} />
        ) : (
          <div
            style={{
              padding: '10px 13px',
              borderRadius: 10,
              background: isSystem ? '#F4F4FB' : '#F6F7FC',
              fontSize: 13,
              color: '#3A4066',
              lineHeight: 1.55,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {body}
          </div>
        )}
      </div>
    </div>
  );
}

export function ThreadViewModal({
  threadId,
  onClose,
  initialPayload,
  onOpenReview,
}: {
  threadId: string;
  onClose: () => void;
  // Share returns the full thread payload — pass it to paint without a refetch.
  // Its presence also means "just shared", which shows the success banner.
  initialPayload?: ThreadDetailResponse;
  // Opens the reviewer screen. The view itself is readable by any company
  // member; it self-gates the write actions on can_act / can_approve.
  onOpenReview?: (threadId: string) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();

  const justShared = !!initialPayload;

  const [loading, setLoading] = useState(!initialPayload);
  const [error, setError] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadDetail | null>(initialPayload?.thread ?? null);
  const [messages, setMessages] = useState<ThreadMessage[]>(initialPayload?.messages ?? []);
  const [members, setMembers] = useState<CommunicationMember[]>([]);

  const [message, setMessage] = useState('');
  const [mentions, setMentions] = useState<CommunicationMember[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  // Names this reply would add to a private thread — set on the first click so
  // the sender confirms before letting someone read the whole backlog.
  const [confirmAdding, setConfirmAdding] = useState<string[] | null>(null);
  // Member add/remove is its own call now — no message required.
  const [memberBusy, setMemberBusy] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<ThreadMemberSummary | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewAttachment, setPreviewAttachment] = useState<ThreadAttachment | null>(null);
  const [showSendExternal, setShowSendExternal] = useState(false);

  // Re-pull the thread so a just-logged system message (e.g. from a
  // send-external) shows up without the user having to close/reopen.
  const reloadThread = () => {
    communications
      .getThread(threadId)
      .then((detail) => {
        setThread(detail.thread);
        setMessages(detail.messages);
      })
      .catch(() => {});
  };

  // On open → load thread + members in parallel, and fire read (idempotent).
  // With initialPayload the thread is already painted; we still refresh members
  // for the mention picker and mark the thread read.
  useEffect(() => {
    let cancelled = false;
    const skipThreadFetch = !!initialPayload;
    if (!skipThreadFetch) {
      setLoading(true);
      setError(null);
    }

    Promise.all([
      skipThreadFetch ? Promise.resolve(null) : communications.getThread(threadId),
      // A members failure shouldn't block the thread from rendering.
      communications.members().catch(() => ({ members: [] as CommunicationMember[] })),
    ])
      .then(([detail, membersRes]) => {
        if (cancelled) return;
        if (detail) {
          setThread(detail.thread);
          setMessages(detail.messages);
        }
        setMembers(membersRes.members);
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) return;
        if (e instanceof ApiError && e.status === 404) {
          toast({ title: 'That conversation is no longer available', variant: 'destructive' });
          onClose(); // parent refreshes the list
          return;
        }
        setError('Could not load this conversation. Please try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // Clear the "N new" badge — idempotent, don't block the view on it.
    communications.markThreadRead(threadId).catch(() => {});

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  // @mention is an optional notify — every thread member can already see the
  // message, so it's never required to send. An attachment with no text is a
  // valid send on its own.
  const hasMessage = message.trim().length > 0;
  // Membership is keyed on usr_… `user_id`; the picker's `id` is the UUID the
  // API takes. Comparing the wrong one flags every mention as a new member.
  const threadMembers = thread?.members ?? [];
  const adding =
    threadMembers.length === 0
      ? []
      : mentions.filter((m) => !threadMembers.some((tm) => tm.user_id === m.user_id));
  // Only the creator of a private thread may pull in someone new; the backend
  // 403s anyone else on the send call, which would cost them their message.
  // One flag drives the whole state: removed → read what's there, write nothing.
  const removedAt = thread?.removed_at ?? null;
  const readOnly = !!removedAt;
  const canAddPeople = !!thread?.can_add_members && !readOnly;
  // So when they can't add, the "@" picker only offers people already here.
  const runMemberCall = async (call: () => Promise<unknown>) => {
    setMemberBusy(true);
    setMemberError(null);
    try {
      await call();
      // The "X added/removed Y" system line only lands on the next fetch, so
      // re-read rather than patching members off the response.
      reloadThread();
    } catch (e) {
      setMemberError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setMemberBusy(false);
    }
  };

  const mentionableMembers =
    threadMembers.length > 0 && !canAddPeople
      ? members.filter((m) => threadMembers.some((tm) => tm.user_id === m.user_id))
      : members;
  // Company members who aren't in this thread yet and aren't already queued.
  const addableMembers = members.filter(
    (m) =>
      m.user_id !== user?.user_id &&
      !threadMembers.some((tm) => tm.user_id === m.user_id) &&
      !mentions.some((x) => x.id === m.id),
  );
  const canSend = !sending && (!!pendingFile || hasMessage);

  const pickFile = (file: File) => {
    const err = validateAttachmentFile(file);
    if (err) {
      setSendError(err);
      return;
    }
    setSendError(null);
    setPendingFile(file);
  };

  const sendReply = async () => {
    if (sending) return;
    const text = message.trim();
    if (!text && !pendingFile) return;

    // Private thread: @mentioning a non-member puts them in, and new members
    // see the whole history. Confirm before that happens.
    if (adding.length > 0 && !confirmAdding) {
      setConfirmAdding(adding.map((m) => m.full_name));
      return;
    }
    const added = adding.length > 0;
    setConfirmAdding(null);

    setSending(true);
    setSendError(null);

    if (pendingFile) {
      try {
        const res = await communications.uploadAttachment(threadId, pendingFile);
        setMessages((prev) => [...prev, res.message]);
        setPendingFile(null);
      } catch (e) {
        setSending(false);
        if (!(e instanceof ApiError)) {
          setSendError('Could not attach that file. Please try again.');
          return;
        }
        if (e.status === 404) {
          toast({ title: 'That conversation is no longer available', variant: 'destructive' });
          onClose();
          return;
        }
        if (e.status === 401) return; // session-expired flow already handled by the request layer
        // 422 (bad type / empty / too large) and anything else — surface the backend's own words.
        setSendError(e.message);
        return;
      }
    }

    if (!text) {
      setSending(false);
      return;
    }

    try {
      const res = await communications.sendMessage(threadId, {
        message: text,
        mentioned_user_ids: mentions.map((m) => m.id), // UUIDs, not user_id
      });
      setMessages((prev) => [...prev, res.message]);
      setMessage('');
      setMentions([]);
      setSending(false);
      // The member list just changed and the backend appended a system line —
      // re-read rather than patching `members` locally and missing it.
      if (added) reloadThread();
    } catch (e) {
      if (!(e instanceof ApiError)) {
        setSendError('Something went wrong. Please try again.');
        setSending(false);
        return;
      }
      switch (e.status) {
        case 422:
          setSendError("Message can't be empty");
          setSending(false);
          break;
        case 404:
          toast({ title: 'That conversation is no longer available', variant: 'destructive' });
          onClose();
          return;
        case 403:
          // Two different 403s land here now: an inactive member, and "you
          // didn't start this private thread". The backend's detail says which.
          toast({
            title: e.message || 'One of the mentioned people is no longer available',
            variant: 'destructive',
          });
          communications
            .members()
            .then((r) => setMembers(r.members))
            .catch(() => {});
          setSending(false);
          break;
        case 401:
          // Session-expired flow already handled by the request layer.
          setSending(false);
          break;
        default:
          setSendError('Something went wrong. Please try again.');
          setSending(false);
      }
    }
  };

  const report = thread?.report ?? null;
  const isAdHoc = !!thread && !report;
  const title = report ? report.title : (thread?.subject?.trim() || 'Discussion');
  const assignment = thread?.assignment ?? null;
  // The person is the identity; `label` is the authority they sign off as
  // ("Board Chairman"), so it must not stand in for their name.
  const assignedName = assignment ? (assignment.full_name || assignment.label) : null;
  // Review actions never apply to an ad-hoc thread — the review endpoints
  // themselves 422 on those, so don't offer a way to call them.
  const openReview = onOpenReview && report && !readOnly ? () => onOpenReview(threadId) : undefined;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ width: 660, height: 'auto', maxHeight: 'min(88vh, 780px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '18px 22px 16px' }}>
          <span
            style={{
              width: 38,
              height: 38,
              borderRadius: 11,
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
            <div
              style={{
                fontSize: 16.5,
                fontWeight: 800,
                color: '#1A1D2E',
                letterSpacing: '-.2px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {isAdHoc ? title : 'Review thread'}
            </div>
            <div style={{ fontSize: 12.5, color: '#8890AE', marginTop: 1 }}>
              {isAdHoc ? 'General discussion' : 'Shared and assigned for review'}
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

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 22px 4px', borderTop: '1px solid #ECEEF8' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '56px 0' }}>
              <div className="proc-ring" style={{ width: 34, height: 34, borderWidth: 3 }} />
              <div style={{ fontSize: 12, color: '#9BA3C4', fontWeight: 600 }}>Loading conversation…</div>
            </div>
          ) : error ? (
            <div style={{ padding: '48px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: '#DC2626' }}>{error}</div>
            </div>
          ) : (
            <>
              {/* Just-shared confirmation */}
              {justShared && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 11,
                    padding: '13px 15px',
                    borderRadius: 12,
                    background: '#ECFDF3',
                    border: '1px solid #C7EED8',
                    marginTop: 16,
                  }}
                >
                  <span style={{ flexShrink: 0, display: 'inline-flex', marginTop: 1 }}>{ICON_CHECK_CIRCLE}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800, color: '#15803D' }}>
                      Review thread started
                    </span>
                    <span style={{ display: 'block', fontSize: 12.5, color: '#3F9E66', marginTop: 2 }}>
                      {assignedName ? `Shared with ${assignedName} · assigned for review` : 'Assigned for review'}
                    </span>
                  </span>
                </div>
              )}

              {/* The report under review — clicking opens the reviewer screen. */}
              {report && (
                <div style={{ marginTop: 14 }}>
                  <AttachedReportCard
                    report={report}
                    subtitle={openReview ? 'Linked · click to open in review' : 'Linked · read-only snapshot'}
                    onClick={openReview}
                  />
                </div>
              )}

              {threadMembers.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginTop: 14,
                    padding: '9px 12px',
                    borderRadius: 10,
                    background: '#F6F7FC',
                    border: '1px solid #E2E4F0',
                  }}
                >
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {threadMembers.map((m) => {
                      // No ✕ on your own row (422), and none on the last other
                      // person (also 422) — don't offer a control that fails.
                      const removable = canAddPeople && !m.is_you;
                      const isLastOther = threadMembers.length <= 2;
                      return (
                        <span
                          key={m.user_id}
                          title={`${m.full_name}${m.is_you ? ' (you)' : ''}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: removable ? '3px 5px 3px 3px' : 3,
                            borderRadius: 20,
                            background: '#fff',
                            border: '1px solid #E2E4F0',
                          }}
                        >
                          <span
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: '50%',
                              flexShrink: 0,
                              background: m.is_you ? 'linear-gradient(150deg,#5B5BF0,#4040C8)' : '#EEEEFF',
                              color: m.is_you ? '#fff' : '#4040C8',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 9,
                              fontWeight: 800,
                            }}
                          >
                            {initials(m.full_name)}
                          </span>
                          {removable && (
                            <button
                              type="button"
                              disabled={memberBusy || isLastOther}
                              aria-label={`Remove ${m.full_name}`}
                              title={
                                isLastOther
                                  ? 'A private conversation needs at least one other person.'
                                  : `Remove ${m.full_name}`
                              }
                              onClick={() => {
                                setMemberError(null);
                                setConfirmRemove(m);
                              }}
                              style={{
                                display: 'inline-flex',
                                border: 'none',
                                background: 'transparent',
                                padding: 0,
                                color: '#9BA3C4',
                                cursor: memberBusy || isLastOther ? 'not-allowed' : 'pointer',
                                opacity: isLastOther ? 0.4 : 1,
                              }}
                            >
                              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                                <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                              </svg>
                            </button>
                          )}
                        </span>
                      );
                    })}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: '#5A6080' }}>
                    Only {threadMembers.length === 1 ? 'you' : `these ${threadMembers.length} people`} can see this
                    conversation
                    {!canAddPeople && thread?.owner && !thread.owner.is_you && (
                      <span style={{ fontWeight: 500, color: '#8890AE' }}>
                        {' '}
                        · {thread.owner.full_name} started it and can add people
                      </span>
                    )}
                  </span>
                  {canAddPeople && (
                    <MemberPicker
                      compact
                      options={addableMembers}
                      onPick={(m) => runMemberCall(() => communications.addThreadMembers(threadId, [m.id]))}
                      label={
                        memberBusy ? 'Working…' : addableMembers.length === 0 ? 'Everyone is in' : '+ Add people'
                      }
                    />
                  )}
                </div>
              )}

              {confirmRemove && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                    marginTop: 8,
                    padding: '9px 11px',
                    borderRadius: 8,
                    background: '#FFF7ED',
                    border: '1px solid #FED7AA',
                    fontSize: 12,
                    color: '#9A3412',
                  }}
                >
                  <span style={{ flex: 1, minWidth: 180 }}>
                    <strong>{confirmRemove.full_name}</strong> will lose access to this conversation. It takes effect
                    immediately.
                  </span>
                  <button
                    type="button"
                    className="btn"
                    disabled={memberBusy}
                    onClick={() => setConfirmRemove(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn bp"
                    disabled={memberBusy}
                    onClick={() => {
                      const id = confirmRemove.id;
                      setConfirmRemove(null);
                      runMemberCall(() => communications.removeThreadMember(threadId, id));
                    }}
                  >
                    {memberBusy ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              )}

              {memberError && (
                <div style={{ marginTop: 8, fontSize: 11.5, fontWeight: 600, color: '#DC2626' }}>{memberError}</div>
              )}

              <div style={{ ...SECTION_LABEL, marginTop: 18, marginBottom: 4 }}>THREAD</div>

              {messages.length === 0 ? (
                <div style={{ padding: '32px 0', textAlign: 'center', fontSize: 13, color: '#9BA3C4' }}>
                  No messages yet.
                </div>
              ) : (
                messages.map((m) => <MessageRow key={m.id} message={m} onPreview={setPreviewAttachment} />)
              )}

              {readOnly ? (
                <div
                  style={{
                    marginTop: 12,
                    padding: '11px 14px',
                    borderRadius: 10,
                    background: '#F6F7FC',
                    border: '1px solid #E2E4F0',
                    fontSize: 12.5,
                    color: '#8890AE',
                    textAlign: 'center',
                  }}
                >
                  You can't send messages in this conversation.
                </div>
              ) : (
              <>
              {/* Reply composer */}
              <div style={{ marginTop: 12, paddingTop: 14, borderTop: '1px solid #ECEEF8' }}>
                {pendingFile && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: '#F6F7FC',
                      border: '1px solid #E2E4F0',
                      marginBottom: 8,
                    }}
                  >
                    <span style={{ flexShrink: 0, color: '#4040C8', display: 'flex' }}>{ICON_FILE}</span>
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#1A1D2E',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {pendingFile.name}
                    </span>
                    <span style={{ flexShrink: 0, fontSize: 11, color: '#9BA3C4' }}>{formatFileSize(pendingFile.size)}</span>
                    <button
                      type="button"
                      onClick={() => setPendingFile(null)}
                      aria-label={`Remove ${pendingFile.name}`}
                      title="Remove file"
                      style={{
                        flexShrink: 0,
                        width: 18,
                        height: 18,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'transparent',
                        border: 0,
                        padding: 0,
                        cursor: 'pointer',
                        color: '#9BA3C4',
                      }}
                    >
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                )}
                <MentionComposer
                  members={mentionableMembers}
                  currentUserId={user?.user_id}
                  message={message}
                  onMessageChange={(v) => {
                    setMessage(v);
                    if (sendError) setSendError(null);
                    if (confirmAdding) setConfirmAdding(null);
                  }}
                  mentions={mentions}
                  onMentionsChange={(next) => {
                    setMentions(next);
                    if (confirmAdding) setConfirmAdding(null);
                  }}
                  placeholder="Write a reply…  (type @ to mention)"
                  minHeight={70}
                />
                {(confirmAdding || adding.length > 0) && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: '9px 11px',
                      borderRadius: 8,
                      background: '#FFF7ED',
                      border: '1px solid #FED7AA',
                      fontSize: 12,
                      color: '#9A3412',
                      lineHeight: 1.5,
                    }}
                  >
                    {confirmAdding ? (
                      <>
                        This will let <strong>{listNames(confirmAdding)}</strong> read the whole conversation, including
                        everything said before they joined. Send again to confirm.
                      </>
                    ) : (
                      <>
                        <strong>{listNames(adding.map((m) => m.full_name))}</strong> will be added when you send this
                        message, and will see everything said before they joined.
                      </>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 10 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: '#DC2626' }}>{sendError ?? ''}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ATTACHMENT_ACCEPT.join(',')}
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) pickFile(f);
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={sending}
                      title="Attach a document"
                      aria-label="Attach a document"
                      style={{
                        width: 32,
                        height: 32,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 8,
                        border: '1px solid #E2E4F0',
                        background: '#fff',
                        color: '#5A6080',
                        cursor: sending ? 'not-allowed' : 'pointer',
                        opacity: sending ? 0.55 : 1,
                      }}
                    >
                      {ICON_PAPERCLIP}
                    </button>
                    <button
                      type="button"
                      className="btn bp"
                      style={{ gap: 7, opacity: canSend ? 1 : 0.55, cursor: canSend ? 'pointer' : 'not-allowed' }}
                      disabled={!canSend}
                      onClick={sendReply}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M12.5 1.5L6 8M12.5 1.5L8.3 12.5l-2.3-4.5L1.5 5.7 12.5 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                      </svg>
                      {sending ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                </div>
              </div>
              </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            padding: '16px 22px 18px',
            borderTop: '1px solid #ECEEF8',
          }}
        >
          <button type="button" className="btn bs" onClick={onClose}>
            Close
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {thread && !loading && !error && !readOnly && (
              <button type="button" className="btn bs" style={{ gap: 8 }} onClick={() => setShowSendExternal(true)}>
                {ICON_MAIL}
                Send externally
              </button>
            )}
            {openReview && thread && !loading && !error && (
              <button type="button" className="btn bp" style={{ gap: 8 }} onClick={openReview}>
                {thread.can_review ? 'Open as reviewer' : 'Open review'}
                {ICON_EXTERNAL}
              </button>
            )}
          </div>
        </div>
      </div>

      {previewAttachment && (
        <AttachmentPreviewModal attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />
      )}

      {showSendExternal && thread && (
        <SendExternalModal
          threadId={threadId}
          defaultSubject={title}
          onClose={() => setShowSendExternal(false)}
          onSent={reloadThread}
        />
      )}
    </div>
  );
}
