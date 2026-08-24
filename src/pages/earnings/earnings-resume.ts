// The browser's half of "pick up where you left off", for earnings reports.
//
// The report list comes from GET /earnings/reports — the server owns which
// reports exist and how far each one got, and it is right wherever a locally
// cached status would be wrong.
//
// The one thing the API genuinely cannot know is which of two equally-finished
// screens the user had open. An earnings report's `status` only ever holds
// 'draft' or 'approved' in practice, so a report that has been produced but not
// approved looks identical whether the user was last on Preview curating figures
// or on Report reading it end to end. That single distinction is what lives
// here.
//
// It is a hint. Losing it costs a little precision, never a report — the worst
// case is landing on Preview and clicking through, which is where the user was
// dropped every time before this existed.
//
// Modelled on src/lib/compliance-runs.ts, which solves the same shape.

import { useEffect } from 'react';

import type { EarningsReportSummary } from '@/types/earnings';

const STEPS_KEY = 'centriton_earnings_steps';

// Long enough to survive a weekend; past that the hint is worth less than the
// storage it sits in.
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RECORDS = 50;

/** The steps a report can be resumed at. Setup takes no reportId, so it is not one. */
export type EarningsStep = 'outline' | 'preview' | 'report';

const STEP_ORDER: EarningsStep[] = ['outline', 'preview', 'report'];

// A report is finished once it has been approved or locked. These are the
// statuses the backend actually writes plus the ones its dashboard-action map
// treats as read-only, so a status added there does not silently read as
// unfinished here.
const FINISHED_STATUSES = ['approved', 'locked', 'published', 'complete', 'completed'];

interface StepHint {
  step: EarningsStep;
  savedAt: number;
}

type StepHints = Record<string, StepHint>;

function readJson<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return (parsed as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full / disabled — these are hints, never a blocker */
  }
}

function readHints(): StepHints {
  const all = readJson<StepHints>(STEPS_KEY, {});
  const cutoff = Date.now() - MAX_AGE_MS;
  const fresh: StepHints = {};
  for (const [reportId, hint] of Object.entries(all)) {
    if (hint?.step && STEP_ORDER.includes(hint.step) && hint.savedAt > cutoff) {
      fresh[reportId] = hint;
    }
  }
  return fresh;
}

export function rememberStep(reportId: string, step: EarningsStep): void {
  if (!reportId) return;
  const hints = readHints();
  hints[reportId] = { step, savedAt: Date.now() };
  // Newest first, trimmed — an unbounded map would grow for the life of the
  // browser profile.
  const trimmed = Object.entries(hints)
    .sort((a, b) => b[1].savedAt - a[1].savedAt)
    .slice(0, MAX_RECORDS);
  writeJson(STEPS_KEY, Object.fromEntries(trimmed));
}

export function stepHint(reportId: string): EarningsStep | undefined {
  return readHints()[reportId]?.step;
}

export function isFinished(report: Pick<EarningsReportSummary, 'status' | 'approved_at' | 'locked_at'>): boolean {
  return (
    FINISHED_STATUSES.includes(report.status ?? '') ||
    report.approved_at != null ||
    report.locked_at != null
  );
}

/**
 * The furthest step this report has legitimately reached, from the server's
 * state alone. Used to decide what the stepper may unlock — a step the report
 * has not reached should not be clickable just because a stale hint names it.
 *
 * `generated_at` is the signal that the report has been built at least once:
 * the list endpoint sets it from the report row, and a report that has produced
 * content has been through Preview.
 */
export function furthestStep(
  report: Pick<EarningsReportSummary, 'status' | 'approved_at' | 'locked_at' | 'generated_at'>,
): EarningsStep {
  if (isFinished(report)) return 'report';
  return report.generated_at ? 'preview' : 'outline';
}

/**
 * Where opening this report should land. Server state decides what is legal;
 * the hint only chooses between two screens that are both correct for a report
 * that has been produced but not approved — the one pair the server cannot tell
 * apart. The hint never promotes a report past what the server says it reached.
 */
export function reportStep(
  report: Pick<EarningsReportSummary, 'status' | 'approved_at' | 'locked_at' | 'generated_at'>,
  hint?: EarningsStep,
): EarningsStep {
  const furthest = furthestStep(report);
  // Approved: the report screen is where it is read and downloaded, and every
  // earlier step is locked anyway.
  if (furthest === 'report') return 'report';
  if (furthest === 'outline') return 'outline';
  // Produced but unapproved — Preview and Report are both correct. Only here
  // does the hint get a say.
  return hint === 'report' ? 'report' : 'preview';
}

export function reportHref(
  report: Pick<EarningsReportSummary, 'report_id' | 'status' | 'approved_at' | 'locked_at' | 'generated_at'>,
  step: EarningsStep = reportStep(report, stepHint(report.report_id)),
): string {
  return `/earnings/${encodeURIComponent(report.report_id)}/${step}`;
}

// The stepper counts from 1 (Setup), so the build steps start at 2.
const STEP_NUMBER: Record<EarningsStep, number> = { outline: 2, preview: 3, report: 4 };

/**
 * How far this report has got, as a stepper step number — the furthest of the
 * screen you are on now and the screen you were last on.
 *
 * The hint is what makes this work: a user who built a report and went to read
 * it, then came back to Preview, has genuinely reached step 4, and nothing on
 * the server says so. Without this the stepper greys out Report and the only way
 * forward is to re-run the build.
 */
export function reachedStepNumber(reportId: string | undefined, currentStep: number): number {
  if (!reportId) return currentStep;
  const hint = stepHint(reportId);
  return Math.max(currentStep, hint ? STEP_NUMBER[hint] : currentStep);
}

/**
 * Where to open a report we know only the ID of — the "a report already exists
 * for this period" banner, which carries an id and nothing else.
 *
 * The hint is all there is here, so it is trusted on its own rather than being
 * checked against server state. That is safe in the direction it can be wrong:
 * a hint is only ever written while the user was actually on that screen, and
 * every step renders its own empty state with a way back if the report turns out
 * not to be that far along. Falls back to the Outline, which is where this
 * banner always went.
 */
export function resumeHref(reportId: string | null | undefined): string {
  if (!reportId) return '/earnings/setup';
  return `/earnings/${encodeURIComponent(reportId)}/${stepHint(reportId) ?? 'outline'}`;
}

/**
 * Record which step the user has open, so reopening the report from the list
 * comes back to it rather than to the middle of the flow. Only the step — the
 * list endpoint owns the report's existence and its status, and would be right
 * wherever a remembered status went stale.
 */
export function useRememberStep(reportId: string | undefined, step: EarningsStep): void {
  useEffect(() => {
    if (reportId) rememberStep(reportId, step);
  }, [reportId, step]);
}
