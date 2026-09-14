import type { ReportGeneration } from '@/lib/api';
import type { FeatureKey } from '@/constants/features';
import type { AuthUser } from '@/types/auth';
import { isClosed } from '@/components/dashboard/report-status';
import { isFeatureVisible } from '@/lib/features';

/* Where a thread's report card sends the reader.

   The API returns ids and a `kind`, never a URL — it has no view of these
   routes — so the mapping lives here, next to the router that owns them.

   `state` picks WHICH page of a module: a report that is ready opens at its
   assembled/preview page, and one still being written opens where the work is,
   the same split ReportsPage makes when you click a report card there. Sending
   an unwritten report to its preview lands on an empty document. */

type Generation = Pick<ReportGeneration, 'state' | 'target'> & { done?: number | null };
type Target = ReportGeneration['target'];

const ROUTE: Record<
  NonNullable<Target['kind']>,
  (t: Target, ready: boolean) => string | null
> = {
  // Preview is the page that shows whatever has been produced so far — the
  // right landing spot for a report still being worked on. An approved
  // quarterly gets its assembled document instead; the other two lanes preview
  // and read on the same page.
  quarterly_report: (t, ready) =>
    t.report_id ? `/quarterly-report/${t.report_id}/${ready ? 'report' : 'preview'}` : null,
  board_report: (t) => (t.report_id ? `/board-report/${t.report_id}/preview` : null),
  earnings_report: (t) => (t.report_id ? `/earnings/${t.report_id}/preview` : null),
  // cycle_id, NOT report_id — an annual report row is a shell pointing at a
  // cycle, and the report id lands on an empty page. One page either way: the
  // cycle screen is both where it's written and where it's read.
  annual_cycle: (t) => (t.cycle_id ? `/annual-report/cycles/${t.cycle_id}` : null),
  // ESG has no sections to preview — its coverage page IS the report, and
  // there is one per report (FY-2024 GRI, FY-2023 GRI…), not one per company.
  esg_page: (t) => (t.report_id ? `/reports/${t.report_id}` : '/reports'),
};

// The module each report lane lives in — the same keys App.tsx sets as
// `requiredFeature` on these very routes. Kept beside ROUTE so a card can
// never offer a door ProtectedRoute then slams: without the feature the user
// lands back on /dashboard.
const FEATURE: Record<NonNullable<Target['kind']>, FeatureKey> = {
  quarterly_report: 'quarterly_report',
  board_report: 'board_report',
  earnings_report: 'earnings_report',
  annual_cycle: 'annual_report',
  esg_page: 'esg_validator',
};

/** Whether this user may open the report a thread is about.

    Membership in a thread is open to the whole company — access is enforced
    here, at the report itself, rather than by hiding people from the pickers.
    Asks exactly what the router asks, so the two can't disagree. */
export function canOpenReport(
  user: AuthUser | null | undefined,
  generation?: Generation | null,
): boolean {
  const kind = generation?.target?.kind;
  if (!kind) return false;
  // Annual is settled by the report, not by the reader: once it is approved,
  // anyone in the conversation may read it. Whether it IS approved is
  // hasSomethingToReview's question — an unapproved annual is inert there — so
  // nothing here needs to ask about status.
  //
  // This does not dead-end the way a feature check would: an approved annual
  // has state 'ready', so opensModulePage is false and the card opens the
  // reviewer screen inside the Hub. It never navigates to /annual-report,
  // which is still admin + IR only.
  if (kind === 'annual_cycle') return true;
  return isFeatureVisible(user, FEATURE[kind]);
}

/** Whether the thread's controls should leave for the report's own page.

    Until a report is approved there is nothing settled to read in the review
    screen — the module's preview page is where the work actually shows. ESG
    always goes to its own page: it keeps no sections to render here at all. */
export function opensModulePage(generation: Generation): boolean {
  // Annual never leaves. The Hub renders a cycle's sections itself, and
  // /annual-report is admin + IR only — a department-user reviewer sent there
  // is bounced to /dashboard, which reads as "I was assigned it but cannot open
  // it". When an annual report is not readable here at all, hasSomethingToReview
  // has already made the card inert and no href is asked for.
  if (generation.target.kind === 'annual_cycle') return false;
  return generation.state !== 'ready' || generation.target.kind === 'esg_page';
}

/** In-app path for a report card's target, or null when there's nowhere to go
    (an IR briefing has no module, and a malformed target shouldn't navigate). */
export function generationHref(generation: Generation): string | null {
  const { state, target } = generation;
  if (!target?.kind) return null;
  return ROUTE[target.kind]?.(target, state === 'ready') ?? null;
}

/** Whether this thread's controls should offer the report at all.

    The question is "has anything been written", not "is it approved": `done > 0`.
    A cycle with nothing written reports 0 and stays inert, which is the case
    this rule was really guarding.

    It used to be `isClosed(status)`, from when annual reports were never
    reviewed here. Sharing one for review sets the status to in_review and a
    send-back sets it back to draft, so that rule hid the report from the
    reviewer it had just been assigned to, and then hid the reviewer's comments
    from the author it was sent back to.

    `state === 'ready'` is not usable either: `auto` sections (the cover, the
    contents page) cannot be locked by design yet still count toward the cycle's
    total, so a fully written report reads as e.g. 9/11 and only reaches 'ready'
    by being approved.

    Every other type is always offerable: they report no count, and approval is
    their readiness gate, so "not approved" there is the normal state of a
    report that is out for review right now. */
export function hasSomethingToReview(
  generation?: Generation | null,
  status?: string | null,
): boolean {
  if (!generation || generation.done == null) return true;
  return generation.done > 0 || isClosed(status);
}
