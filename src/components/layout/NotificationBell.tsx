import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  agentRuns,
  boardReports,
  communications,
  earnings,
  notifications as notificationsApi,
  quarterlyReports,
  sarNotifications,
  ApiError,
  type AppNotificationRow,
  type SarNotification,
  type ThreadSummary,
} from '@/lib/api';
import type { BoardIndexFailure } from '@/types/board';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';

/* ══════════════════════════════════════════════════════════════════════
   Notification bell + dropdown.

   Two kinds today, from two different feeds:

     thread_message    an unread Communication Hub thread, from this backend.
     report_not_ready  a finalised report that could not be prepared for the AI
                       assistant, from the SHARED notifications table (read via
                       the SAR backend — see sarNotifications in lib/api).

   The model is deliberately type-driven so future kinds slot in without
   touching the UI:

     1. add a code to NotificationType
     2. add an entry to NOTIF_META (icon + accent)
     3. add a builder that returns AppNotification[]

   Everything below (list, badge, empty state, click-through) is generic. A row
   may also carry an `action`, which renders as a button inside the row and does
   NOT open the notification — report_not_ready uses it for "Try again".
═══════════════════════════════════════════════════════════════════════ */

export type NotificationType =
  | 'thread_message'
  | 'system'
  | 'report_not_ready'
  | 'board_index_failed'; // | 'mention' | …

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
   * In-row button. Its click never opens the notification. Awaited by the
   * generic handler below; a fire-and-forget retry (board_index_failed)
   * resolves immediately and tracks its own pending state separately.
   */
  action?: { label: string; busyLabel: string; run: () => Promise<void> };
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
  // Anything the backend raises into the `notifications` table: today the
  // department suggestions that follow an annual-report upload.
  system: {
    label: 'From your reports',
    accent: '#4040C8',
    bg: '#ECECFB',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M8 1.8 9.7 5.4l3.9.5-2.8 2.8.7 3.9L8 10.8l-3.5 1.8.7-3.9L2.4 5.9l3.9-.5L8 1.8z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  report_not_ready: {
    label: 'Needs attention',
    // #B45309 is the app-wide warning ink (SheetReadingDialog, EditableProse…).
    accent: '#B45309',
    bg: '#FFF7ED',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M8 2.6 14.4 13H1.6L8 2.6z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path d="M8 6.6v2.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="8" cy="11.2" r=".75" fill="currentColor" />
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

// What identifies OUR rows in the shared notifications table.
//
// Not `category`, even though the backend writes one: SAR's NotificationResponse
// does not return that column at all, so a reader never sees it. This pair does
// come back, and nothing else in the table uses either half.
//
// The filter is not optional. Centriyon also writes Communication Hub rows into
// this same table, and those already reach the bell through the thread feed
// below — without it, every @mention would be listed twice.
//
// Keep in step with TYPE_REPORT_AI_READINESS / RELATED_TYPE_REPORT in the
// backend's notifications.py.
const READINESS_TYPE = 'alert';
const READINESS_RELATED_TYPE = 'report';

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
      busyLabel: 'Getting it ready…',
      run: async () => onRetry(f.report_id),
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

// Rows from the `notifications` table. These were written for months and read by
// nothing — no route, no client — so every one of them was invisible until now.
function buildSystemNotifications(rows: AppNotificationRow[]): AppNotification[] {
  return rows
    .filter((r) => !r.is_read)
    .map((r) => ({
      id: `notif:${r.id}`,
      type: 'system' as const,
      title: r.title,
      body: r.message ?? undefined,
      meta: r.category ?? undefined,
      timestamp: r.created_at,
      unread: true,
      navigateTo: r.action_url ?? undefined,
    }));
}

/** Which report a readiness notification is about, read off its deep link. */
function reportKind(actionUrl: string | null | undefined): 'earnings' | 'quarterly' | null {
  if (!actionUrl) return null;
  if (actionUrl.startsWith('/earnings/')) return 'earnings';
  if (actionUrl.startsWith('/quarterly-report/')) return 'quarterly';
  return null;
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
.notif-action:hover:not(:disabled) { background: #FFF1DF !important; }
.notif-action:disabled { opacity: .6; cursor: default; }
`;

const REFRESH_MS = 45000;

// Retry polling. The indexer usually finishes in well under a minute; past the
// cap we stop watching and let the 45s refresh settle it, rather than spinning
// forever on a run whose process died (a server restart drops in-flight
// BackgroundTasks with no record).
const POLL_MS = 3000;
const POLL_CAP_MS = 120000;

export function NotificationBell() {
  // Threads are company-scoped. A Spark session that hasn't picked a company
  // would render a permanently empty bell and re-poll every 45s for nothing, so
  // hide it entirely — the same self-hiding contract AppSwitcher and
  // ActingCompanyChip use. Role-gated, so no other role is affected.
  const { user, actingCompany } = useAuth();
  const hideForCompanylessSpark = user?.role === 'spark_internal' && !actingCompany;

  const navigate = useNavigate();
  const { toast } = useToast();
  // The success toast outlives the render that built it, and by the time it
  // fires the failure row carrying the report's name is already gone — so the
  // name is kept here rather than read back off a row that no longer exists.
  const labelsRef = useRef<Map<string, string>>(new Map());

  const [items, setItems] = useState<AppNotification[]>([]);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Threads live inside a company, so a user without one has no notifications
  // to poll for — the request 400s every 45 seconds. `user.company_id` is
  // already the acting company's id for a Spark session (see AuthContext's
  // effectiveUser), so this also re-enables polling once Spark picks one.
  // Same guard ComplianceRunsContext already applies to its own
  // company-scoped sweep.
  const enabled = !!user?.company_id;
  const companyId = user?.company_id;

  const unreadCount = items.filter((n) => n.unread).length;

  // Declared before `load` so the builder below can close over it. Kept in a ref
  // rather than the dependency list so a retry never re-creates the poller.
  const loadRef = useRef<() => Promise<void>>(async () => {});

  // Retrying a board-report index is optimistic on the label only: the row
  // stays until the backend stops reporting it, so a retry that fails again
  // never looks like a success.
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

  // Only ever fired for a report the user pressed Try again on. When the
  // approve-time index just works — which is nearly always — nothing is said:
  // the user never knew there was a problem, and congratulating them on a fix
  // they did not ask for is noise.
  //
  // A toast rather than a bell row, because the bell is a list of things that
  // still need doing. A success row there would force the reader to open rows
  // to find out which ones are chores. This one clears itself.
  const announceIndexed = useCallback(
    (reportId: string) => {
      const label = labelsRef.current.get(reportId) ?? 'Your board report';
      toast({
        variant: 'success',
        title: 'The assistant can read this report now',
        description: `${label} is ready — you can ask the assistant about it.`,
      });
      labelsRef.current.delete(reportId);
    },
    [toast],
  );

  const retryIndex = useCallback(
    (reportId: string) => {
      setRetryingBoth(new Set(retryingRef.current).add(reportId));
      void boardReports
        .retryIndex(reportId)
        .catch(() => {})
        .finally(() => loadRef.current());
    },
    [setRetryingBoth],
  );

  // Watch a queued retry to its end. On success the backend clears the warning,
  // so the row simply disappears; on a repeat failure it replaces its own row and
  // the timestamp moves. Returns how it ended, or null if we stopped watching —
  // which is NOT a failure, so the caller must not claim one.
  const watchRun = useCallback(async (pollUrl: string | null): Promise<string | null> => {
    if (!pollUrl) return null;
    const started = Date.now();
    while (Date.now() - started < POLL_CAP_MS) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      try {
        const run = await agentRuns.getByPollUrl(pollUrl);
        if (run.status === 'completed' || run.status === 'failed') return run.status;
      } catch {
        // A transient poll failure is not a retry failure — keep watching.
      }
    }
    return null;
  }, []);

  const buildReadinessNotifications = useCallback(
    (rows: SarNotification[]): AppNotification[] =>
      rows
        .filter(
          (r) =>
            !r.is_read &&
            r.notification_type === READINESS_TYPE &&
            r.related_type === READINESS_RELATED_TYPE,
        )
        .map((r) => {
          const kind = reportKind(r.action_url);
          const reportId = r.related_id ?? '';
          const id = `notif:${r.id}`;
          return {
            id,
            type: 'report_not_ready' as const,
            title: r.title,
            body: r.message,
            timestamp: r.created_at,
            unread: true,
            navigateTo: r.action_url ?? undefined,
            // No report to act on (an unparseable link) → no button, so the row
            // is still readable and still deep-links, it just can't self-heal.
            action:
              kind && reportId
                ? {
                    label: 'Try again',
                    busyLabel: 'Getting it ready…',
                    run: async () => {
                      const res =
                        kind === 'earnings'
                          ? await earnings.reindexEarningsReport(reportId)
                          : await quarterlyReports.reindexReport(companyId ?? '', reportId);
                      const outcome = await watchRun(res.poll_url);
                      await loadRef.current();
                      // Only on a confirmed success. The warning vanishing is
                      // quiet enough to miss right after pressing a button, and
                      // null means we stopped watching, not that it worked.
                      if (outcome === 'completed') {
                        toast({
                          variant: 'success',
                          title: '✓ The assistant can read this report now',
                          description:
                            `${res.report_label || 'Your report'} is ready — ` +
                            'you can ask the assistant about it.',
                        });
                      }
                    },
                  }
                : undefined,
          };
        }),
    [companyId, watchRun, toast],
  );

  const load = useCallback(async () => {
    if (!enabled) return;
    // Four independent hosts. Settled, not all — one failing must not blank
    // the others, so they resolve separately and whatever arrived is merged.
    const [threads, rows, notifs, failures] = await Promise.allSettled([
      communications.listThreads(),
      notificationsApi.list(),
      sarNotifications.list(),
      boardReports.listIndexFailures(),
    ]);

    // 401 → the request layer already ran the session-expired flow. Any other
    // failure just leaves that feed's rows out rather than surfacing an error.
    const isExpired = (r: PromiseSettledResult<unknown>) =>
      r.status === 'rejected' && r.reason instanceof ApiError && r.reason.status === 401;
    if (isExpired(threads) || isExpired(rows) || isExpired(notifs) || isExpired(failures)) {
      return;
    }

    if (failures.status === 'fulfilled') {
      failures.value.failures.forEach((f) => labelsRef.current.set(f.report_id, f.label));
    }
    const failureRows =
      failures.status === 'fulfilled'
        ? buildIndexFailureNotifications(failures.value.failures, retryIndex)
        : [];

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

    const rest: AppNotification[] = [];
    if (threads.status === 'fulfilled') {
      rest.push(...buildThreadNotifications(threads.value.threads));
    }
    if (rows.status === 'fulfilled') {
      rest.push(...buildSystemNotifications(rows.value.notifications));
    }
    if (notifs.status === 'fulfilled') {
      rest.push(...buildReadinessNotifications(notifs.value.notifications ?? []));
    }
    // The rest, newest first — the feeds are each sorted, together they are not.
    rest.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

    // Something that needs doing outranks something to read.
    setItems([...failureRows, ...rest]);
  }, [enabled, buildReadinessNotifications, retryIndex, announceIndexed, setRetryingBoth]);

  useEffect(() => {
    loadRef.current = load;
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

  const markRead = (n: AppNotification) => {
    if (n.type === 'thread_message') {
      communications.markThreadRead(n.id.slice('thread:'.length)).catch(() => {});
    } else if (n.type === 'system') {
      notificationsApi.markRead(n.id.slice('notif:'.length)).catch(() => {});
    } else if (n.type === 'report_not_ready') {
      sarNotifications.markRead(n.id.slice('notif:'.length)).catch(() => {});
    }
  };

  const openNotification = (n: AppNotification) => {
    // Optimistically clear it, tell the backend, then deep-link.
    // An index failure has no read state — it clears when the retry succeeds.
    if (n.type !== 'board_index_failed') {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, unread: false } : x)));
      markRead(n);
    }
    setOpen(false);
    if (n.navigateTo) navigate(n.navigateTo);
  };

  const runAction = async (n: AppNotification) => {
    if (!n.action || busy[n.id]) return;
    setBusy((prev) => ({ ...prev, [n.id]: true }));
    try {
      await n.action.run();
    } catch {
      // Leave the row as it is — the warning is still true, and the button can
      // be pressed again. Retrying is safe to repeat by design.
    } finally {
      setBusy((prev) => {
        const { [n.id]: _drop, ...rest } = prev;
        return rest;
      });
    }
  };

  const markAllRead = () => {
    // Index failures are deliberately left alone: there is nothing to mark read
    // on the server, and the failure is still real until someone retries it.
    const unread = items.filter((n) => n.unread && n.type !== 'board_index_failed');
    setItems((prev) =>
      prev.map((x) => (x.type !== 'board_index_failed' ? { ...x, unread: false } : x)),
    );
    unread.forEach(markRead);
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
                // Board-index failures track their pending state in `retrying`
                // (persists across polls, cleared only when the row itself
                // clears); every other action-bearing row uses the generic
                // per-click `busy` map from runAction.
                const isBusy =
                  n.type === 'board_index_failed'
                    ? retrying.has(n.id.slice('board-index:'.length))
                    : !!busy[n.id];
                const wraps = n.type === 'board_index_failed' || n.type === 'report_not_ready';
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
                            // Warnings are a sentence or two of plain English and
                            // are useless truncated to one line, unlike a message
                            // preview which is only ever a teaser.
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
                            disabled={isBusy}
                            // Acting on the row must not also open it.
                            onClick={(e) => {
                              e.stopPropagation();
                              void runAction(n);
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
                              cursor: isBusy ? 'default' : 'pointer',
                              opacity: isBusy ? 0.55 : 1,
                            }}
                          >
                            {isBusy ? n.action.busyLabel : n.action.label}
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
