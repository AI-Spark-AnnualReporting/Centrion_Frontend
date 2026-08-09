import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { usePipelinePoll } from "@/hooks/use-pipeline-poll";
import {
  clearActivePipeline,
  saveActivePipeline,
} from "@/lib/active-pipeline";
import { reports as reportsApi, quarterlyReports, ApiError } from "@/lib/api";
import { GeneratingScreen } from "@/components/reports/GeneratingScreen";
import {
  QuarterlyGeneratingScreen,
  computeProgress,
} from "@/components/reports/QuarterlyGeneratingScreen";
import AiLoadingScreen from "@/pages/onboarding/AiLoadingScreen";
import { useAuth } from "@/context/AuthContext";
import { isPeriodNotFound } from "@/types/report";
import type { CoverageResponse } from "@/types/report";
import type { OutlineSavePayload } from "@/types/quarterly";

// The quarterly "Generate Report" loader reuses the onboarding workspace loader
// (AiLoadingScreen). These milestones/tips are the quarterly-flavoured copy.
const QUARTERLY_MILESTONES = [
  "Parsing your documents",
  "Extracting the financial figures",
  "Linking drivers and reasons",
  "Loading prior-period comparatives",
];
const QUARTERLY_TIPS = [
  "We read your financial statements to extract the key figures automatically.",
  "Every extracted figure is linked back to the page it came from.",
  "Movements without a stated reason are flagged for you to fill in.",
  "Prior-period comparatives are matched so the narrative can explain changes.",
];

// Section-production loader (kicked from the Outline → lands on Preview).
const PRODUCE_MILESTONES = [
  "Composing narrative sections",
  "Filling the report tables",
  "Applying your tone and voices",
  "Finalizing the report",
];
const PRODUCE_TIPS = [
  "Each section is written from your extracted figures and drivers.",
  "Table and KPI sections are rendered directly from the numbers.",
  "Sections that still need your input stay editable on the next screen.",
  "You can refine any AI-written section's tone right in the preview.",
];

// Backend-provided counts shown in the loader — only rendered once the pipeline
// has populated them (never fabricated). Mirrors QuarterlyGeneratingScreen.
function QuarterlyStatTiles({ summary }: { summary: unknown }) {
  const s = (summary ?? {}) as {
    figures_extracted?: number;
    figures_total?: number;
    drivers_linked?: number;
    drivers_total?: number;
    comparatives_matched?: number;
    comparatives_total?: number;
  };
  const tiles: { value: number; total: number | null; label: string }[] = [];
  if (s.figures_extracted != null)
    tiles.push({ value: s.figures_extracted, total: s.figures_total ?? null, label: "Figures extracted" });
  if (s.drivers_linked != null)
    tiles.push({ value: s.drivers_linked, total: s.drivers_total ?? null, label: "Drivers linked" });
  if (s.comparatives_matched != null)
    tiles.push({ value: s.comparatives_matched, total: s.comparatives_total ?? null, label: "Comparatives matched" });
  if (tiles.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 22, justifyContent: "center", flexWrap: "wrap" }}>
      {tiles.map((t) => (
        <div key={t.label} style={{ textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#4040C8" }}>
            {t.value}
            {t.total != null && (
              <span style={{ fontSize: 13, fontWeight: 700, color: "#9BA3C4" }}>/{t.total}</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: "#9BA3C4", marginTop: 2 }}>{t.label}</div>
        </div>
      ))}
    </div>
  );
}

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
  // Where a completed quarterly run hands off. Extraction → "extraction" (default),
  // the review screen where the user confirms which figures are which metric;
  // section-production (produceAll, kicked from the Outline) → "preview".
  // Custom-metrics reports → "financials": this run only read their narrative
  // documents, and their figures come from the per-section uploads on that screen.
  quarterlyNext?: "extraction" | "financials" | "outline" | "preview";
  // Set when the caller navigated BEFORE a run existed, so the user reaches the
  // loader on the click instead of watching a dead button. Locking an outline takes
  // a few seconds and produceAll can only be kicked after it, so the Outline page
  // used to await all of that before navigating. With this, ProcessingPage performs
  // save → lock → produceAll itself and fills in runId/pollUrl when they arrive.
  // runId/pollUrl are sent as "" in that case.
  bootstrap?: {
    kind: "quarterly-produce";
    outlinePayload: OutlineSavePayload;
  };
}

export default function ProcessingPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const state = location.state as ProcessingPageState | null;

  // A bootstrapped run has no ids yet — the caller sent "" and we resolve them here.
  // `||` (not `??`) so those empty strings fall through to the resolved values.
  const [bootRun, setBootRun] = useState<{ runId: string; pollUrl: string } | null>(null);
  const pollUrl = state?.pollUrl || bootRun?.pollUrl || null;
  const runId = state?.runId || bootRun?.runId || null;
  const { state: poll, restart } = usePipelinePoll(runId, pollUrl);

  // Bootstrap: save + lock the outline, then kick produceAll. Runs ONCE, after the
  // loader is already on screen, which is the whole point — these calls take several
  // seconds and used to happen while the user stared at a disabled button.
  const bootstrappedRef = useRef(false);
  useEffect(() => {
    const boot = state?.bootstrap;
    if (!boot || !state?.companyId || !state?.reportId) return;
    if (state.runId || bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    const companyId = state.companyId;
    const reportId = state.reportId;

    (async () => {
      try {
        // Guard against redoing save → lock → produceAll on a revisit — this
        // effect re-runs from scratch on every fresh mount of this page (e.g.
        // the browser back/forward button can remount it with this exact same
        // bootstrap state), but `bootstrappedRef` only protects against a
        // second run WITHIN one mount. Check the outline's real, current lock
        // status first: if it's already locked, sections were already
        // produced on an earlier pass, so just go look at them instead of
        // regenerating everything again.
        const current = await quarterlyReports.getOutline(companyId, reportId).catch(() => null);
        const alreadyLocked =
          current != null &&
          (current.locked === true ||
            (current.sections.length > 0 && current.sections.every((s) => s.locked)));
        if (alreadyLocked) {
          navigate(`/quarterly-report/${reportId}/preview`, { replace: true });
          return;
        }

        await quarterlyReports.saveOutline(companyId, reportId, boot.outlinePayload);
        await quarterlyReports.lockOutline(companyId, reportId);
        const handle = await quarterlyReports.produceAll(companyId, reportId);
        if (handle?.run_id && handle?.poll_url) {
          setBootRun({ runId: handle.run_id, pollUrl: handle.poll_url });
          return;
        }
        // Batch produce didn't come back with a handle — Preview can still produce
        // each section individually, so hand off there rather than stranding the user.
        navigate(`/quarterly-report/${reportId}/preview`, { replace: true });
      } catch (err: unknown) {
        // 409 = already locked elsewhere; sections are (being) produced. Don't
        // re-kick production, just go look at them. Same rule the Outline page used.
        if (err instanceof ApiError && err.status === 409) {
          navigate(`/quarterly-report/${reportId}/preview`, { replace: true });
          return;
        }
        navigate(`/quarterly-report/${reportId}/preview`, { replace: true });
      }
    })();
  }, [state, navigate]);

  // Coverage is fetched on this page on completion so the handoff back to
  // /reports renders the report immediately (no intermediate loader flash).
  const [coverageFetchError, setCoverageFetchError] = useState<string | null>(null);
  const handedOffRef = useRef(false);
  // Quarterly: report_id resolved on completion. Setting it flips the onboarding
  // loader to its "done" state; the loader's onDone then navigates to coverage.
  const [readyReportId, setReadyReportId] = useState<string | null>(null);

  // Stable so AiLoadingScreen's progress animation isn't restarted on each poll
  // tick (its effect depends on onDone identity).
  const handleQuarterlyLoaderDone = useCallback(() => {
    if (readyReportId) {
      // Extraction now lands on the review screen, not the outline: the user has to
      // confirm the uncertain metric mappings before those figures exist at all.
      const next = state?.quarterlyNext ?? "extraction";
      navigate(`/quarterly-report/${readyReportId}/${next}`, { replace: true });
    }
  }, [readyReportId, navigate, state?.quarterlyNext]);

  // Persist the active run so the user can resume from /reports if they leave.
  // Keyed off the RESOLVED ids, not state.*, so a bootstrapped run is persisted too
  // once its ids arrive (state.runId/pollUrl stay "" for those).
  useEffect(() => {
    if (!state || !pollUrl || !runId || !state.companyId) return;
    saveActivePipeline({
      runId,
      pollUrl,
      reportId: state.reportId,
      companyId: state.companyId,
      fileName: state.fileName,
      estimatedDurationSeconds: state.estimatedDurationSeconds,
      reportType: state.reportType,
      period: state.period,
    });
  }, [state, runId, pollUrl]);

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

    // Quarterly: don't navigate here — flip the onboarding loader to "done" and
    // let its onDone finish the animation, then hand off to the Coverage Map.
    if (state.reportType === "quarterly") {
      clearActivePipeline();
      setReadyReportId(resolvedReportId);
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

  // Deep link / refresh — nothing to poll. A bootstrapping run has no pollUrl yet
  // (it's still locking the outline), so it must NOT fall in here.
  if (!state || (!pollUrl && !state.bootstrap)) {
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

  // Quarterly reports. The running/completing state uses the onboarding workspace
  // loader (AiLoadingScreen). Hard failure / timeout keep the detailed
  // QuarterlyGeneratingScreen card (retry / keep-waiting / cancel + the
  // period_not_found redirect, which its own effect drives).
  if (state.reportType === "quarterly") {
    const summary = poll.run?.output_summary ?? null;
    const periodError = isPeriodNotFound(summary);
    const hardFailure = phase === "failed" && !periodError;

    if (hardFailure || phase === "timeout") {
      return (
        <QuarterlyGeneratingScreen
          phase={phase}
          errorMessage={phase === "failed" ? poll.run.error_message : null}
          onCancel={() => navigate("/reports/quarterly", { replace: true })}
          onRetry={() => navigate("/reports/quarterly", { replace: true })}
          onKeepWaiting={restart}
          period={state.period ?? null}
          companyName={user?.company_name ?? null}
          nodes={poll.nodes}
          outputSummary={periodError ? null : summary}
        />
      );
    }

    // Running / completed (and period_not_found while its effect redirects).
    // The onboarding loader visual, but bound to the REAL pipeline: progress from
    // node states, backend stat tiles, and a "Run in background" button.
    // Full-viewport overlay so it reads full-screen (its own minHeight:100vh).
    const progress = computeProgress(phase === "completed" ? "completed" : "running", poll.nodes);
    // Two quarterly loaders share this screen: extraction (→ Outline) and
    // section-production (→ Preview). Copy + milestones differ by target.
    const isProduce = state.quarterlyNext === "preview";
    const copy = isProduce
      ? {
          title: "Composing your report",
          subtitle: "Writing each section from your figures and inputs.",
          doneSubtitle: "Taking you to the preview…",
          milestones: PRODUCE_MILESTONES,
          tips: PRODUCE_TIPS,
        }
      : {
          title: "Processing your report",
          subtitle: "Reading your documents and extracting the figures.",
          doneSubtitle: "Taking you to the figures we found…",
          milestones: QUARTERLY_MILESTONES,
          tips: QUARTERLY_TIPS,
        };
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 1400, overflowY: "auto" }}>
        <AiLoadingScreen
          title={copy.title}
          subtitle={copy.subtitle}
          doneTitle="Report ready"
          doneSubtitle={copy.doneSubtitle}
          milestones={copy.milestones}
          tips={copy.tips}
          controlledProgress={progress}
          done={readyReportId != null}
          onDone={handleQuarterlyLoaderDone}
          headerExtra={<QuarterlyStatTiles summary={periodError ? null : summary} />}
          footer={
            <button
              type="button"
              onClick={() => navigate("/reports/quarterly", { replace: true })}
              style={{
                padding: "8px 18px",
                fontSize: 11,
                fontWeight: 600,
                color: "#5A6080",
                background: "transparent",
                border: "1px solid #E2E4F0",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Run in background
            </button>
          }
        />
      </div>
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

