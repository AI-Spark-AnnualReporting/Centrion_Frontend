import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { communications, ApiError, type ThreadSummary } from '@/lib/api';

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

export type NotificationType = 'thread_message'; // | 'report_published' | 'mention' | …

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
};

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
`;

const REFRESH_MS = 45000;

export function NotificationBell() {
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const unreadCount = items.filter((n) => n.unread).length;

  const load = useCallback(async () => {
    try {
      const res = await communications.listThreads();
      setItems(buildThreadNotifications(res.threads));
    } catch (e) {
      // 401 → request layer already ran the session-expired flow. Any other
      // failure just leaves the bell empty rather than surfacing an error.
      if (e instanceof ApiError && e.status === 401) return;
    }
  }, []);

  // Poll in the background so the badge stays roughly live.
  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

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
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, unread: false } : x)));
    if (n.type === 'thread_message') {
      const threadId = n.id.slice('thread:'.length);
      communications.markThreadRead(threadId).catch(() => {});
    }
    setOpen(false);
    if (n.navigateTo) navigate(n.navigateTo);
  };

  const markAllRead = () => {
    const unread = items.filter((n) => n.unread);
    setItems((prev) => prev.map((x) => ({ ...x, unread: false })));
    unread.forEach((n) => {
      if (n.type === 'thread_message') {
        communications.markThreadRead(n.id.slice('thread:'.length)).catch(() => {});
      }
    });
  };

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
                return (
                  <button
                    key={n.id}
                    type="button"
                    role="menuitem"
                    className="notif-row"
                    onClick={() => openNotification(n)}
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
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
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
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {n.body}
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 5 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: meta.accent }}>{n.meta ?? meta.label}</span>
                        <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#CBD0E4' }} />
                        <span style={{ fontSize: 11, color: '#9BA3C4' }}>{relativeTime(n.timestamp)}</span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
