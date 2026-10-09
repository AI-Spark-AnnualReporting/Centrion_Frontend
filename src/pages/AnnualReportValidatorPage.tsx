// Annual Report Validator: validate an EXTERNAL annual report, one made
// outside this system, against its own strategic brief, concept messages and
// tone. Native to Centriyon (unlike Spark's sidebar entry, which hands off to
// the SAR app) — same backend endpoints, reached directly via sarValidator.
//
// One page, three states (form, running, results/failed) rather than the SAR
// app's separate form/run pages — nothing here needs to be deep-linkable, and
// an admin leaving mid-run can just start again.

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Plus, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import AiLoadingScreen from "@/pages/onboarding/AiLoadingScreen";
import { useToast } from "@/hooks/use-toast";
import { ApiError, sarValidator } from "@/lib/api";
import { AnnualReportValidationPanel } from "@/components/validator/AnnualReportValidationPanel";
import { PreviousValidationsGallery } from "@/components/validator/PreviousValidationsGallery";
import type { ReportValidation, ValidationJob, ValidationJobSummary } from "@/types/annual-report-validator";
// Same visual language Compliance Validation uses (shared color/font tokens
// only - the page-specific pieces below are rebuilt locally rather than
// imported, so this page's look can't be broken by a change to Compliance's
// own file, and vice versa).
import { DARK, MONO, MUTED, PRIMARY } from "./compliance/compliance-ui";

const ACCEPT = ".pdf,.docx";
const MAX_CONCEPTS = 5;
const POLL_MS = 3000;

// No fixed steps here (see RunningView) - these rotate under the loader
// instead, same spot Compliance Validation uses for its own tips.
const TIPS = [
  "Findings are weighed, not enforced - nothing here blocks you from using your report elsewhere.",
  "The brief, concept messages and tone are all checked against the report's own wording.",
  "Figure tracing is off for an external report - there are no departments or documents to trace a figure to.",
  "Long reports can take a few minutes. You can leave this page open.",
];

interface ConceptRow {
  message: string;
}

type RunState =
  | { stage: "form" }
  // jobId is null for the moment between clicking "Validate again" and the
  // server actually handing back a new job id - the loader shows right away
  // (see RunningView), it just has nothing to poll yet.
  | { stage: "running"; jobId: string | null }
  | { stage: "results"; jobId: string; validation: ReportValidation }
  | { stage: "failed"; jobId: string; message: string };

export default function AnnualReportValidatorPage() {
  const [run, setRun] = useState<RunState>({ stage: "form" });
  const { toast } = useToast();
  // Back to the Validator's own form (with Previous validations under it),
  // not out of the app. Not navigate(-1): the whole form/running/results/
  // failed flow lives on this one route with no URL change between states,
  // so browser history has nothing useful to go back to - switching the
  // page's own state is the real "back". The form starts empty again; the
  // run just finished is in the Previous validations list.
  const goBack = () => setRun({ stage: "form" });

  // Validate again: same report, brief, concepts and tone the original run
  // used, no re-upload - the server already saved them. Works from results
  // or from a failure, since either one has a job id to retry.
  //
  // The loader shows the instant this is called, before the retry request
  // even resolves - jobId starts null (nothing to poll yet; RunningView
  // waits for a real one) rather than leaving the old screen's button
  // sitting there saying "Starting…" for the round trip.
  //
  // A failure here (e.g. the run never saved enough to retry) is the retry
  // attempt's own failure, not a new validation failing - it's reported as a
  // toast and the screen is put back exactly as it was, rather than
  // replacing whatever the admin was looking at with a second "failed"
  // screen.
  async function retry(jobId: string) {
    const previous = run;
    setRun({ stage: "running", jobId: null });
    try {
      const { job_id } = await sarValidator.retry(jobId);
      setRun({ stage: "running", jobId: job_id });
    } catch (err) {
      setRun(previous);
      toast({
        title: "Couldn't start the retry",
        description: err instanceof ApiError ? err.message : undefined,
        variant: "destructive",
      });
    }
  }

  if (run.stage === "running") {
    return <RunningView jobId={run.jobId} onDone={setRun} />;
  }

  if (run.stage === "results") {
    return (
      <div className="w-full space-y-6 p-6">
        <Button onClick={goBack} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <PageHeader
          title="Annual Report Validator"
          description={`${run.validation.filename ?? "External report"} — checked`}
          action={
            <Button variant="outline" onClick={() => retry(run.jobId)}>
              Validate again
            </Button>
          }
        />
        <AnnualReportValidationPanel validation={run.validation} />
      </div>
    );
  }

  if (run.stage === "failed") {
    return (
      <div className="mx-auto w-full max-w-xl space-y-4 p-6">
        <Button onClick={goBack} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
          <div>
            <p className="text-sm font-bold text-rose-900">Validation did not finish</p>
            <p className="mt-0.5 text-sm text-rose-800">{run.message}</p>
          </div>
        </div>
        <Button onClick={() => retry(run.jobId)}>
          Validate again
        </Button>
      </div>
    );
  }

  // A card from the gallery below. Running resumes the polling screen;
  // failed shows the stored error directly (no fetch - it travels with the
  // list row); completed re-fetches that one job's full result, the same
  // request a fresh run's last poll makes, so this reuses GET
  // /validation-jobs/{id} rather than needing anything new.
  async function openPrevious(job: ValidationJobSummary) {
    if (job.status === "running") {
      setRun({ stage: "running", jobId: job.job_id });
      return;
    }
    if (job.status === "failed") {
      setRun({ stage: "failed", jobId: job.job_id, message: job.error || "Validation failed. Please try again." });
      return;
    }
    try {
      const full = await sarValidator.poll(job.job_id);
      if (full.status === "completed" && full.validation) {
        setRun({ stage: "results", jobId: job.job_id, validation: full.validation });
      } else {
        setRun({ stage: "failed", jobId: job.job_id, message: full.error || "Validation failed. Please try again." });
      }
    } catch (err) {
      setRun({
        stage: "failed",
        jobId: job.job_id,
        message: err instanceof ApiError ? err.message : "Couldn't open this validation.",
      });
    }
  }

  return (
    <ValidatorForm
      onStarted={(jobId) => setRun({ stage: "running", jobId })}
      onOpenPrevious={openPrevious}
    />
  );
}

/* Polls the job every 3s. The server's own message is shown as-is - there is
   no fixed step list for an external report's checks, unlike Compliance's
   three known stages, so the loader runs with its checklist turned off. The
   terminal result is held locally until AiLoadingScreen finishes its own
   fill-to-100 animation, same as Compliance does, rather than cutting away
   the moment the last poll lands. */
function RunningView({
  jobId,
  onDone,
}: {
  // null for the moment between the click and the server handing back a job
  // id (see AnnualReportValidatorPage.retry) - the loader still renders, it
  // just has nothing to poll yet.
  jobId: string | null;
  onDone: (next: RunState) => void;
}) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const [stage, setStage] = useState<string | null>(null);
  const [terminal, setTerminal] = useState<RunState | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    async function poll() {
      let job: ValidationJob;
      try {
        job = await sarValidator.poll(jobId);
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof ApiError ? err.message : "Validation failed. Please try again.";
          setTerminal({ stage: "failed", jobId, message });
        }
        return;
      }
      if (cancelled) return;

      if (job.status === "completed" && job.validation) {
        setTerminal({ stage: "results", jobId, validation: job.validation });
        return;
      }
      if (job.status === "failed") {
        setTerminal({ stage: "failed", jobId, message: job.error || "Validation failed. Please try again." });
        return;
      }

      setStage(job.stage);
      setTimeout(poll, POLL_MS);
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  return (
    // Fixed to the viewport, same as Compliance's own running screen -
    // without this it sits in normal page flow (inside the sidebar layout)
    // and scrolls with the rest of the page instead of staying centered.
    <div style={{ position: "fixed", inset: 0, zIndex: 1400, overflowY: "auto" }}>
      <AiLoadingScreen
        title="Validating your report"
        subtitle={stage || "Starting…"}
        milestones={[]}
        indeterminate
        tips={TIPS}
        done={terminal != null}
        onDone={() => onDoneRef.current(terminal as RunState)}
      />
    </div>
  );
}

function ValidatorForm({
  onStarted,
  onOpenPrevious,
}: {
  onStarted: (jobId: string) => void;
  onOpenPrevious: (job: ValidationJobSummary) => void;
}) {
  const [report, setReport] = useState<File | null>(null);
  const [brief, setBrief] = useState("");
  const [briefFile, setBriefFile] = useState<File | null>(null);
  const [briefFromFile, setBriefFromFile] = useState(false);
  const [conceptsFromFile, setConceptsFromFile] = useState(false);
  const [concepts, setConcepts] = useState<ConceptRow[]>([{ message: "" }]);
  const [conceptFile, setConceptFile] = useState<File | null>(null);
  const [toneText, setToneText] = useState("");
  const [toneFile, setToneFile] = useState<File | null>(null);
  const [toneFromFile, setToneFromFile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // The whole form collapses behind one header once it's been set up once -
  // same as Compliance Validation's SetupCard. Expanded by default, since
  // there's nothing to hide on first arrival.
  const [setupExpanded, setSetupExpanded] = useState(true);

  // No title to type any more - the backend draws a short one from the
  // message itself when none is given, so readiness only needs the message.
  const typedConcepts = concepts.filter((c) => c.message.trim());
  // Brief and tone work like concept messages: whichever tab is open is the
  // one input that counts - text typed on the other tab is kept, not sent.
  const briefReady = briefFromFile ? briefFile !== null : brief.trim() !== "";
  const conceptsReady = conceptsFromFile ? conceptFile !== null : typedConcepts.length > 0;
  const toneReady = toneFromFile ? toneFile !== null : toneText.trim() !== "";
  const canRun = !!report && briefReady && conceptsReady && toneReady && !submitting;

  function updateConcept(index: number, change: Partial<ConceptRow>) {
    setConcepts(concepts.map((c, i) => (i === index ? { ...c, ...change } : c)));
  }

  async function run() {
    if (!report) return;
    setSubmitting(true);
    setSubmitError(null);

    const form = new FormData();
    form.set("report", report);
    form.set("brief", briefFromFile ? "" : brief.trim());
    if (briefFromFile && briefFile) form.set("brief_file", briefFile);
    form.set("concepts", JSON.stringify(conceptsFromFile ? [] : typedConcepts));
    if (conceptsFromFile && conceptFile) form.set("concept_file", conceptFile);
    form.set("tone_text", toneFromFile ? "" : toneText.trim());
    if (toneFromFile && toneFile) form.set("tone_file", toneFile);
    form.set("content_language", "english");

    try {
      const { job_id } = await sarValidator.start(form);
      onStarted(job_id);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Couldn't start the validation");
      setSubmitting(false);
    }
  }

  const textareaStyle: React.CSSProperties = { resize: "vertical", fontFamily: "inherit" };

  return (
    <div className="w-full space-y-6 p-6">
      {/* Compact header, same proportions as ComplianceHeader - the big
          Tailwind h1 this page used before didn't match any other screen in
          the app. */}
      <div style={{ marginBottom: 4 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: DARK }}>Annual Report Validator</h2>
        <p style={{ fontSize: 11, color: "#5A6080", marginTop: 2 }}>
          Validate an external annual report against its strategic brief, concept messages and
          tone. Long reports take a few minutes.
        </p>
      </div>

      <SetupCard
        expanded={setupExpanded}
        onToggleExpanded={() => setSetupExpanded((e) => !e)}
        caption="Report, brief, concept messages and tone - all in one place."
      >
        <Section step={1} title="Annual report" caption="PDF or DOCX. Findings point to page ranges.">
          <FileDropzone
            file={report}
            accept={ACCEPT}
            hint="to validate · PDF or DOCX"
            onPick={setReport}
          />
        </Section>

        <Section
          step={2}
          title="Strategic brief"
          caption="Type or paste it, or upload it as a file. Checks whether the report delivers what the brief asked for."
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <ModeTabs fromFile={briefFromFile} onChange={setBriefFromFile} />
            {briefFromFile ? (
              <FileDropzone
                file={briefFile}
                accept={ACCEPT}
                hint="as PDF or DOCX"
                onPick={setBriefFile}
              />
            ) : (
              <textarea
                className="inp"
                rows={5}
                placeholder="Paste the strategic brief…"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                style={textareaStyle}
              />
            )}
          </div>
        </Section>

        <Section
          step={3}
          title="Concept messages"
          caption={`Type up to ${MAX_CONCEPTS} (the first is the primary message), or upload a file and the AI reads them out of it.`}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="tabs">
              <button
                type="button"
                className={`tab ${!conceptsFromFile ? "act" : ""}`}
                onClick={() => setConceptsFromFile(false)}
              >
                Type them
              </button>
              <button
                type="button"
                className={`tab ${conceptsFromFile ? "act" : ""}`}
                onClick={() => setConceptsFromFile(true)}
              >
                Upload a file
              </button>
            </div>

            {conceptsFromFile ? (
              <FileDropzone
                file={conceptFile}
                accept={ACCEPT}
                hint="to read concept messages from"
                onPick={setConceptFile}
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {concepts.map((c, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <span style={{ marginTop: 10, width: 64, flexShrink: 0, fontSize: 11, color: MUTED }}>
                      {i === 0 ? "Primary" : "Secondary"}
                    </span>
                    <textarea
                      className="inp"
                      rows={2}
                      placeholder="The message, in a sentence or two"
                      value={c.message}
                      onChange={(e) => updateConcept(i, { message: e.target.value })}
                      style={{ ...textareaStyle, flex: 1 }}
                    />
                    {concepts.length > 1 && (
                      <button
                        type="button"
                        aria-label="Remove"
                        onClick={() => setConcepts(concepts.filter((_, j) => j !== i))}
                        style={{
                          marginTop: 6,
                          background: "none",
                          border: "none",
                          color: MUTED,
                          cursor: "pointer",
                          padding: 4,
                        }}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                {concepts.length < MAX_CONCEPTS && (
                  <button
                    type="button"
                    className="btn bs bsm"
                    onClick={() => setConcepts([...concepts, { message: "" }])}
                    style={{ width: "fit-content" }}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add concept message
                  </button>
                )}
              </div>
            )}
          </div>
        </Section>

        <Section
          step={4}
          title="Tone"
          caption="Type or paste the company's house-style guide, or upload it as a file. The AI reads out the rules it states - voice, register, banned and preferred words, do's and don'ts."
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <ModeTabs fromFile={toneFromFile} onChange={setToneFromFile} />
            {toneFromFile ? (
              <FileDropzone
                file={toneFile}
                accept={ACCEPT}
                hint="as PDF or DOCX"
                onPick={setToneFile}
              />
            ) : (
              <textarea
                className="inp"
                rows={6}
                placeholder="Paste the house-style guide…"
                value={toneText}
                onChange={(e) => setToneText(e.target.value)}
                style={textareaStyle}
              />
            )}
          </div>
        </Section>

        <Section step={5} title="Validate" last>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn bp"
              onClick={run}
              disabled={!canRun}
              style={{
                fontSize: 13,
                padding: "10px 20px",
                opacity: canRun ? 1 : 0.5,
                cursor: canRun ? "pointer" : "not-allowed",
              }}
            >
              {submitting ? "Uploading…" : "▶ Validate report"}
            </button>
            {submitError && (
              <span style={{ fontSize: 11.5, color: "#DC2626" }}>{submitError}</span>
            )}
            {!canRun && !submitting && !submitError && (
              <span style={{ fontSize: 11.5, color: MUTED }}>
                The report, brief, concept messages and a tone guide are all required.
              </span>
            )}
          </div>
        </Section>
      </SetupCard>

      <PreviousValidationsGallery onOpen={onOpenPrevious} />
    </div>
  );
}

// "Type it / Upload a file" pill tabs for the brief and tone sections - same
// look as the concept messages toggle. fromFile is true when "Upload a file"
// is the open tab.
function ModeTabs({
  fromFile,
  onChange,
}: {
  fromFile: boolean;
  onChange: (fromFile: boolean) => void;
}) {
  return (
    <div className="tabs">
      <button type="button" className={`tab ${!fromFile ? "act" : ""}`} onClick={() => onChange(false)}>
        Type it
      </button>
      <button type="button" className={`tab ${fromFile ? "act" : ""}`} onClick={() => onChange(true)}>
        Upload a file
      </button>
    </div>
  );
}

// The whole wizard lives in one card with a single collapsible header on top
// - same shape as Compliance Validation's own SetupCard (ComplianceSetupPage.tsx),
// rebuilt locally rather than imported (see the import comment above).
function SetupCard({
  expanded,
  onToggleExpanded,
  caption,
  children,
}: {
  expanded: boolean;
  onToggleExpanded: () => void;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card" style={{ marginBottom: 14, overflow: "hidden" }}>
      <button
        type="button"
        onClick={onToggleExpanded}
        aria-expanded={expanded}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "14px 18px",
          background: "transparent",
          border: "none",
          borderBottom: expanded ? "1px solid #ECEEF8" : "none",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: "inherit",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: "linear-gradient(135deg,#4040C8,#7C3AED)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <ShieldCheck className="h-[15px] w-[15px] text-white" strokeWidth={2.2} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="ct">Set up validation</div>
            <div
              style={{
                fontSize: 11,
                color: MUTED,
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {caption}
            </div>
          </div>
        </div>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          style={{
            flexShrink: 0,
            transform: expanded ? "rotate(0deg)" : "rotate(180deg)",
            transition: "transform .15s",
          }}
        >
          <path
            d="M2.5 7L6 3.5 9.5 7"
            stroke={MUTED}
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {expanded && children}
    </div>
  );
}

// Numbered section inside the form's single card - same shape as Compliance
// Validation's own Section (ComplianceSetupPage.tsx), rebuilt locally rather
// than imported (see the import comment above).
function Section({
  step,
  title,
  caption,
  last,
  children,
}: {
  step: number;
  title: string;
  caption?: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ padding: "16px 18px", borderBottom: last ? "none" : "1px solid #ECEEF8" }}>
      <div className="ct">
        <span style={{ color: MUTED, fontFamily: MONO, marginRight: 6 }}>{step}</span>
        {title}
      </div>
      {caption && (
        <div style={{ fontSize: 11, color: MUTED, marginTop: 3, marginBottom: 14, maxWidth: 620 }}>
          {caption}
        </div>
      )}
      {children}
    </div>
  );
}

// A file field styled like Compliance's own upload box: a dashed drop zone
// that becomes a solid one with the filename, size and a Remove link once a
// file is chosen - instead of the browser's bare "Choose file" input.
function FileDropzone({
  file,
  accept,
  hint,
  onPick,
}: {
  file: File | null;
  accept: string;
  hint: string;
  onPick: (f: File | null) => void;
}) {
  return (
    <label
      style={{
        display: "block",
        padding: file ? "13px 15px" : 20,
        borderRadius: 10,
        border: `1.5px ${file ? "solid" : "dashed"} ${file ? PRIMARY : "#E2E4F0"}`,
        background: file ? "#FAFAFF" : "#fff",
        cursor: "pointer",
        textAlign: file ? "left" : "center",
        transition: ".12s",
      }}
    >
      <input
        type="file"
        accept={accept}
        onChange={(e) => {
          onPick(e.target.files?.[0] ?? null);
          // Let the same file be re-picked after it was cleared - without
          // this, choosing file A, removing it and choosing A again fires no
          // change event.
          e.target.value = "";
        }}
        style={{ display: "none" }}
      />
      {file ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 700,
                color: DARK,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {file.name}
            </div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
              {formatFileSize(file.size)} · click to replace
            </div>
          </div>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.preventDefault();
              onPick(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onPick(null);
              }
            }}
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: MUTED,
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: 6,
              flexShrink: 0,
            }}
          >
            Remove
          </span>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
          <span style={{ color: PRIMARY, fontWeight: 700 }}>Choose a file</span> {hint}
        </div>
      )}
    </label>
  );
}

function formatFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function PageHeader({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-bold text-[#1A1D2E]">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {action}
    </div>
  );
}

