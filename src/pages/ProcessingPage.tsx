import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { usePipelinePoll } from "@/hooks/use-pipeline-poll";
import {
  clearActivePipeline,
  saveActivePipeline,
} from "@/lib/active-pipeline";
import { reports as reportsApi } from "@/lib/api";
import { GeneratingScreen } from "@/components/reports/GeneratingScreen";
import { QuarterlyGeneratingScreen } from "@/components/reports/QuarterlyGeneratingScreen";
import { useAuth } from "@/context/AuthContext";
import { isPeriodNotFound } from "@/types/report";
import type { CoverageResponse } from "@/types/report";

// Payload the quarterly first screen reads to pop the period_not_found modal
// and pre-fill the pickers. Handed over via router state on redirect.
export interface QuarterlyPeriodErrorState {
  requestedPeriod: string;
  availablePeriods: string[];
  message: string;
}

// State handed to the quarterly first screen when the user is sent back to
// correct a period_not_found error. `prefill*` seeds the pickers (parsed from
// `available_periods[0]`); `periodError` drives the modal shown over the form.
export interface QuarterlyPrefillState {
  prefillQuarter?: string;
  prefillYear?: number;
  periodError?: QuarterlyPeriodErrorState;
}

// "Q1-2026" / "Q1 2026" → { prefillQuarter: "Q1", prefillYear: 2026 }. Returns an
// empty object when the string doesn't match, so a malformed period is harmless.
function parsePeriod(period: string | undefined): {
  prefillQuarter?: string;
  prefillYear?: number;
} {
  if (!period) return {};
  const m = period.match(/Q([1-4])[-\s]?(\d{4})/i);
  if (!m) return {};
  return { prefillQuarter: `Q${m[1]}`, prefillYear: Number(m[2]) };
}

export interface ProcessingPageState {
  runId: string;
  pollUrl: string;
  reportId: string | null;
  companyId: string;
  estimatedDurationSeconds: number | null;
  fileName: string | null;
  isExisting: boolean;
  conflictMessage?: string;
  // Drives which processing UI we render. "quarterly" → financial extraction
  // screen; anything else (incl. undefined) → the default ESG screen.
  reportType?: string;
  // Display-only label for the quarterly hero, e.g. "Q1 2025".
  period?: string;
}

export default function ProcessingPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
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
      reportType: state.reportType,
      period: state.period,
    });
  }, [state]);

  useEffect(() => {
    if (poll.phase === "failed") {
      clearActivePipeline();
    }
  }, [poll.phase]);

  // period_not_found handler — recoverable user-input error. The backend has
  // already wiped the report + uploads (cleaned_up: true), so we make NO cleanup
  // call. We route back to the quarterly first screen, handing over the error
  // (for a modal shown over the form) and a prefill parsed from the first
  // available period. The dead report_id/run_id are simply discarded.
  useEffect(() => {
    if (poll.phase !== "failed" || handedOffRef.current) return;
    const summary = poll.run?.output_summary ?? null;
    if (!isPeriodNotFound(summary)) return;

    handedOffRef.current = true;
    clearActivePipeline();
    navigate("/reports/quarterly", {
      replace: true,
      state: {
        ...parsePeriod(summary.available_periods?.[0]),
        periodError: {
          requestedPeriod: summary.requested_period,
          availablePeriods: summary.available_periods ?? [],
          message: summary.message,
        },
      } satisfies QuarterlyPrefillState,
    });
  }, [poll, navigate]);

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

    // Quarterly reports go to the Coverage Map page (step 4); it fetches its own data.
    if (state.reportType === "quarterly") {
      clearActivePipeline();
      navigate(`/quarterly-report/${resolvedReportId}/coverage`, { replace: true });
      return;
    }

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

  const phase = poll.phase === "idle" ? "running" : poll.phase;

  // Quarterly reports get the financial-extraction screen (progress ring +
  // figures/drivers/comparatives + step checklist). Same poll, different skin.
  if (state.reportType === "quarterly") {
    const summary = poll.run?.output_summary ?? null;
    const periodError = isPeriodNotFound(summary);
    // Narrowed pipeline metrics (never the period_not_found payload).
    const metrics = periodError ? null : summary;

    return (
      <QuarterlyGeneratingScreen
        // On period_not_found the redirect effect is navigating away this same
        // tick — keep the running skin so the generic failure card never flashes.
        phase={periodError ? "running" : phase}
        errorMessage={phase === "failed" ? poll.run.error_message : null}
        // "Run in background" returns to the Quarterly reports page.
        onCancel={() => navigate("/reports/quarterly", { replace: true })}
        onRetry={() => navigate("/reports/quarterly", { replace: true })}
        onKeepWaiting={restart}
        period={state.period ?? null}
        companyName={user?.company_name ?? null}
        nodes={poll.nodes}
        outputSummary={metrics}
      />
    );
  }

  // Happy path — delegate the full visual state to GeneratingScreen.
  return (
    <GeneratingScreen
      phase={phase}
      errorMessage={phase === "failed" ? poll.run.error_message : null}
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

