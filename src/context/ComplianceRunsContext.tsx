// Keeps compliance validation runs watched from anywhere in the app.
//
// A run is asynchronous: POST /runs answers 202 in under a second and the work
// lands 30–90s later. Until now the only thing watching it was the progress
// screen, so leaving that screen meant nothing was looking — the user had to
// sit there. This provider lifts the watching out of the page: it holds every
// run it knows about, polls the ones nobody else is polling, and says so when
// one finishes, whatever the user happens to be doing at the time.
//
// Three things feed it, and every one of them lands in the same `report()`:
//   local     — a screen that already knows something (the set-up screen the
//               instant POST /runs answers, the progress screen on every poll).
//   discovery — GET /runs?status=running, which finds runs this tab never
//               started: a refresh, a second tab, a colleague's run.
//   watcher   — this provider's own GET /runs/{id}, for runs nobody claimed.
//
// The server owns which runs exist and what state they are in. Nothing here is
// cached to localStorage — the only thing this reads from the browser is the
// existing dismissed-runs list, which is a preference, not a status. See
// lib/compliance-runs.ts, whose header makes the same distinction.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, complianceValidation } from '@/lib/api';
import { dismissRun, isDismissed, runHref } from '@/lib/compliance-runs';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import {
  blamesTheFile,
  isTerminalStatus,
  type ReportType,
  type RunErrorCode,
  type RunStatus,
} from '@/types/compliance';

// How often the coordinator wakes up to see whether anything is due. Polling
// cadence is decided per run below; this is just the resolution of the clock.
const TICK_MS = 3_000;
// A run that is still within its expected duration.
const ACTIVE_POLL_MS = 5_000;
// Past the ceiling. See POLL_CEILING_MS.
const BACKOFF_POLL_MS = 30_000;
// Applied to either cadence while the tab is in the background. Polling doesn't
// stop — the whole point is that the user is doing something else and should
// come back to an answer — it just costs less while nobody can see it.
const HIDDEN_MULTIPLIER = 3;
// The progress screen gives up at five minutes because a person is watching a
// spinner and needs to be offered a decision. Nobody is watching this one, so
// there is no decision to offer and giving up would simply lose the run: past
// this mark the coordinator slows down and keeps going indefinitely.
const POLL_CEILING_MS = 5 * 60 * 1000;
const DISCOVERY_INTERVAL_MS = 60_000;
// More forgiving than the progress screen's three, for the same reason — a
// background watcher has nobody to apologise to, so it rides out a longer
// outage rather than declaring the run lost.
const MAX_CONSECUTIVE_FAILURES = 5;
// How long a finished run stays in the dock after it has been announced. The
// run's real home is the resume shelf and the run history; the dock is a
// "just happened" surface, not a log.
const GRACE_MS = 2 * 60 * 1000;
// Toasts default to Radix's 5s countdown. That's too short for news the user
// may not be looking at — a run that finished while the tab was hidden would be
// announced to nobody. This notice opts out of the countdown (duration:
// Infinity) and clears itself only after it has been *visibly* on screen this
// long. See `dismissWhenSeen`.
const TOAST_DISMISS_MS = 10_000;

export interface WatchedRun {
  runId: string;
  // Both are absent on a run registered from the progress screen after a
  // refresh — GET /runs/{id} carries no title or period, only GET /runs does.
  // The dock falls back to the report type rather than inventing a label.
  title: string | null;
  period: string | null;
  reportType: ReportType | null;
  status: RunStatus;
  errorCode: RunErrorCode | null;
  certified: boolean;
  // When the run actually started, not when this tab first heard about it —
  // otherwise a run discovered ten minutes in would look brand new and be
  // polled at the fast cadence forever.
  createdAt: number;
  terminalAt: number | null;
  lastPolledAt: number;
  consecutiveFailures: number;
  // Several polls in a row have failed. Display only: the run is not dropped,
  // because a network that is down says nothing about a run that is running.
  lostContact: boolean;
  // Guards against announcing the same run twice.
  notified: boolean;
}

export type ReportSource = 'local' | 'discovery' | 'watcher';

export interface RunReport {
  runId: string;
  status: RunStatus;
  title?: string | null;
  period?: string | null;
  reportType?: ReportType | null;
  certified?: boolean;
  errorCode?: RunErrorCode | null;
  createdAt?: number;
}

export type RunMap = Record<string, WatchedRun>;

// Folds a report into what is already held. Exported for its own test: this is
// where "the label is written once" and "the run's age is its own, not this
// tab's" live, and both are invisible when they go wrong.
export function mergeRun(prev: WatchedRun | undefined, input: RunReport, now: number): WatchedRun {
  const terminal = isTerminalStatus(input.status);
  if (!prev) {
    return {
      runId: input.runId,
      title: input.title ?? null,
      period: input.period ?? null,
      reportType: input.reportType ?? null,
      status: input.status,
      errorCode: input.errorCode ?? null,
      certified: input.certified ?? false,
      createdAt: input.createdAt ?? now,
      terminalAt: terminal ? now : null,
      lastPolledAt: 0,
      consecutiveFailures: 0,
      lostContact: false,
      notified: false,
    };
  }
  return {
    ...prev,
    // Labels are first-write-wins. A watcher poll can't supply them (the detail
    // endpoint doesn't carry them), so letting a later report blank them would
    // make a named card go anonymous halfway through its own run.
    title: prev.title ?? input.title ?? null,
    period: prev.period ?? input.period ?? null,
    reportType: prev.reportType ?? input.reportType ?? null,
    status: input.status,
    errorCode: input.errorCode ?? prev.errorCode,
    certified: input.certified ?? prev.certified,
    createdAt: prev.createdAt,
    // Stamped once, on the transition — not re-stamped by every later report,
    // which would keep a finished run in the dock forever.
    terminalAt: prev.terminalAt ?? (terminal ? now : null),
    consecutiveFailures: 0,
    lostContact: false,
  };
}

interface ComplianceRunsContextValue {
  runs: WatchedRun[];
  runningCount: number;
  report: (input: RunReport, source: ReportSource) => void;
  // Tells the provider that a screen is already polling this run, so it doesn't
  // poll it too. Ref-counted, and returns its own release — call it from an
  // effect's cleanup and StrictMode's double-mount can't leave a stale claim.
  claimForeground: (runId: string) => () => void;
  dismiss: (runId: string) => void;
  // Drops a run from the dock without recording anything. `dismiss` is the
  // user saying "stop showing me this" and is remembered across sessions; this
  // is just the dock letting go of a run whose news has been delivered — the
  // user is looking at its results, so announcing them again is noise. It stays
  // in the run history and on the resume shelf either way.
  forget: (runId: string) => void;
  hrefFor: (run: WatchedRun) => string;
}

const EMPTY: ComplianceRunsContextValue = {
  runs: [],
  runningCount: 0,
  report: () => {},
  claimForeground: () => () => {},
  dismiss: () => {},
  forget: () => {},
  hrefFor: () => '/compliance',
};

const ComplianceRunsContext = createContext<ComplianceRunsContextValue>(EMPTY);

export function ComplianceRunsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;
  const navigate = useNavigate();

  const [runs, setRuns] = useState<RunMap>({});

  // The coordinator runs off timers, so every read of the current runs has to
  // come from a ref — a closure over `runs` would be a tick out of date and
  // would re-poll runs it had already answered.
  const runsRef = useRef<RunMap>({});
  const foregroundRef = useRef<Map<string, number>>(new Map());
  // useNavigate's identity is not guaranteed stable, and the callbacks below
  // must never change identity or the discovery effect would re-run (and reset
  // state) on navigation.
  const navRef = useRef(navigate);
  useEffect(() => {
    navRef.current = navigate;
  });

  const commit = useCallback((next: RunMap) => {
    runsRef.current = next;
    setRuns(next);
  }, []);

  const forgetRef = useRef<(runId: string) => void>(() => {});

  const notify = useCallback((run: WatchedRun) => {
    const label = run.title || 'Your report';
    const failed = run.status === 'error';
    // The one failure that is about the user's file rather than about us. The
    // progress screen already draws this distinction; a notice that sent someone
    // to re-upload a file we read perfectly well would undo that.
    const fileToBlame = failed && blamesTheFile(run.errorCode);
    const { dismiss: close } = toast({
      title: failed ? 'Validation didn’t finish' : 'Validation complete',
      description: fileToBlame
        ? `We couldn’t read ${label}, so nothing could be scored.`
        : failed
          ? `${label} stopped before it could be scored.`
          : `${label} has been checked — the results are ready.`,
      variant: failed ? 'destructive' : undefined,
      // dismissWhenSeen owns the lifetime of this one, not the 5s countdown.
      duration: Infinity,
      action: (
        <ToastAction
          altText={failed ? 'See what happened' : 'View the validation results'}
          onClick={() => {
            // Taking the offer is the news being delivered — no reason for the
            // dock to keep holding it out afterwards.
            forgetRef.current(run.runId);
            navRef.current(runHref(toRunRef(run)));
          }}
        >
          {failed ? 'See what happened' : 'View results'}
        </ToastAction>
      ),
    });
    dismissWhenSeen(close);
  }, []);

  const report = useCallback(
    (input: RunReport, source: ReportSource) => {
      const prev = runsRef.current[input.runId];
      // A run the user hid stays hidden — but only against the passive sources.
      // Opening one deliberately still works, which is what `local` means.
      if (!prev && source !== 'local' && isDismissed(input.runId)) return;
      // Discovery only ever reports `running`, so letting it speak about a run
      // already being watched would walk a finished run backwards.
      if (prev && source === 'discovery') return;

      const now = Date.now();
      const next = mergeRun(prev, input, now);
      // Only the watcher announces anything. If a screen is holding the run in
      // the foreground it is already showing the user what happened, and the
      // progress screen sends them to the results by itself.
      const announce =
        source === 'watcher' &&
        prev != null &&
        prev.status === 'running' &&
        isTerminalStatus(next.status) &&
        !prev.notified;
      if (announce) next.notified = true;

      commit({ ...runsRef.current, [next.runId]: next });
      if (announce) notify(next);
    },
    [commit, notify],
  );

  const pollOne = useCallback(
    async (runId: string) => {
      // Stamped before the await so the next tick doesn't fire a second request
      // for a run that is already in flight.
      const held = runsRef.current[runId];
      if (held) {
        commit({ ...runsRef.current, [runId]: { ...held, lastPolledAt: Date.now() } });
      }
      try {
        const run = await complianceValidation.getRun(runId);
        report(
          {
            runId,
            status: run.status,
            reportType: run.report_type,
            certified: run.certified,
            errorCode: run.error_code ?? null,
          },
          'watcher',
        );
      } catch (e) {
        // The request layer has already started the session-expired flow.
        if (e instanceof ApiError && e.status === 401) return;
        const current = runsRef.current[runId];
        if (!current) return;
        // Gone rather than unreachable — stop watching something that no longer
        // exists, instead of retrying it until the tab closes.
        if (e instanceof ApiError && e.status === 404) {
          const next = { ...runsRef.current };
          delete next[runId];
          commit(next);
          return;
        }
        const failures = current.consecutiveFailures + 1;
        commit({
          ...runsRef.current,
          [runId]: {
            ...current,
            consecutiveFailures: failures,
            lostContact: failures >= MAX_CONSECUTIVE_FAILURES,
          },
        });
      }
    },
    [commit, report],
  );

  // ── the coordinator ──────────────────────────────────────────────────────
  // One timer for every run, rather than one timer each: the set of runs comes
  // and goes, and a per-run effect would tear its own loop down and restart it
  // on every unrelated state change.
  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;

    const due = (run: WatchedRun, now: number, hidden: boolean) => {
      const base = now - run.createdAt > POLL_CEILING_MS ? BACKOFF_POLL_MS : ACTIVE_POLL_MS;
      return now - run.lastPolledAt >= (hidden ? base * HIDDEN_MULTIPLIER : base);
    };

    const tick = () => {
      if (stopped) return;
      const now = Date.now();
      const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';

      for (const run of Object.values(runsRef.current)) {
        if (run.status !== 'running') continue;
        // Somebody else is already polling this one.
        if (foregroundRef.current.has(run.runId)) continue;
        if (due(run, now, hidden)) void pollOne(run.runId);
      }

      // Retire runs that finished a while ago.
      let swept = false;
      const next: RunMap = { ...runsRef.current };
      for (const run of Object.values(runsRef.current)) {
        if (run.terminalAt != null && now - run.terminalAt > GRACE_MS) {
          delete next[run.runId];
          swept = true;
        }
      }
      if (swept) commit(next);

      timer = window.setTimeout(tick, TICK_MS);
    };

    tick();

    // Coming back to the tab should feel immediate rather than waiting out
    // whatever interval was running while it was hidden.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      for (const run of Object.values(runsRef.current)) {
        if (run.status !== 'running') continue;
        if (foregroundRef.current.has(run.runId)) continue;
        if (now - run.lastPolledAt >= ACTIVE_POLL_MS) void pollOne(run.runId);
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [commit, pollOne]);

  // ── discovery ────────────────────────────────────────────────────────────
  // Depends on company_id rather than on `user`, so the unrelated company_name
  // backfill in AuthContext can't wipe the dock mid-run.
  useEffect(() => {
    // Belt and braces: this provider unmounts with the authenticated shell on
    // logout, but a company change must never carry runs across with it.
    commit({});
    if (!companyId) return;

    let stopped = false;
    const sweep = async () => {
      try {
        const rows = await complianceValidation.listRuns(companyId, {
          status: 'running',
          limit: 50,
        });
        if (stopped) return;
        for (const row of rows) {
          const started = Date.parse(row.created_at);
          report(
            {
              runId: row.run_id,
              status: row.status,
              title: row.title,
              period: row.period,
              reportType: row.report_type,
              certified: row.certified,
              errorCode: row.error_code,
              createdAt: Number.isNaN(started) ? Date.now() : started,
            },
            'discovery',
          );
        }
      } catch {
        // Supporting content. A failed sweep leaves whatever is already tracked
        // alone and tries again next minute.
      }
    };

    void sweep();
    const id = window.setInterval(() => void sweep(), DISCOVERY_INTERVAL_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [companyId, commit, report]);

  const claimForeground = useCallback((runId: string) => {
    const map = foregroundRef.current;
    map.set(runId, (map.get(runId) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const held = (map.get(runId) ?? 1) - 1;
      if (held <= 0) map.delete(runId);
      else map.set(runId, held);
    };
  }, []);

  const forget = useCallback(
    (runId: string) => {
      if (!runsRef.current[runId]) return;
      const next = { ...runsRef.current };
      delete next[runId];
      commit(next);
    },
    [commit],
  );

  const dismiss = useCallback(
    (runId: string) => {
      // The same list the resume shelf reads — one dismiss, one meaning.
      dismissRun(runId);
      forget(runId);
    },
    [forget],
  );

  // The toast is built before `forget` exists, and outlives the render that
  // built it, so it reaches this through a ref rather than closing over it.
  useEffect(() => {
    forgetRef.current = forget;
  }, [forget]);

  const value = useMemo<ComplianceRunsContextValue>(() => {
    const list = Object.values(runs).sort((a, b) => b.createdAt - a.createdAt);
    return {
      runs: list,
      runningCount: list.filter((r) => r.status === 'running').length,
      report,
      claimForeground,
      dismiss,
      forget,
      hrefFor: (run) => runHref(toRunRef(run)),
    };
  }, [runs, report, claimForeground, dismiss, forget]);

  return (
    <ComplianceRunsContext.Provider value={value}>{children}</ComplianceRunsContext.Provider>
  );
}

// runScreen/runHref decide from status and certified alone; this is the shape
// they actually need, spelled out so nothing has to pretend to be a full
// RunListItem to ask them a question.
function toRunRef(run: WatchedRun) {
  return { run_id: run.runId, status: run.status, certified: run.certified };
}

// Clears a toast once it has been *seen* for TOAST_DISMISS_MS, not merely once
// that long has passed. The two are the same thing only if the user is looking
// at the tab — and the entire point of this feature is that they aren't. A
// background timer would fade the one notice they walked away to receive, so
// the countdown runs only while the tab is visible and restarts on return.
function dismissWhenSeen(close: () => void): void {
  if (typeof document === 'undefined') {
    close();
    return;
  }
  let timer: number | undefined;

  const stop = () => {
    if (timer) window.clearTimeout(timer);
    timer = undefined;
  };
  const done = () => {
    stop();
    document.removeEventListener('visibilitychange', onVisibility);
    close();
  };
  const start = () => {
    if (document.visibilityState !== 'visible') return;
    timer = window.setTimeout(done, TOAST_DISMISS_MS);
  };
  function onVisibility() {
    stop();
    start();
  }

  document.addEventListener('visibilitychange', onVisibility);
  start();
}

export function useComplianceRuns(): ComplianceRunsContextValue {
  return useContext(ComplianceRunsContext);
}

// Claims a run for the screen that is already polling it, for as long as that
// screen is mounted. Nothing else — the caller reports its own state, so this
// can't capture a stale copy of it.
export function useForegroundRun(runId: string | undefined): void {
  const { claimForeground } = useComplianceRuns();
  useEffect(() => {
    if (!runId) return;
    return claimForeground(runId);
  }, [runId, claimForeground]);
}
