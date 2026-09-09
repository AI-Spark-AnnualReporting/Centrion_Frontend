import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { usePipelinePoll } from "@/hooks/use-pipeline-poll";
import {
  clearActivePipeline,
  saveActivePipeline,
} from "@/lib/active-pipeline";
import { reports as reportsApi, quarterlyReports, ApiError } from "@/lib/api";
import { GeneratingScreen, type GeneratingPhase } from "@/components/reports/GeneratingScreen";
import {
  QuarterlyGeneratingScreen,
  computeProgress,
  computeProduceProgress,
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

// What the bootstrap chain is doing right now. Purely descriptive: it names the
// call in flight so the loader can say something true while there is no measured
// progress. Nothing here is a deadline.
//
// There deliberately is NO clock on this chain any more. There used to be a flat
// 45s one, armed once at mount over all four calls, with no liveness input — it
// could not tell "still working" from "never started", so on a large outline (one
// Supabase round-trip per section; the lock→produce window alone measures 22-39s
// on real reports) it fired on perfectly healthy runs and painted "Report
// generation failed" over them. Its own comment claimed it was there to catch a
// missing companyId/reportId, but the only caller (OutlinePage's onGenerate)
// already returns early without those, and that case is knowable in 0ms anyway —
// see the effect below. It guarded nothing and lied often.
//
// A big upload, a long section list or a slow server is a slow report, not a
// failed one. Only the server saying no is a failure now.
type BootStep = "probing" | "saving" | "locking" | "producing";
const BOOT_STEP_LABEL: Record<BootStep, string> = {
  probing: "Checking your outline…",
  saving: "Saving your outline…",
  locking: "Locking the outline…",
  producing: "Starting section production…",
};

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
  // Batch section-production runs have no per-agent node rows: GET /agent_runs/{id}/nodes
  // 404s for anything whose agent_name isn't 'pipeline_run', and section_producer_batch
  // writes none. Asking anyway was a guaranteed 404 every three seconds for the whole
  // multi-minute run — and the empty node list it fell back to is exactly what pinned
  // computeProgress at its 6% floor, so the bar never moved. Real progress for these runs
  // comes from the run's own heartbeat instead (see computeProduceProgress below).
  const isProduce = state?.quarterlyNext === "preview";
  const { state: poll, restart } = usePipelinePoll(runId, pollUrl, { nodes: !isProduce });

  // Bootstrap: save + lock the outline, then kick produceAll. Runs ONCE, after the
  // loader is already on screen, which is the whole point — these calls take several
  // seconds and used to happen while the user stared at a disabled button.
  const bootstrappedRef = useRef(false);
  // Cheap short-circuit for the 409 disambiguation in the catch: past this point a
  // 409 can only mean "already locked".
  const lockAttempted = useRef(false);
  const [bootError, setBootError] = useState<string | null>(null);
  // Which call is in flight, for the loader caption. Not a deadline — see BootStep.
  const [bootStep, setBootStep] = useState<BootStep | null>(null);

  // The one genuinely-broken hand-off: bootstrap state with no ids to act on. The
  // effect below returns early on it and has no other way to report that, which is
  // the entire job the old 45s timer claimed. It is knowable immediately, so say it
  // immediately instead of making the user wait to be told.
  useEffect(() => {
    if (!state?.bootstrap || pollUrl) return;
    if (state.companyId && state.reportId) return;
    setBootError("This run is missing its report or company id, so nothing could be started");
  }, [state, pollUrl]);
  useEffect(() => {
    const boot = state?.bootstrap;
    if (!boot || !state?.companyId || !state?.reportId) return;
    if (state.runId || bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    const companyId = state.companyId;
    const reportId = state.reportId;

    // Ground truth, asked twice: once up front to skip a revisit, and once from the
    // catch to disambiguate a 409. `.catch(() => null)` reads as "not locked", which
    // is precisely why the second call matters — a probe that failed to reach the
    // server is one of the ways a locked outline reaches the save and 409s there.
    const isLockedNow = async () => {
      const o = await quarterlyReports.getOutline(companyId, reportId).catch(() => null);
      return (
        o != null &&
        (o.locked === true || (o.sections.length > 0 && o.sections.every((s) => s.locked)))
      );
    };

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
        setBootStep("probing");
        if (await isLockedNow()) {
          navigate(`/quarterly-report/${reportId}/preview`, { replace: true });
          return;
        }

        setBootStep("saving");
        await quarterlyReports.saveOutline(companyId, reportId, boot.outlinePayload);
        setBootStep("locking");
        // Past here a 409 can only mean "already locked", so the catch can skip its
        // re-probe. Before here it is ambiguous — see the catch.
        lockAttempted.current = true;
        await quarterlyReports.lockOutline(companyId, reportId);
        setBootStep("producing");
        const handle = await quarterlyReports.produceAll(companyId, reportId);
        if (handle?.run_id && handle?.poll_url) {
          // A live run handle retires every reason to be showing an error. The
          // failure card used to be sticky AND rendered above the poll, so a chain
          // that tripped the old timer and then succeeded seconds later left the user
          // staring at "Report generation failed" over a run that was working fine.
          setBootError(null);
          setBootStep(null);
          setBootRun({ runId: handle.run_id, pollUrl: handle.poll_url });
          return;
        }
        // Batch produce didn't come back with a handle — Preview can still produce
        // each section individually, so hand off there rather than stranding the user.
        navigate(`/quarterly-report/${reportId}/preview`, { replace: true });
      } catch (err: unknown) {
        // 409 arrives from two places and means two different things.
        //
        // From lock or produce: the outline is already locked and sections are (being)
        // produced — going to look at them is right.
        //
        // From the SAVE, before any lock: usually a real refusal ("that section is
        // mandatory"), which MUST be surfaced. Swallowing it is how a rejected save
        // became a permanent spinner — the outline was never locked and not one
        // section row existed, and Preview infers "producing" purely from rows sitting
        // at pending, so it showed "0 of 27" forever with nothing running.
        //
        // But 409 is ALSO what a locked outline returns for this payload: a saved
        // outline always carries its unticked rows (they are what preserve an unticked
        // section's dragged position), and the post-lock reorder path rejects any item
        // with included:false. That happens whenever the probe above could not read the
        // outline, or another tab locked it in between.
        //
        // The status code cannot tell those apart, so ask the server which one it is
        // instead of inferring it from which call threw. Guessing in either direction
        // is a bug we have already shipped once.
        if (err instanceof ApiError && err.status === 409) {
          if (lockAttempted.current || (await isLockedNow())) {
            navigate(`/quarterly-report/${reportId}/preview`, { replace: true });
            return;
          }
        }
        setBootError(
          err instanceof Error
            ? err.message
            : 'The report outline could not be saved, so production never started.',
        );
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

  // Saving or locking the outline was refused, so production never started. Shown
  // here rather than handing off to Preview: Preview infers "producing" from rows
  // still at pending, so with no rows at all it spins forever on a run that does not
  // exist. Retry re-runs the bootstrap rather than pretending it worked.
  //
  // Gated on `!pollUrl`. This branch sits above every poll-driven render below and
  // nothing in the app ever cleared bootError, so once a slow-but-healthy chain
  // tripped the old blind timer the page held a live run handle AND showed a
  // permanent failure card — right through to the report finishing. A run we are
  // actually watching outranks any earlier complaint, always.
  if (bootError && !pollUrl) {
    return (
      <GeneratingScreen
        phase="failed"
        errorMessage={`${bootError} — nothing is being generated. Go back to the outline and try again.`}
        onCancel={() => navigate("/reports", { replace: true })}
        onRetry={() =>
          // The old handler reset three flags and fired zero requests: the bootstrap
          // effect's deps are [state, navigate], both referentially stable in
          // react-router 6.30.1, and there is no StrictMode, so nothing re-ran. The
          // button did nothing at all.
          //
          // Send the user back to the outline rather than replaying the chain here.
          // Reaching this branch means the server refused, and the refusal is usually
          // something only the outline can fix (a mandatory section unticked). Its
          // Continue also already handles the already-locked case by going to Preview.
          navigate(
            state.reportId ? `/quarterly-report/${state.reportId}/outline` : "/reports",
            { replace: true },
          )
        }
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

  // Still "running" while bootstrapping, and only then. A bootstrapping run has no
  // pollUrl yet by design -- the loader goes up first, on purpose, because locking
  // the outline takes seconds -- so `idle` here is legitimate. Everywhere else it
  // means the hook is watching nothing, and painting that as progress is what left
  // a loading screen up over a job that was never started. The deadline above is
  // what stops even this window running forever.
  const phase: GeneratingPhase =
    poll.phase !== "idle" ? poll.phase : state.bootstrap ? "running" : "failed";

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
    // Two quarterly loaders share this screen: extraction (→ Outline) and
    // section-production (→ Preview). Copy, milestones and progress source all
    // differ by target — `isProduce` is hoisted to the poll call above.
    //
    // Produce runs report real progress through the run's own heartbeat. null means
    // nothing has been measured yet (the outline is still saving, or no section has
    // finished), and the bar goes indeterminate rather than inventing a number.
    // computeProgress stays correct for extraction runs, which do write node rows.
    const batch = isProduce ? computeProduceProgress(summary) : null;
    const progress = isProduce
      ? phase === "completed"
        ? 100
        : (batch?.percent ?? 0)
      : computeProgress(phase === "completed" ? "completed" : "running", poll.nodes);
    // Say something true instead of a percentage nobody measured. Once sections start
    // landing that IS the number; before then it is the chain step we are actually on.
    const progressCaption = isProduce
      ? batch
        ? `Section ${Math.min(batch.done + 1, batch.total)} of ${batch.total}`
        : bootStep
          ? BOOT_STEP_LABEL[bootStep]
          : "Starting…"
      : undefined;
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
          indeterminate={isProduce && batch == null}
          progressCaption={progressCaption}
          done={readyReportId != null}
          onDone={handleQuarterlyLoaderDone}
          headerExtra={
            isProduce ? (
              // Stated up front rather than after some silent delay, so a long wait
              // never reads as a stall. True by construction: nothing here cancels the
              // batch, and an unfinished quarterly report's card routes to its Preview,
              // which fills sections in as they land.
              <p style={{ margin: "12px 0 0", fontSize: 12, color: "#5A6080", maxWidth: 460 }}>
                Large documents take longer. You can close this page — the report keeps
                building, and you'll find it under Reports.
              </p>
            ) : (
              <QuarterlyStatTiles summary={periodError ? null : summary} />
            )
          }
          footer={
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {isProduce && state.reportId && (
                // Watching sections land beats watching a bar, and Preview refreshes
                // the ones still pending on its own.
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/quarterly-report/${state.reportId}/preview`, { replace: true })
                  }
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
                  Watch sections being written →
                </button>
              )}
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
            </div>
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

