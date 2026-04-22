import { useCallback, useEffect, useRef, useState } from "react";
import { agentRuns } from "@/lib/api";
import type { AgentRun } from "@/types/report";

const POLL_INTERVAL_MS = 3000;
// Some real pipelines run >15 min. Cap is a user-dismissible safety valve,
// not a hard deadline — the "Keep waiting" button resets the timer.
const MAX_WATCH_MS = 30 * 60 * 1000;

export type PipelinePollState =
  | { phase: "idle"; run: null; elapsedMs: 0 }
  | { phase: "running"; run: AgentRun | null; elapsedMs: number }
  | { phase: "completed"; run: AgentRun; elapsedMs: number }
  | { phase: "failed"; run: AgentRun; elapsedMs: number }
  | { phase: "timeout"; run: AgentRun | null; elapsedMs: number };

export interface UsePipelinePollResult {
  state: PipelinePollState;
  restart: () => void;
}

export function usePipelinePoll(pollUrl: string | null): UsePipelinePollResult {
  const [state, setState] = useState<PipelinePollState>({
    phase: pollUrl ? "running" : "idle",
    run: null,
    elapsedMs: 0,
  });
  const [restartCount, setRestartCount] = useState(0);
  const mountedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!pollUrl) {
      setState({ phase: "idle", run: null, elapsedMs: 0 });
      return;
    }

    mountedAtRef.current = Date.now();
    setState({ phase: "running", run: null, elapsedMs: 0 });

    const controller = new AbortController();
    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      const elapsedMs = Date.now() - mountedAtRef.current;

      if (elapsedMs > MAX_WATCH_MS) {
        stopped = true;
        window.clearInterval(intervalId);
        setState((prev) => ({
          phase: "timeout",
          run: prev.run as AgentRun | null,
          elapsedMs,
        }));
        return;
      }

      try {
        const run = await agentRuns.getByPollUrl(pollUrl, controller.signal);
        if (stopped) return;
        if (run.status === "completed") {
          stopped = true;
          window.clearInterval(intervalId);
          setState({ phase: "completed", run, elapsedMs });
        } else if (run.status === "failed") {
          stopped = true;
          window.clearInterval(intervalId);
          setState({ phase: "failed", run, elapsedMs });
        } else {
          setState({ phase: "running", run, elapsedMs });
        }
      } catch (err) {
        // Transient network error — swallow and try again on the next tick.
        if ((err as Error)?.name === "AbortError") return;
      }
    };

    const intervalId = window.setInterval(tick, POLL_INTERVAL_MS);
    tick();

    return () => {
      stopped = true;
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [pollUrl, restartCount]);

  const restart = useCallback(() => {
    setRestartCount((c) => c + 1);
  }, []);

  return { state, restart };
}
