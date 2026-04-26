import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { usePipelinePoll } from "@/hooks/use-pipeline-poll";
import {
  clearActivePipeline,
  saveActivePipeline,
} from "@/lib/active-pipeline";
import { reports as reportsApi } from "@/lib/api";
import { GeneratingScreen } from "@/components/reports/GeneratingScreen";
import type { CoverageResponse } from "@/types/report";

export interface ProcessingPageState {
  runId: string;
  pollUrl: string;
  reportId: string | null;
  companyId: string;
  estimatedDurationSeconds: number | null;
  fileName: string | null;
  isExisting: boolean;
  conflictMessage?: string;
}

export default function ProcessingPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as ProcessingPageState | null;

  const pollUrl = state?.pollUrl ?? null;
  const runId = state?.runId ?? null;
  const { state: poll, restart } = usePipelinePoll(runId, pollUrl);

  // Coverage is fetched on this page on completion so the handoff back to
  // /reports renders the report immediately (no intermediate loader flash).
  const [coverageFetchError, setCoverageFetchError] = useState<string | null>(null);
  const handedOffRef = useRef(false);

  // Persist the active run so the user can resume from /reports if they leave.
  useEffect(() => {
    if (!state || !state.pollUrl || !state.companyId) return;
    saveActivePipeline({
      runId: state.runId,
      pollUrl: state.pollUrl,
      reportId: state.reportId,
      companyId: state.companyId,
      fileName: state.fileName,
      estimatedDurationSeconds: state.estimatedDurationSeconds,
    });
  }, [state]);

  useEffect(() => {
    if (poll.phase === "failed") {
      clearActivePipeline();
    }
  }, [poll.phase]);

  // Completion handler — fetch coverage, then navigate.
  useEffect(() => {
    if (poll.phase !== "completed" || handedOffRef.current) return;
    if (!state?.companyId) return;
    const resolvedReportId =
      poll.run.input_summary?.report_id ?? state.reportId ?? null;
    if (!resolvedReportId) {
      // No report id to look up — fall back to the reports list.
      handedOffRef.current = true;
      clearActivePipeline();
      navigate("/reports", { replace: true });
      return;
    }

    handedOffRef.current = true;
    reportsApi
      .getCoverage<CoverageResponse>(state.companyId, resolvedReportId)
      .then((cov) => {
        clearActivePipeline();
        // Hand the freshly fetched coverage to the detail page via location
        // state so it renders immediately without a second GET /coverage.
        navigate(`/reports/${resolvedReportId}`, {
          replace: true,
          state: { coverage: cov },
        });
      })
      .catch((err: unknown) => {
        // Surface the error in-place; clear handoff flag so a retry triggers.
        handedOffRef.current = false;
        setCoverageFetchError(
          err instanceof Error ? err.message : "Failed to load report coverage.",
        );
      });
  }, [poll, navigate, state]);

  // Deep link / refresh — nothing to poll.
  if (!state || !pollUrl) {
    return (
      <GeneratingScreen
        phase="failed"
        errorMessage="This page tracks a report-generation run. Start a new report from Reports to get here."
        onCancel={() => navigate("/reports", { replace: true })}
      />
    );
  }

  // Coverage fetch failed after polling reported completed — surface as an error.
  if (coverageFetchError) {
    return (
      <GeneratingScreen
        phase="failed"
        errorMessage={coverageFetchError}
        onCancel={() => navigate("/reports", { replace: true })}
        onRetry={() => {
          setCoverageFetchError(null);
          handedOffRef.current = false;
          // Trigger the completion effect again by bumping poll.
          restart();
        }}
      />
    );
  }

  // Happy path — delegate the full visual state to GeneratingScreen.
  return (
    <GeneratingScreen
      phase={poll.phase === "idle" ? "running" : poll.phase}
      errorMessage={poll.phase === "failed" ? poll.run.error_message : null}
      onCancel={() => navigate("/reports", { replace: true })}
      onRetry={() => navigate("/reports", { replace: true })}
      onKeepWaiting={restart}
      fileName={fileNameFor(poll, state)}
      nodes={poll.nodes}
    />
  );
}

function fileNameFor(
  poll: ReturnType<typeof usePipelinePoll>["state"],
  state: ProcessingPageState,
): string | null {
  const fromRun = poll.run?.input_summary?.file_names;
  if (fromRun && fromRun.length > 0) {
    return fromRun.length === 1 ? fromRun[0] : `${fromRun.length} files`;
  }
  return state.fileName;
}

