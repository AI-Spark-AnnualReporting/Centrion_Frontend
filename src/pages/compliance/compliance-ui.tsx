// Shared presentational helpers + the run fetcher for the Compliance Validation
// wizard. Keeps the three screens free of duplicated chip/colour logic.
// Mirrors the shape of pages/annual-report/cycle-ui.tsx.

import { useCallback, useEffect, useRef, useState } from 'react';
import { complianceValidation } from '@/lib/api';
import { rememberScreen, type ComplianceScreen } from '@/lib/compliance-runs';
import { useAuth } from '@/context/AuthContext';
import {
  isRunDone,
  isTerminalStatus,
  type CheckEvidence,
  type CheckStatus,
  type ComplianceRun,
  type Gap,
  type Gate,
  type ReportType,
  type RuleDetailGroup,
  type Severity,
} from '@/types/compliance';

// Where "back to set up" should land. A bare /compliance drops the user on the
// ESG tab with nothing selected — so a report they just validated under another
// tab isn't on screen at all, and an uploaded one looks like it was never
// saved. Carrying the tab and the subject brings them back to what they were
// doing, ready to run again.
// Record which screen the user has open for a run, so "Continue" can return
// them to it rather than to the top of the wizard. Only the screen — GET /runs
// owns the run's existence and its status, and would be right where a
// remembered status goes stale.
export function useRememberScreen(runId: string | undefined, screen: ComplianceScreen) {
  useEffect(() => {
    if (runId) rememberScreen(runId, screen);
  }, [runId, screen]);
}

export function setupHref(
  // subject_id is nullable: a run whose file couldn't be read has had its
  // document deleted, so there is nothing to preselect.
  subject?: { report_type?: ReportType; subject_id?: string | null } | null,
  mode?: 'upload',
): string {
  const params = new URLSearchParams();
  if (subject?.report_type) params.set('type', subject.report_type);
  if (subject?.subject_id) params.set('subject', subject.subject_id);
  if (mode) params.set('mode', mode);
  const query = params.toString();
  return query ? `/compliance?${query}` : '/compliance';
}

export const PRIMARY = '#4040C8';
export const GREEN = '#16A34A';
export const RED = '#DC2626';
export const AMBER = '#B45309';
export const MUTED = '#9BA3C4';
export const DARK = '#1A1D2E';
export const MONO = "'DM Mono', monospace";

const GATE: Record<Gate, string> = {
  HARD: 'b-rd',
  SOFT: 'b-am',
  WATCH: 'b-gy',
};

export function GateChip({ gate }: { gate: Gate }) {
  return <span className={`badge ${GATE[gate] ?? 'b-gy'}`}>{gate}</span>;
}

// The API returns severity lower-case; display it upper-case.
const SEVERITY: Record<Severity, string> = {
  high: 'b-rd',
  medium: 'b-am',
  low: 'b-gy',
};

export function SeverityChip({ severity }: { severity: Severity }) {
  return (
    <span className={`badge ${SEVERITY[severity] ?? 'b-gy'}`}>
      {String(severity ?? '').toUpperCase()}
    </span>
  );
}

// All four statuses occur, and each means something different — so each gets an
// explicit branch and none of them share a fallback. The two grey ones in
// particular are not interchangeable:
//   na      — the rule doesn't govern this company at all.
//   no_data — it does, but the answer lives in a filing or register outside
//             this report. Grey, never red, and never scored.
const STATUS: Record<CheckStatus, { glyph: string; color: string; label: string; hint: string }> = {
  pass: {
    glyph: '✓',
    color: GREEN,
    label: 'Pass',
    hint: 'Evidenced in the report.',
  },
  fail: {
    glyph: '✗',
    color: RED,
    label: 'Fail',
    hint: 'Not evidenced in the report, or only partially.',
  },
  na: {
    glyph: '–',
    color: MUTED,
    label: 'Not applicable',
    hint: "This rule doesn't govern this company.",
  },
  no_data: {
    glyph: '◦',
    color: MUTED,
    label: 'Not in this report',
    hint: 'Answered by a filing or register outside this report.',
  },
};

// A fail whose finding opens "Partially evidenced." is a softer thing than a
// flat miss — the author wrote something, it just isn't enough. Amber rather
// than red says that, while leaving it a fail: it stays in gaps[] and still
// blocks a HARD gate.
export function isPartiallyEvidenced(finding: string | undefined): boolean {
  return /^\s*partially evidenced\b/i.test(finding ?? '');
}

// `finding` is only carried on gap rows, so rule-detail rows pass nothing and
// get the plain fail treatment.
function statusStyle(status: CheckStatus, finding?: string) {
  const base = STATUS[status];
  if (status === 'fail' && isPartiallyEvidenced(finding)) {
    return {
      glyph: '◐',
      color: AMBER,
      label: 'Partial',
      hint: 'Something was written, but not enough to satisfy the rule.',
    };
  }
  return base;
}

export function StatusIcon({ status, finding }: { status: CheckStatus; finding?: string }) {
  const s = statusStyle(status, finding);
  // An unrecognised status is a backend change we haven't caught up with —
  // render it visibly neutral rather than silently mislabelling it.
  if (!s) {
    return (
      <span title={status} aria-label={status} style={{ color: MUTED, fontWeight: 800, fontSize: 13 }}>
        ?
      </span>
    );
  }
  return (
    <span
      title={`${s.label} — ${s.hint}`}
      aria-label={s.label}
      style={{ color: s.color, fontWeight: 800, fontSize: 13, lineHeight: 1 }}
    >
      {s.glyph}
    </span>
  );
}

export function statusLabel(status: CheckStatus, finding?: string): string {
  return statusStyle(status, finding)?.label ?? String(status);
}

export function statusColor(status: CheckStatus, finding?: string): string {
  return statusStyle(status, finding)?.color ?? MUTED;
}

export function statusHint(status: CheckStatus, finding?: string): string {
  return statusStyle(status, finding)?.hint ?? '';
}

// Score colour ramp: ≥80 green, 50–79 amber, <50 red. A null score means
// nothing was scoreable — render it muted, never as 0.
export function scoreColor(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return MUTED;
  if (score >= 80) return GREEN;
  if (score >= 50) return AMBER;
  return RED;
}

// The framework cards on Review read as pass/fail rather than as a ramp: a
// framework is either fully evidenced or it has checks outstanding, and an amber
// middle band made "60" look nearer to done than it is. `scoreColor`'s three-step
// ramp still governs every other compliance surface.
export function gradeColor(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return MUTED;
  return score >= 80 ? GREEN : RED;
}

// Clamp a score to a 0–100 integer, preserving null (= "nothing was scoreable").
export function safeScore(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

// The API names a framework only by its regulator code, so the friendly half of
// every label lives here. Anything unmapped falls back to the bare code — a new
// regulator on the backend degrades to "XYZ" rather than breaking.
export const FRAMEWORK_LABELS: Record<string, string> = {
  CMA: 'Annual Report (CMA)',
  TADAWUL: 'Tadawul ESG',
  SAMA: 'SAMA Prudential',
  IA: 'Insurance Authority',
  SOCPA: 'Accounting Basis',
  ZATCA: 'Zakat / Tax',
  ISSB: 'ISSB / TCFD',
  GRI: 'GRI',
  ARV: 'Report Integrity',
  MOC: 'Ministry of Commerce',
  SASB: 'SASB',
  ICMA: 'ICMA',
  GHG_PROTOCOL: 'GHG Protocol',
};

export function frameworkLabel(regulator: string): string {
  return FRAMEWORK_LABELS[regulator] ?? regulator;
}

// FrameworkScore carries no gate, so a framework's HARD/SOFT badge is read off
// the rules that produced it: one HARD rule is enough to make the whole
// framework blocking. A regulator missing from rule_detail is left out of the
// map so its card shows no badge rather than a guessed one.
export function frameworkGates(detail: RuleDetailGroup[] | undefined): Map<string, Gate> {
  const map = new Map<string, Gate>();
  for (const group of detail ?? []) {
    const gates = new Set((group.rules ?? []).map((r) => r.gate));
    if (gates.has('HARD')) map.set(group.regulator, 'HARD');
    else if (gates.has('SOFT')) map.set(group.regulator, 'SOFT');
    else if (gates.has('WATCH')) map.set(group.regulator, 'WATCH');
  }
  return map;
}

// rule_detail carries no per-group totals, so derive them from the rule rows.
// Only pass + fail are scoreable; na and no_data are excluded.
export function groupCounts(group: RuleDetailGroup) {
  const rules = group.rules ?? [];
  const passed = rules.filter((r) => r.status === 'pass').length;
  const failed = rules.filter((r) => r.status === 'fail').length;
  const noData = rules.filter((r) => r.status === 'no_data').length;
  const na = rules.filter((r) => r.status === 'na').length;
  return { passed, failed, noData, na, scoreable: passed + failed, total: rules.length };
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------
//
// The checker reads the report's own prose, so every key here is optional and
// simply absent when it doesn't apply — a `no_data` result carries nothing but
// `evidence_source`. Each piece renders itself or renders nothing; nothing
// destructures, and nothing assumes a companion key came along with it.

// The sentence the verdict rests on, quoted from the report. This is the most
// valuable thing the API returns — it shows the author their own words, so it
// gets the visual weight of a pull-quote rather than a table cell.
export function EvidenceQuote({
  evidence,
  compact = false,
}: {
  evidence: CheckEvidence | null | undefined;
  compact?: boolean;
}) {
  const quote = evidence?.quote;
  if (!quote) return null;
  return (
    <blockquote
      style={{
        margin: compact ? '6px 0 0' : '10px 0 0',
        padding: compact ? '7px 0 7px 11px' : '9px 0 9px 14px',
        borderLeft: `3px solid ${PRIMARY}`,
        background: 'linear-gradient(90deg, rgba(64,64,200,.05), transparent 70%)',
        borderRadius: '0 8px 8px 0',
      }}
    >
      <div
        style={{
          fontSize: compact ? 12 : 12.5,
          color: DARK,
          lineHeight: 1.6,
          fontStyle: 'italic',
        }}
      >
        “{quote}”
      </div>
      {(evidence?.section_code || evidence?.evidence_source) && (
        <div
          style={{
            marginTop: 5,
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            flexWrap: 'wrap',
            fontSize: 10.5,
            color: MUTED,
          }}
        >
          {evidence?.section_code && (
            <span
              title="The report section this was read from"
              style={{
                fontFamily: MONO,
                color: PRIMARY,
                background: '#EEEEFF',
                padding: '2px 7px',
                borderRadius: 6,
                fontWeight: 700,
              }}
            >
              {evidence.section_code}
            </span>
          )}
          {evidence?.evidence_source && <span>{evidence.evidence_source}</span>}
        </div>
      )}
    </blockquote>
  );
}

// `found` / `missing` are plain-English phrases now — "dividend policy", not an
// indicator code. They go straight to screen; there is no lookup left to do.
export function PhraseList({
  label,
  phrases,
  tone,
}: {
  label: string;
  phrases: string[] | undefined;
  tone: 'found' | 'missing';
}) {
  if (!phrases || phrases.length === 0) return null;
  const color = tone === 'found' ? GREEN : RED;
  const bg = tone === 'found' ? 'rgba(34,197,94,.09)' : 'rgba(239,68,68,.08)';
  return (
    <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10, fontWeight: 800, color: MUTED, letterSpacing: '.3px' }}>
        {label}
      </span>
      {phrases.map((p) => (
        <span
          key={p}
          style={{
            fontSize: 11,
            fontWeight: 600,
            color,
            background: bg,
            padding: '2px 8px',
            borderRadius: 6,
          }}
        >
          {p}
        </span>
      ))}
    </div>
  );
}

// Confidence is display-only, and deliberately only ever a tooltip: `status`
// already encodes the threshold the backend applied, so surfacing confidence as
// a number invites gating on it a second time.
export function ConfidenceMark({ evidence }: { evidence: CheckEvidence | null | undefined }) {
  const c = evidence?.confidence;
  if (c == null || !Number.isFinite(c)) return null;
  return (
    <span
      title={`Model confidence ${Math.round(c * 100)}%`}
      aria-label={`Model confidence ${Math.round(c * 100)} percent`}
      style={{ fontSize: 10, color: MUTED, cursor: 'help', userSelect: 'none' }}
    >
      ⓘ
    </span>
  );
}

// The checker's reasoning over the quote. Secondary to the quote itself.
export function EvidenceProof({ evidence }: { evidence: CheckEvidence | null | undefined }) {
  if (!evidence?.proof) return null;
  return (
    <div style={{ marginTop: 6, fontSize: 11, color: '#5A6080', lineHeight: 1.6 }}>
      {evidence.proof}
    </div>
  );
}

// Everything a gap row has to say about its evidence, in reading order.
export function GapEvidenceBlock({ gap }: { gap: Gap }) {
  const e = gap.evidence;
  const hasAnything =
    e != null &&
    (e.quote || e.proof || e.found?.length || e.missing?.length || e.evidence_source);
  if (!hasAnything) {
    return <span style={{ fontSize: 11, color: MUTED }}>No evidence recorded.</span>;
  }
  return (
    <div>
      <EvidenceQuote evidence={e} compact />
      <EvidenceProof evidence={e} />
      <PhraseList label="FOUND" phrases={e?.found} tone="found" />
      <PhraseList label="MISSING" phrases={e?.missing} tone="missing" />
      {/* Only shown when there was no quote to hang it under. */}
      {!e?.quote && e?.evidence_source && (
        <div style={{ fontSize: 10.5, color: MUTED, marginTop: 6 }}>{e.evidence_source}</div>
      )}
    </div>
  );
}

// `Compliance Validation · {Company Name}` — shown at the top of every screen.
export function ComplianceHeader() {
  const { user } = useAuth();
  return (
    <div style={{ marginBottom: 14 }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, color: DARK }}>
        Compliance Validation
        {user?.company_name ? (
          <span style={{ color: MUTED, fontWeight: 700 }}> · {user.company_name}</span>
        ) : null}
      </h2>
      <p style={{ fontSize: 11, color: '#5A6080', marginTop: 2 }}>
        Validate a report against its regulators, review the gaps, then certify for publication.
      </p>
    </div>
  );
}

// Full-width message card for load failures and not-yet-available states.
export function ComplianceNotice({
  title,
  detail,
  tone = 'muted',
  action,
}: {
  title: string;
  detail?: string;
  tone?: 'muted' | 'error';
  action?: React.ReactNode;
}) {
  const color = tone === 'error' ? RED : MUTED;
  return (
    <div className="card" style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color }}>{title}</div>
      {detail && (
        <div style={{ fontSize: 12, color: MUTED, marginTop: 6, lineHeight: 1.6 }}>{detail}</div>
      )}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

// Loads GET /runs/{id}. Shared by Review and Gate — both read the same run.
// `setRun` lets resolve/certify patch the loaded run in place, so the screens
// update without a refetch or a page reload.
export function useComplianceRun(runId: string | undefined) {
  const [run, setRun] = useState<ComplianceRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // `quiet` refetches without dropping the screen back to a spinner — used to
  // reconcile after a resolve, where the user is already looking at patched
  // numbers and a full loading state would read as the page throwing them away.
  const reload = useCallback(
    (quiet = false) => {
      if (!runId) {
        setRun(null);
        setError('No validation run selected.');
        setLoading(false);
        return;
      }
      if (!quiet) setLoading(true);
      setError('');
      complianceValidation
        .getRun(runId)
        .then(setRun)
        .catch((e) => {
          // A failed background refresh leaves the patched-in-place state
          // standing rather than replacing good data with an error screen.
          if (quiet) return;
          setError(e instanceof Error ? e.message : 'Failed to load the validation run.');
        })
        .finally(() => {
          if (!quiet) setLoading(false);
        });
    },
    [runId],
  );

  useEffect(() => {
    reload();
  }, [reload]);

  return { run, loading, error, setRun, reload };
}

// ---------------------------------------------------------------------------
// Polling a run in flight
// ---------------------------------------------------------------------------

// The checker reads the whole report through an LLM, so a run takes 30–60s.
const POLL_INTERVAL_MS = 2500;
// Well past the expected duration — a safety valve so a wedged run offers a way
// out instead of spinning forever, not a real deadline.
const POLL_CEILING_MS = 5 * 60 * 1000;
// A single dropped poll shouldn't tear the screen down mid-run; several in a
// row means something is actually wrong.
const MAX_CONSECUTIVE_FAILURES = 3;

export interface RunPollState {
  run: ComplianceRun | null;
  // Set only on a failure to reach the API. A run that came back with
  // `status: "error"` is a successful poll — read that off `run.status`.
  error: string;
  elapsedMs: number;
  timedOut: boolean;
}

// Polls GET /runs/{id} until the run reports a terminal status. Stops on `done`
// AND on `error` — an errored run is final, it never becomes done, so continuing
// to poll one would just spin against a dead run forever.
export function useComplianceRunPoll(runId: string | undefined, attempt = 0) {
  const [state, setState] = useState<RunPollState>({
    run: null,
    error: '',
    elapsedMs: 0,
    timedOut: false,
  });
  // Held in a ref so the poll loop's identity doesn't change every tick.
  const startedAtRef = useRef(0);

  useEffect(() => {
    if (!runId) {
      setState({ run: null, error: 'No validation run selected.', elapsedMs: 0, timedOut: false });
      return;
    }

    let stopped = false;
    let timer: number | undefined;
    let failures = 0;
    startedAtRef.current = Date.now();
    setState({ run: null, error: '', elapsedMs: 0, timedOut: false });

    // Ticks the elapsed clock independently of the network, so the timer on
    // screen keeps moving smoothly between polls.
    const clock = window.setInterval(() => {
      if (stopped) return;
      setState((prev) => ({ ...prev, elapsedMs: Date.now() - startedAtRef.current }));
    }, 250);

    const stop = () => {
      stopped = true;
      window.clearInterval(clock);
      if (timer) window.clearTimeout(timer);
    };

    const poll = async () => {
      if (stopped) return;

      if (Date.now() - startedAtRef.current > POLL_CEILING_MS) {
        setState((prev) => ({ ...prev, timedOut: true }));
        stop();
        return;
      }

      try {
        const run = await complianceValidation.getRun(runId);
        if (stopped) return;
        failures = 0;
        setState((prev) => ({ ...prev, run, error: '' }));
        if (isTerminalStatus(run.status)) {
          stop();
          return;
        }
      } catch (e) {
        if (stopped) return;
        failures += 1;
        if (failures >= MAX_CONSECUTIVE_FAILURES) {
          setState((prev) => ({
            ...prev,
            error: e instanceof Error ? e.message : 'Lost contact with the compliance service.',
          }));
          stop();
          return;
        }
      }

      timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    };

    void poll();
    return stop;
  }, [runId, attempt]);

  return state;
}

// Progress for the run screen. Honest by construction: a percentage is returned
// only when the backend actually reports how many checks are finished. If it
// doesn't, this returns null and the caller shows an indeterminate bar — the
// wait is long enough that a bar climbing on a timer would be visibly lying.
export function runProgress(run: ComplianceRun | null): number | null {
  const done = run?.checks_completed;
  const total = run?.checks_queued;
  if (done == null || total == null || !Number.isFinite(done) || !Number.isFinite(total)) {
    return null;
  }
  if (total <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

// "0:47" — the elapsed clock shown while the run is in flight.
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// Re-exported so screens can branch on run status without also importing the
// types module for one predicate.
export { isRunDone, isTerminalStatus };
