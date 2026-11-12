import type {
  AnnualReportExtraction as Extraction,
  LiveRun,
  LiveStep,
  LiveStepState,
} from '@/types/company';

// Plain helpers behind the live table on Upload Previous Reports. No React here,
// so the wording and the fallback rules can be read (and tested) on their own.

/** The popup a row opens; rows that are not listed here are not clickable. */
export type SummaryKey = 'tone' | 'dashboard' | 'outline' | 'departments';

const POPUP_FOR_STEP: Record<string, SummaryKey> = {
  tone: 'tone',
  revenue: 'dashboard',
  net_profit: 'dashboard',
  outline: 'outline',
  departments: 'departments',
};

const STATE_WORDS: Record<LiveStepState, string> = {
  pending: 'waiting',
  running: 'in progress',
  done: 'extracted',
  failed: 'not extracted',
  skipped: 'skipped',
};

export const STEP_DID_NOT_FINISH_TEXT = 'This step did not finish.';
// A stalled run older than this is treated as dead; a younger one may be a long run.
export const STALLED_RECHECK_WINDOW_MS = 60 * 60 * 1000;

/** The popup that belongs to a step, or null when the step has no details. */
export function popupForStep(stepKey: string): SummaryKey | null {
  return POPUP_FOR_STEP[stepKey] ?? null;
}

/** The words read out after the label, e.g. "Writing tone: in progress". */
export function stateWords(state: LiveStepState): string {
  return STATE_WORDS[state] ?? 'waiting';
}

/** True while the backend is still reading the upload. */
export function isRunInProgress(data: Extraction): boolean {
  if (data.live) return Boolean(data.live.running);
  // Older backend: the only signal is the company-level status.
  return data.status.report_extraction_status === 'processing';
}

/** The progress percent of the current run, or null when the backend gives none. */
export function runPercent(data: Extraction): number | null {
  const percent = data.status.onboarding_progress?.percent;
  if (typeof percent !== 'number' || Number.isNaN(percent)) return null;
  return Math.max(0, Math.min(100, Math.round(percent)));
}

/** The rows to draw: the backend's own steps, or ones worked out from stored data. */
export function stepsToShow(data: Extraction): LiveStep[] {
  const liveSteps = data.live?.steps;
  if (Array.isArray(liveSteps) && liveSteps.length > 0) return liveSteps;
  return deriveStepsFromData(data);
}

/**
 * Builds the rows for a backend that sends no `live` block.
 * A value that exists is a tick; a missing one is a cross, or a waiting bar
 * while the status still says the report is being read.
 */
export function deriveStepsFromData(data: Extraction): LiveStep[] {
  const company = data.company;
  const missingState: LiveStepState = isRunInProgress(data) ? 'pending' : 'failed';
  const rows: { key: string; label: string; value: string | null }[] = [
    { key: 'read', label: 'Reading the report', value: countText(data.reports.length, 'report') },
    { key: 'tone', label: 'Writing tone', value: toneValue(data) },
    { key: 'themes', label: 'Themes', value: countText(company.themes.length, 'theme') },
    { key: 'highlights', label: 'Key highlights', value: countText(company.highlights.length, 'highlight') },
    { key: 'profile', label: 'Company profile', value: profileValue(data) },
    { key: 'outline', label: 'Contents page (previous outline)', value: countText(data.sections.length, 'section') },
    { key: 'revenue', label: 'Revenue', value: figureValue(data, 'revenue') },
    { key: 'net_profit', label: 'Net profit', value: figureValue(data, 'net_profit') },
    { key: 'departments', label: 'Suggested departments', value: countText(company.departments?.raw?.length ?? 0, 'department') },
    { key: 'index', label: 'Search index for the assistant', value: countText(totalChunks(data), 'chunk') },
  ];
  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    state: row.value ? 'done' : missingState,
    reason: null,
    message: null,
    value: row.value,
  }));
}

/** "3 themes", "1 theme", or null when there are none. */
function countText(count: number, noun: string): string | null {
  if (count <= 0) return null;
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** The first words of the tone, or a short note when only the settings exist. */
function toneValue(data: Extraction): string | null {
  const company = data.company;
  if (company.tone) return shorten(company.tone, 70);
  const hasSettings = Object.keys(company.tone_dimensions ?? {}).length > 0;
  const hasExamples = (company.tone_exemplars ?? []).length > 0;
  return hasSettings || hasExamples ? 'Tone profile stored' : null;
}

/** "4 fields filled", counting the profile fields that hold a value. */
function profileValue(data: Extraction): string | null {
  const values = Object.values(data.company.profile ?? {});
  const filled = values.filter((value) => value !== null && value !== undefined && value !== '').length;
  if (filled === 0) return null;
  return `${filled} field${filled === 1 ? '' : 's'} filled`;
}

/** One figure from the first report that has it, with its currency when known. */
function figureValue(data: Extraction, lineItem: string): string | null {
  for (const report of data.reports) {
    const figures = report.financials?.data;
    const amount = figures?.periods?.[0]?.line_items?.[lineItem];
    if (amount === null || amount === undefined) continue;
    const currency = figures?.currency ? `${figures.currency} ` : '';
    return `${currency}${amount.toLocaleString()}`;
  }
  return null;
}

/** All searchable chunks stored across the uploaded reports. */
function totalChunks(data: Extraction): number {
  let total = 0;
  for (const report of data.reports) total += report.chunks?.count ?? 0;
  return total;
}

/** Cuts long text at a word boundary and adds "...". */
function shorten(text: string, maxLength: number): string {
  const clean = text.trim();
  if (clean.length <= maxLength) return clean;
  const cut = clean.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > 20 ? cut.slice(0, lastSpace) : cut}...`;
}

/** How many rows have reached an end state (done, failed or skipped). */
export function countFinishedSteps(steps: LiveStep[]): number {
  return steps.filter((step) => step.state !== 'pending' && step.state !== 'running').length;
}

/** True when a row is still waiting or being worked on. */
function isUnfinished(step: LiveStep): boolean {
  return step.state === 'pending' || step.state === 'running';
}

/** True when at least one row never reached an end state. */
export function hasUnfinishedSteps(steps: LiveStep[]): boolean {
  return steps.some(isUnfinished);
}

/**
 * True when the backend says nothing is running but some rows never finished.
 * That is a run that died (server restart) or one that outlived the backend's
 * 15-minute "still alive" window.
 */
export function isRunStalled(data: Extraction): boolean {
  if (isRunInProgress(data)) return false;
  return hasUnfinishedSteps(stepsToShow(data));
}

/**
 * True when a stalled run started recently enough that it may still finish,
 * so it is worth asking the backend again now and then.
 */
export function mayStillFinish(data: Extraction, now: number = Date.now()): boolean {
  if (!isRunStalled(data)) return false;
  const startedAt = Date.parse(data.status.onboarding_progress?.started_at ?? '');
  if (Number.isNaN(startedAt)) return false;
  return now - startedAt < STALLED_RECHECK_WINDOW_MS;
}

/**
 * The rows of a stalled run: unfinished ones are drawn as ended with a plain reason,
 * because a spinner on a run nobody is working on would spin forever.
 */
export function endUnfinishedSteps(steps: LiveStep[]): LiveStep[] {
  return steps.map((step) => {
    if (!isUnfinished(step)) return step;
    return { ...step, state: 'skipped', reason: 'run_stopped', message: STEP_DID_NOT_FINISH_TEXT };
  });
}

/** True when the run included an annual report (only those decide company-wide results). */
function hasAnnualFile(run: LiveRun): boolean {
  return (run.files ?? []).some((file) => file.doc_type === 'annual');
}

/** The banner's first line: is a report being read now, or was one read earlier. */
export function bannerHeading(running: boolean, fileCount: number): string {
  const noun = fileCount > 1 ? 'reports' : 'report';
  return running ? `Reading your ${noun} now` : `Last ${noun} we read`;
}

/**
 * The "latest year wins" line: does this upload replace the company-wide results.
 * Returns null when the run recorded no decision.
 */
export function overruleLine(run: LiveRun): string | null {
  const latest = run.latest_period_before;
  // A run with no annual report has no lead year, which the backend also reports as
  // 'unknown_year'. Saying "we could not tell the year" there would be wrong: the
  // sustainability report's year is known, it just never changes company-wide results.
  if (!hasAnnualFile(run) && !run.overrules) {
    return 'Sustainability report only: company-wide results unchanged';
  }
  if (run.overrule_reason === 'first_report') {
    return 'First report: sets your company-wide results';
  }
  if (run.overrule_reason === 'newest_year') {
    return 'Newest report: replaces your company-wide results';
  }
  if (run.overrule_reason === 'same_year_reupload') {
    const year = run.lead_period ?? latest;
    return year
      ? `Same year uploaded again: replaces the earlier ${year} results`
      : 'Same year uploaded again: replaces the earlier results';
  }
  if (run.overrule_reason === 'older_year') {
    return latest
      ? `Older than your ${latest} report: kept for reference, company-wide results unchanged`
      : 'Older than your newest report: kept for reference, company-wide results unchanged';
  }
  if (run.overrule_reason === 'unknown_year') {
    return "We could not tell this report's year, so company-wide results were left unchanged";
  }
  return null;
}
