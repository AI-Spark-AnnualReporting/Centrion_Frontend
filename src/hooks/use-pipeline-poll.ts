import { useCallback, useEffect, useRef, useState } from "react";
import { agentRuns } from "@/lib/api";
import type { AgentNode, AgentRun } from "@/types/report";

const POLL_INTERVAL_MS = 3000;
// Some real pipelines run >15 min. Cap is a user-dismissible safety valve,
// not a hard deadline — the "Keep waiting" button resets the timer.
const MAX_WATCH_MS = 30 * 60 * 1000;

export type PipelinePollState =
  | { phase: "idle"; run: null; nodes: AgentNode[]; elapsedMs: 0 }
  | { phase: "running"; run: AgentRun | null; nodes: AgentNode[]; elapsedMs: number }
  | { phase: "completed"; run: AgentRun; nodes: AgentNode[]; elapsedMs: number }
  | { phase: "failed"; run: AgentRun; nodes: AgentNode[]; elapsedMs: number }
  | { phase: "timeout"; run: AgentRun | null; nodes: AgentNode[]; elapsedMs: number };

export interface UsePipelinePollResult {
  state: PipelinePollState;
  restart: () => void;
}

export function usePipelinePoll(
  runId: string | null,
  pollUrl: string | null,
): UsePipelinePollResult {
  const [state, setState] = useState<PipelinePollState>({
    phase: pollUrl ? "running" : "idle",
    run: null,
    nodes: [],
    elapsedMs: 0,
  });
  const [restartCount, setRestartCount] = useState(0);
  const mountedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!pollUrl) {
      setState({ phase: "idle", run: null, nodes: [], elapsedMs: 0 });
      return;
    }

    mountedAtRef.current = Date.now();
    setState({ phase: "running", run: null, nodes: [], elapsedMs: 0 });

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
          nodes: prev.nodes,
          elapsedMs,
        }));
        return;
      }

      try {
        // Fetch the run envelope and the per-agent nodes in parallel. The
        // nodes fetch has its own catch so a transient failure there cannot
        // reject the whole Promise.all — the run endpoint remains authoritative
        // for phase transitions, the timeline can stay stale for one tick.
        const [run, nodesResult] = await Promise.all([
          agentRuns.getByPollUrl(pollUrl, controller.signal),
          runId
            ? agentRuns.getNodes(runId, controller.signal).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (stopped) return;

        setState((prev) => {
          const nextNodes = nodesResult ? nodesResult.nodes : prev.nodes;
          if (run.status === "completed") {
            stopped = true;
            window.clearInterval(intervalId);
            return { phase: "completed", run, nodes: nextNodes, elapsedMs };
          }
          if (run.status === "failed") {
            stopped = true;
            window.clearInterval(intervalId);
            return { phase: "failed", run, nodes: nextNodes, elapsedMs };
          }
          return { phase: "running", run, nodes: nextNodes, elapsedMs };
        });
      } catch (err) {
        // Transient network error on the run endpoint — swallow and try again
        // on the next tick. Nodes failures are handled above and never land here.
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
  }, [runId, pollUrl, restartCount]);

  const restart = useCallback(() => {
    setRestartCount((c) => c + 1);
  }, []);

  return { state, restart };
}
