import { useEffect, useRef, useState } from 'react';
import { companies as companiesApi } from '@/lib/api';
import type { AnnualReportExtraction as Extraction } from '@/types/company';
import { isRunInProgress, mayStillFinish } from './extractionLive';

// Loads what was extracted and keeps it fresh while a run is going.

export const POLL_EVERY_MS = 2000;
export const POLL_SLOWEST_MS = 10000;
export const POLL_GIVE_UP_MS = 15 * 60 * 1000;
// Right after "Process" the first answer can still say "not running" for a moment,
// so keep asking for a few seconds before believing it.
export const START_GRACE_MS = 6000;

export type LoadProblem = 'old_backend' | 'failed';

export interface LiveExtractionState {
  data: Extraction | null;
  problem: LoadProblem | null;
  gaveUp: boolean;
}

/** True when the server answered "no such route", i.e. it predates this panel. */
function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { status?: number }).status === 404;
}

/** The wait before the next poll after a failed one: doubles, up to a ceiling. */
function slowerDelay(currentDelay: number): number {
  return Math.min(currentDelay * 2, POLL_SLOWEST_MS);
}

/**
 * Fetches the extraction, then polls every 2 s while a run is in progress.
 *
 * `refreshKey` is bumped by the page when it starts a run; that restarts the loop.
 * `onRunningChange` is told true when a run is seen and false once none is going.
 */
export function useLiveExtraction(
  companyId: string | null,
  refreshKey: number,
  onRunningChange?: (running: boolean) => void,
): LiveExtractionState {
  const [data, setData] = useState<Extraction | null>(null);
  const [problem, setProblem] = useState<LoadProblem | null>(null);
  const [gaveUp, setGaveUp] = useState(false);

  // Refs, not effect dependencies: a parent re-render (new callback identity) or a
  // fresh poll result must not restart the polling loop.
  const onRunningChangeRef = useRef(onRunningChange);
  onRunningChangeRef.current = onRunningChange;
  const hasDataRef = useRef(false);
  const loadedCompanyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = POLL_EVERY_MS;
    let lastSeenRunning = false;
    let everSeenRunning = false;
    // False until the server has answered once in this loop. Only an answer can say
    // "not running"; a failed request says nothing either way.
    let answered = false;
    let recheckStalled = false;
    let reportedRunning: boolean | null = null;
    const loopStartedAt = Date.now();
    const runJustStarted = refreshKey > 0;
    const graceEndsAt = runJustStarted ? loopStartedAt + START_GRACE_MS : 0;

    // Old rows are only thrown away for a different company. A refetch for the
    // same company keeps them on screen, otherwise every poll would flicker.
    if (loadedCompanyRef.current !== companyId) {
      loadedCompanyRef.current = companyId;
      hasDataRef.current = false;
      setData(null);
    }
    setProblem(null);
    setGaveUp(false);

    /** Tells the page whether a run is going, once per change. */
    function reportRunning(running: boolean) {
      if (reportedRunning === running) return;
      reportedRunning = running;
      onRunningChangeRef.current?.(running);
    }

    /** True while a run the page just started has not been confirmed either way. */
    function isStillStarting(): boolean {
      if (!runJustStarted || everSeenRunning) return false;
      return !answered || Date.now() < graceEndsAt;
    }

    /** Stops for good after the cut-off, with a message that fits what was seen. */
    function stopAfterCutOff() {
      if (lastSeenRunning) setGaveUp(true);
      if (!hasDataRef.current) setProblem('failed');
      reportRunning(false);
    }

    /** Decides, after each poll, whether to ask again. */
    function scheduleNextPoll() {
      if (Date.now() - loopStartedAt >= POLL_GIVE_UP_MS) {
        stopAfterCutOff();
        return;
      }
      if (lastSeenRunning || isStillStarting()) {
        timer = setTimeout(pollOnce, delay);
        return;
      }
      // Nothing is running as far as the backend knows, so the form is unlocked.
      reportRunning(false);
      // A run that outlived the backend's "still alive" window may yet finish, so
      // keep looking at the slow rate; the rows fill in if it does.
      if (recheckStalled) timer = setTimeout(pollOnce, POLL_SLOWEST_MS);
    }

    /** One request: store the answer, or keep the last answer if it failed. */
    async function pollOnce() {
      try {
        const result = await companiesApi.getAnnualReportExtraction(companyId as string);
        if (cancelled) return;
        hasDataRef.current = true;
        answered = true;
        setData(result);
        setProblem(null);
        delay = POLL_EVERY_MS;
        lastSeenRunning = isRunInProgress(result);
        recheckStalled = mayStillFinish(result);
        if (lastSeenRunning) {
          everSeenRunning = true;
          reportRunning(true);
        }
      } catch (error) {
        if (cancelled) return;
        const nothingToShow = !hasDataRef.current;
        // A 404 never heals by retrying. Any other failure right after the page
        // started a run is retried: the run is live even if this request was not.
        if (nothingToShow && (isNotFound(error) || !isStillStarting())) {
          setProblem(isNotFound(error) ? 'old_backend' : 'failed');
          reportRunning(false);
          return;
        }
        delay = slowerDelay(delay);
      }
      scheduleNextPoll();
    }

    pollOnce();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [companyId, refreshKey]);

  return { data, problem, gaveUp };
}
