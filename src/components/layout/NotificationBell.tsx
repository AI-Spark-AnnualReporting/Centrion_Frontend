import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { boardReports, communications, ApiError, type ThreadSummary } from '@/lib/api';
import type { BoardIndexFailure } from '@/types/board';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/hooks/use-toast';

/* ══════════════════════════════════════════════════════════════════════
   Notification bell + dropdown.

   Today it surfaces one kind of notification — an unread thread message —
   built from the live Communication Hub feed. The model is deliberately
   type-driven so future kinds slot in without touching the UI:

     1. add a code to NotificationType
     2. add an entry to NOTIF_META (icon + accent)
     3. add a builder that returns AppNotification[]

   Everything below (list, badge, empty state, click-through) is generic.
═══════════════════════════════════════════════════════════════════════ */

export type NotificationType = 'thread_message' | 'board_index_failed'; // | 'mention' | …

export interface AppNotification {
  id: string;
  type: NotificationType;
  /** Bold primary line. */
  title: string;
  /** Muted secondary line (message preview, etc.). */
  body?: string;
  /** Small trailing context (sender, report). */
  meta?: string;
  /** ISO timestamp — rendered as "2 hours ago". */
  timestamp: string;
  unread: boolean;
  /** Route opened when the row is clicked. */
  navigateTo?: string;
  /**
   * Optional button inside the row, for a notification you can act on without
   * leaving the panel. Its click must not also open the row.
   */
  action?: { label: string; pendingLabel: string; run: () => void };
}

interface NotifMeta {
  label: string;
  accent: string; // icon tint + unread dot
  bg: string; // icon tile background
  icon: ReactNode;
}

const NOTIF_META: Record<NotificationType, NotifMeta> = {
  thread_message: {
    label: 'New message',
    accent: '#7C3AED',
    bg: '#F1ECFF',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M2.5 3.6A1.2 1.2 0 0 1 3.7 2.4h8.6a1.2 1.2 0 0 1 1.2 1.2v5.6a1.2 1.2 0 0 1-1.2 1.2H6l-2.9 2.4V3.6z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  board_index_failed: {
    label: 'Indexing failed',
    accent: '#D9480F',
    bg: '#FFF0E6',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M8 2.6 14.4 13.4H1.6L8 2.6z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path d="M8 6.6v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="8" cy="11.6" r=".8" fill="currentColor" />
      </svg>
    ),
  },
};

// Approved board reports the AI assistant can't read yet, because the
// background indexing never finished. `onRetry` re-runs it; the row clears on
// the next poll once the backend marks the warning read.
//
// Title and body come from the backend verbatim — the same text is written to
// the shared `notifications` table that SAR's bell renders, and two copies of
// the same sentence drift.
function buildIndexFailureNotifications(
  failures: BoardIndexFailure[],
  onRetry: (reportId: string) => void,
): AppNotification[] {
  return failures.map((f) => ({
    id: `board-index:${f.report_id}`,
    type: 'board_index_failed' as const,
    title: f.title,
    body: f.message,
    meta: 'Needs attention',
    timestamp: f.failed_at ?? new Date().toISOString(),
    unread: true,
    navigateTo: `/board-report/${f.report_id}/report`,
    action: {
      label: 'Try again',
      pendingLabel: 'Getting it ready…',
      run: () => onRetry(f.report_id),
    },
  }));
}

// Turn the Communication Hub feed into notifications: one per thread with
// unread messages, newest first (the feed is already sorted updated_at desc).
function buildThreadNotifications(threads: ThreadSummary[]): AppNotification[] {
  return threads
    .filter((t) => t.unread_count > 0 && t.last_message)
    .map((t) => {
      const lm = t.last_message!;
      const sender = lm.is_you ? 'You' : lm.sender_full_name;
      const plural = t.unread_count > 1 ? `${t.unread_count} new messages` : '1 new message';
      return {
        id: `thread:${t.thread_id}`,
        type: 'thread_message' as const,
        title: t.report ? t.report.title : (t.subject?.trim() || 'Discussion'),
        body: `${sender}: ${lm.preview}`,
        meta: plural,
        timestamp: t.updated_at,
        unread: true,
        navigateTo: `/communications/threads/${t.thread_id}`,
      };
    });
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return formatDistanceToNow(d, { addSuffix: true });
}

// Scoped hover/entrance rules the inline styles can't express.
const SCOPED_CSS = `
@keyframes notifPop { from { opacity: 0; transform: translateY(-6px) scale(.98); } to { opacity: 1; transform: none; } }
.notif-row { transition: background .13s; }
.notif-row:hover { background: #F7F7FD; }
.notif-clear:hover { color: #4040C8 !important; }
.notif-row:focus-visible { outline: 2px solid #4040C8; outline-offset: -2px; }
.notif-action:hover:not(:disabled) { background: #FFF6F0 !important; }
`;

const REFRESH_MS = 45000;

export function NotificationBell() {
  // Threads are company-scoped. A Spark session that hasn't picked a company
  // would render a permanently empty bell and re-poll every 45s for nothing, so
  // hide it entirely — the same self-hiding contract AppSwitcher and
  // ActingCompanyChip use. Role-gated, so no other role is affected.
  const { user, actingCompany } = useAuth();
  const hideForCompanylessSpark = user?.role === 'spark_internal' && !actingCompany;

  const navigate = useNavigate();
  // The success toast outlives the render that built it, and by the time it
  // fires the failure row carrying the report's name is already gone — so the
  // name is kept here rather than read back off a row that no longer exists.
  const labelsRef = useRef<Map<string, string>>(new Map());

  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Threads live inside a company, so a user without one has no notifications
  // to poll for — the request 400s every 45 seconds. `user.company_id` is
  // already the acting company's id for a Spark session (see AuthContext's
  // effectiveUser), so this also re-enables polling once Spark picks one.
  // Same guard ComplianceRunsContext already applies to its own
  // company-scoped sweep.
  const enabled = !!user?.company_id;

  const unreadCount = items.filter((n) => n.unread).length;

  // Retrying is optimistic on the label only: the row stays until the backend
  // stops reporting it, so a retry that fails again never looks like a success.
  //
  // Mirrored in a ref so `load` can read it without a setState updater. Firing
  // the toast inside an updater would be an impure one, and React is free to
  // run those twice — which is a double "it's ready" for one retry.
  const [retrying, setRetrying] = useState<Set<string>>(new Set());
  const retryingRef = useRef<Set<string>>(new Set());

  const setRetryingBoth = useCallback((next: Set<string>) => {
    retryingRef.current = next;
    setRetrying(next);
  }, []);

  // Through a ref, because `load` builds the rows that carry this callback and
  // would otherwise depend on itself.
  const loadRef = useRef<() => void>(() => {});

  // Only ever fired for a report the user pressed Try again on. When the
  // approve-time index just works — which is nearly always — nothing is said:
  // the user never knew there was a problem, and congratulating them on a fix
  // they did not ask for is noise.
  //
  // A toast rather than a bell row, because the bell is a list of things that
  // still need doing. A success row there would force the reader to open rows
  // to find out which ones are chores. This one clears itself.
  const announceIndexed = useCallback((reportId: string) => {
    const label = labelsRef.current.get(reportId) ?? 'Your board report';
    toast({
      title: 'The assistant can read this report now',
      description: `${label} is ready — you can ask the assistant about it.`,
    });
    labelsRef.current.delete(reportId);
  }, []);

  const retryIndex = useCallback((reportId: string) => {
    setRetryingBoth(new Set(retryingRef.current).add(reportId));
    void boardReports
      .retryIndex(reportId)
      .catch(() => {})
      .finally(() => loadRef.current());
  }, [setRetryingBoth]);

  const load = useCallback(async () => {
    if (!enabled) return;
    // allSettled, not all: a failure in one feed must not blank out the other.
    const [threads, failures] = await Promise.allSettled([
      communications.listThreads(),
      boardReports.listIndexFailures(),
    ]);

    // 401 → the request layer already ran the session-expired flow. Any other
    // failure just leaves that feed's rows out rather than surfacing an error.
    const isExpired = (r: PromiseSettledResult<unknown>) =>
      r.status === 'rejected' && r.reason instanceof ApiError && r.reason.status === 401;
    if (isExpired(threads) || isExpired(failures)) return;

    if (failures.status === 'fulfilled') {
      failures.value.failures.forEach((f) => labelsRef.current.set(f.report_id, f.label));
    }
    const failureRows =
      failures.status === 'fulfilled'
        ? buildIndexFailureNotifications(failures.value.failures, retryIndex)
        : [];
    const threadRows =
      threads.status === 'fulfilled' ? buildThreadNotifications(threads.value.threads) : [];

    // A report that WAS being retried and is no longer reported has succeeded:
    // the backend marks the warning read only when the index lands. That
    // transition is the only moment success is knowable, so it is where the
    // confirmation is announced.
    //
    // Guarded on `fulfilled` on purpose. A failed request returns no failures,
    // which would otherwise read as "every retry worked" and announce a success
    // for a job that may well have failed.
    if (failures.status === 'fulfilled') {
      const stillFailing = new Set(failures.value.failures.map((f) => f.report_id));
      const done = [...retryingRef.current].filter((id) => !stillFailing.has(id));
      if (done.length) {
        done.forEach(announceIndexed);
        setRetryingBoth(
          new Set([...retryingRef.current].filter((id) => stillFailing.has(id))),
        );
      }
    }

    // Something that needs doing outranks something to read.
    setItems([...failureRows, ...threadRows]);
  }, [enabled, retryIndex, announceIndexed, setRetryingBoth]);

  useEffect(() => {
    loadRef.current = () => void load();
  }, [load]);

  // Poll in the background so the badge stays roughly live.
  useEffect(() => {
    if (!enabled) return;
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load, enabled]);

  // Refresh on open so the panel reflects the latest read state.
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openNotification = (n: AppNotification) => {
    // Optimistically clear it, tell the backend, then deep-link to the thread.
    // An index failure has no read state — it clears when the retry succeeds.
    if (n.type !== 'board_index_failed') {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, unread: false } : x)));
    }
    if (n.type === 'thread_message') {
      const threadId = n.id.slice('thread:'.length);
      communications.markThreadRead(threadId).catch(() => {});
    }
    setOpen(false);
    if (n.navigateTo) navigate(n.navigateTo);
  };

  const markAllRead = () => {
    // Index failures are deliberately left alone: there is nothing to mark read
    // on the server, and the failure is still real until someone retries it.
    const unread = items.filter((n) => n.unread && n.type === 'thread_message');
    setItems((prev) =>
      prev.map((x) => (x.type === 'thread_message' ? { ...x, unread: false } : x)),
    );
    unread.forEach((n) => {
      communications.markThreadRead(n.id.slice('thread:'.length)).catch(() => {});
    });
  };

  // After the hooks, never before them — so the bell simply isn't there for a
  // company-less user rather than sitting in the topbar permanently empty.
  if (!enabled || hideForCompanylessSpark) return null;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <style>{SCOPED_CSS}</style>

      <button
        type="button"
        className="tb-ico"
        aria-label="Notifications"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 20 20" fill="none">
          <path
            d="M10 2.6a4.4 4.4 0 0 0-4.4 4.4v2.6L4.3 12.4h11.4L14.4 9.6V7A4.4 4.4 0 0 0 10 2.6z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M8.2 14.6a1.9 1.9 0 0 0 3.6 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -5,
              right: -5,
              minWidth: 16,
              height: 16,
              padding: '0 4px',
              borderRadius: 9,
              background: '#EF4444',
              color: '#fff',
              fontSize: 9.5,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid #fff',
              lineHeight: 1,
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            right: 0,
            width: 380,
            maxWidth: 'calc(100vw - 32px)',
            background: '#fff',
            border: '1px solid #E9EAF4',
            borderRadius: 16,
            boxShadow: '0 18px 50px rgba(26,29,46,.18)',
            zIndex: 1000,
            overflow: 'hidden',
            animation: 'notifPop .16s ease-out',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              padding: '14px 16px',
              borderBottom: '1px solid #F0F1F8',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#1A1D2E', letterSpacing: '-.2px' }}>
                Notifications
              </span>
              {unreadCount > 0 && (
                <span
                  style={{
                    minWidth: 18,
                    height: 18,
                    padding: '0 6px',
                    borderRadius: 9,
                    background: '#EEEEFF',
                    color: '#4040C8',
                    fontSize: 11,
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                className="notif-clear"
                onClick={markAllRead}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#8890AE',
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  padding: 0,
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {items.length === 0 ? (
              <div style={{ padding: '40px 24px', textAlign: 'center' }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    margin: '0 auto 12px',
                    background: '#F2F3FA',
                    color: '#B9C0D8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path
                      d="M10 2.6a4.4 4.4 0 0 0-4.4 4.4v2.6L4.3 12.4h11.4L14.4 9.6V7A4.4 4.4 0 0 0 10 2.6z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                    <path d="M8.2 14.6a1.9 1.9 0 0 0 3.6 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#5A6080' }}>You're all caught up</div>
                <div style={{ fontSize: 12, color: '#9BA3C4', marginTop: 3 }}>New messages will show up here.</div>
              </div>
            ) : (
              items.map((n) => {
                const meta = NOTIF_META[n.type];
                const pending = retrying.has(n.id.slice('board-index:'.length));
                const wraps = n.type === 'board_index_failed';
                return (
                  // A div, not a button: a row can carry its own action button
                  // (Retry), and a button may not be nested inside a button.
                  // tabIndex + onKeyDown keep it operable from the keyboard.
                  <div
                    key={n.id}
                    role="menuitem"
                    tabIndex={0}
                    className="notif-row"
                    onClick={() => openNotification(n)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openNotification(n);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      width: '100%',
                      textAlign: 'left',
                      padding: '13px 16px',
                      border: 'none',
                      borderBottom: '1px solid #F4F5FB',
                      background: n.unread ? '#FBFAFF' : '#fff',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <span
                      style={{
                        flexShrink: 0,
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        background: meta.bg,
                        color: meta.accent,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {meta.icon}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: 13,
                            fontWeight: 700,
                            color: '#1A1D2E',
                            overflow: 'hidden',
                            // A one-line preview is right for a message, but an
                            // alert's whole point is its sentence — ellipsing it
                            // hides what is wrong.
                            ...(wraps
                              ? {}
                              : { textOverflow: 'ellipsis', whiteSpace: 'nowrap' }),
                          }}
                        >
                          {n.title}
                        </span>
                        {n.unread && (
                          <span
                            style={{
                              flexShrink: 0,
                              width: 7,
                              height: 7,
                              borderRadius: '50%',
                              background: meta.accent,
                            }}
                          />
                        )}
                      </div>
                      {n.body && (
                        <div
                          style={{
                            fontSize: 12,
                            color: '#5A6080',
                            marginTop: 2,
                            overflow: 'hidden',
                            ...(wraps
                              ? {
                                  display: '-webkit-box',
                                  WebkitBoxOrient: 'vertical' as const,
                                  WebkitLineClamp: 4,
                                  lineHeight: 1.45,
                                }
                              : { textOverflow: 'ellipsis', whiteSpace: 'nowrap' }),
                          }}
                        >
                          {n.body}
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 5 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: meta.accent }}>{n.meta ?? meta.label}</span>
                        <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#CBD0E4' }} />
                        <span style={{ fontSize: 11, color: '#9BA3C4' }}>{relativeTime(n.timestamp)}</span>
                        {n.action && (
                          <button
                            type="button"
                            className="notif-action"
                            disabled={pending}
                            // Acting on the row must not also open it.
                            onClick={(e) => {
                              e.stopPropagation();
                              n.action!.run();
                            }}
                            style={{
                              marginLeft: 'auto',
                              padding: '3px 10px',
                              borderRadius: 7,
                              border: `1px solid ${meta.accent}`,
                              background: '#fff',
                              color: meta.accent,
                              fontSize: 11,
                              fontWeight: 800,
                              fontFamily: 'inherit',
                              cursor: pending ? 'default' : 'pointer',
                              opacity: pending ? 0.55 : 1,
                            }}
                          >
                            {pending ? n.action.pendingLabel : n.action.label}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
