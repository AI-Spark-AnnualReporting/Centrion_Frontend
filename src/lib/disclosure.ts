// Derives the disclosure "events" that drive the Disclosure Timeline card and the
// Board & Meetings calendar from data the app already serves — no backend changes.
//
// Sources:
//   • THREE standing milestones, always emitted: Annual, ESG and Quarterly. Annual
//     and ESG land on the company's fiscal year-end month of the year after the
//     latest report of that type; Quarterly is the quarter AFTER the latest quarterly
//     period on record. A type with no history still gets a row — dateless, carrying
//     only its CTA — because the card promises three milestones unconditionally.
//     A real annual reporting cycle overrides the derived annual date with its
//     submission deadline, and an approved one files that year and moves the
//     milestone on to the next.
//   • Upcoming board MEETINGS (real, scheduled, future).
//   • COMPLETED reports — status 'approved' or 'published', nothing else.

import type { Company } from '@/types/company';
import type { Meeting } from '@/types/meeting';
import type { Cycle } from '@/types/cycles';
import { MONTHS, diffDays, formatCountdown, formatDayMonth, formatDue, toLocalDate } from './calendar';

// The row shape GET /api/v1/reports/{company_id} returns (mirrors DashboardESG's
// ReportListItem).
export interface ReportListItem {
  id: string;
  period: string;
  report_type?: string | null;
  generated_at?: string | null;
  title?: string | null;
  // The report's real workflow state. This was served all along — the list endpoint
  // does select("*") and spreads the whole row — but this file used to assert it
  // wasn't, and so badged every draft "Completed". Presence in the list means the
  // row exists, nothing more.
  status?: string | null;
}

export type EventKind = 'due' | 'meeting' | 'filed';
export type EventTone = 'urgent' | 'normal' | 'done';

export interface TimelineEvent {
  id: string;
  // null when a milestone has nothing to anchor to (no report of that type yet).
  // Consumers that place events on a calendar grid must skip these.
  date: Date | null;
  title: string;
  subtitle: string;
  kind: EventKind;
  dotColor: string;
  tone: EventTone;
  // A deadline that has already passed. Distinct from tone 'urgent' (which also
  // covers "due within 30 days") so the UI can say OVERDUE rather than URGENT.
  overdue?: boolean;
  cta?: { label: string; path: string };
}

// A report is a disclosure only once it has been signed off. A draft is work in
// progress, and in_review/pending_approval are work someone is still arguing about.
const COMPLETED_STATUSES = new Set(['approved', 'published']);

const DOT_DONE = '#0F9D6B';
const DOT_LATE = '#E5484D';
const DOT_SOON = '#E8A33D';
const DOT_FAR = '#6366F1';

// "FY-2025" → 2025 (0 when no 4-digit year, e.g. "FY-unknown"/null).
export function yearFromPeriod(period?: string | null): number {
  if (!period) return 0;
  const m = period.match(/(\d{4})/);
  return m ? Number(m[1]) : 0;
}

// "Q3-2024" → { q: 3, year: 2024 }. null when the period is not a quarter.
export function parseQuarter(period?: string | null): { q: number; year: number } | null {
  const m = (period ?? '').match(/Q([1-4])\D*(\d{4})/i);
  return m ? { q: Number(m[1]), year: Number(m[2]) } : null;
}

// The quarter after this one, rolling Q4 into Q1 of the next year.
export function nextQuarter(cur: { q: number; year: number }): { q: number; year: number } {
  return cur.q === 4 ? { q: 1, year: cur.year + 1 } : { q: cur.q + 1, year: cur.year };
}

// Calendar quarters: Q1 ends 31 Mar … Q4 ends 31 Dec. Nothing else in the app maps
// Q1–Q4 onto a fiscal year (the report forms treat them as free labels), so neither
// does this — a company with an October year-end still files a calendar "Q2 2027".
function quarterEnd(q: number, year: number): Date {
  return new Date(year, q * 3, 0);
}

function latestByType(reports: ReportListItem[], type: string): ReportListItem | null {
  const rows = reports.filter(
    (r) => (r.report_type ?? '').toLowerCase() === type && yearFromPeriod(r.period) > 0,
  );
  if (!rows.length) return null;
  return rows.slice().sort(
    (a, b) =>
      yearFromPeriod(b.period) - yearFromPeriod(a.period) ||
      (b.generated_at ?? '').localeCompare(a.generated_at ?? ''),
  )[0];
}

// Latest quarterly by (year, quarter) — Q4-2024 beats Q1-2024, which a year-only
// comparison would call a tie and resolve on upload order.
function latestQuarter(reports: ReportListItem[]): { q: number; year: number } | null {
  const quarters = reports
    .filter((r) => (r.report_type ?? '').toLowerCase() === 'quarterly')
    .map((r) => parseQuarter(r.period))
    .filter((x): x is { q: number; year: number } => x != null);
  if (!quarters.length) return null;
  return quarters.sort((a, b) => b.year - a.year || b.q - a.q)[0];
}

interface DeriveInput {
  reports?: ReportListItem[];
  meetings?: Meeting[];
  company?: Company | null;
  cycles?: Cycle[];
}

interface Cta {
  label: string;
  path: string;
}

// One standing milestone. `date` null → the company has never filed this type, so the
// row still renders but carries only its CTA: a milestone we cannot date is still a
// milestone the user should be able to start.
function dueEvent(
  key: string,
  title: string,
  date: Date | null,
  label: string,
  cta: Cta,
  now: Date,
  suffix = '',
): TimelineEvent {
  if (!date) {
    return {
      id: `due-${key}`,
      date: null,
      title,
      subtitle: 'Not scheduled yet',
      kind: 'due',
      dotColor: DOT_FAR,
      tone: 'normal',
      cta,
    };
  }
  const days = diffDays(date, now);
  const overdue = days < 0;
  return {
    id: `due-${key}`,
    date,
    title,
    subtitle: `${label} · ${formatDue(date, now)}${suffix}`,
    kind: 'due',
    dotColor: overdue || days <= 30 ? DOT_LATE : days <= 120 ? DOT_SOON : DOT_FAR,
    tone: overdue || days <= 30 ? 'urgent' : 'normal',
    overdue,
    cta,
  };
}

export function deriveEvents(input: DeriveInput, now: Date = new Date()): TimelineEvent[] {
  const { reports = [], meetings = [], company, cycles = [] } = input;
  const events: TimelineEvent[] = [];
  const fye = company?.fiscal_year_end_month ?? 12; // 1–12; default December

  // ── 1) Annual ────────────────────────────────────────────────────────────
  {
    const latest = latestByType(reports, 'annual');
    let anchor = latest ? yearFromPeriod(latest.period) : 0;
    let cta: Cta = { label: 'Start cycle', path: '/annual-report' };

    // An APPROVED cycle for the year after the last filed annual means that year is
    // itself done: it becomes a completed event and the milestone moves on a year.
    const doneCycle = anchor
      ? cycles.find(
          (c) => c.fiscal_year === anchor + 1 && (c.report_status ?? '').toLowerCase() === 'approved',
        )
      : undefined;
    if (doneCycle) {
      events.push({
        id: `filed-cycle-${doneCycle.id}`,
        date: new Date(doneCycle.fiscal_year, fye, 0),
        title: `Annual Report ${doneCycle.fiscal_year}`,
        subtitle: `${MONTHS[fye - 1]} ${doneCycle.fiscal_year} · Completed`,
        kind: 'filed',
        dotColor: DOT_DONE,
        tone: 'done',
        cta: { label: 'Open cycle', path: `/annual-report/cycles/${doneCycle.id}` },
      });
      anchor = doneCycle.fiscal_year;
    }

    let date: Date | null = null;
    let label = '';
    let suffix = '';
    if (anchor) {
      date = new Date(anchor + 1, fye, 0);
      label = `${MONTHS[fye - 1]} ${anchor + 1}`;
      // A real cycle for the year now being targeted supersedes the derived date
      // with its actual submission deadline and re-points the CTA into that cycle.
      const cycle = cycles.find((c) => c.fiscal_year === anchor + 1);
      if (cycle) {
        cta = { label: 'Open cycle', path: `/annual-report/cycles/${cycle.id}` };
        if (cycle.submission_deadline) {
          const parsed = toLocalDate(cycle.submission_deadline.slice(0, 10));
          if (!Number.isNaN(parsed.getTime())) {
            date = parsed;
            label = formatDayMonth(parsed);
            suffix = ' · official deadline';
          }
        }
      }
    }
    events.push(dueEvent('annual', 'Next Annual report due', date, label, cta, now, suffix));
  }

  // ── 2) ESG ───────────────────────────────────────────────────────────────
  {
    const latest = latestByType(reports, 'esg');
    const year = latest ? yearFromPeriod(latest.period) : 0;
    events.push(
      dueEvent(
        'esg',
        'Next ESG report due',
        year ? new Date(year + 1, fye, 0) : null,
        year ? `${MONTHS[fye - 1]} ${year + 1}` : '',
        { label: 'Open ESG studio', path: '/reports' },
        now,
      ),
    );
  }

  // ── 3) Quarterly ─────────────────────────────────────────────────────────
  {
    const latest = latestQuarter(reports);
    const next = latest ? nextQuarter(latest) : null;
    events.push(
      dueEvent(
        'quarterly',
        'Next Quarterly report due',
        next ? quarterEnd(next.q, next.year) : null,
        next ? `Q${next.q} ${next.year}` : '',
        { label: 'Start quarterly report', path: '/reports/quarterly' },
        now,
      ),
    );
  }

  // ── 4) Completed reports ─────────────────────────────────────────────────
  // Dated by their reporting period (the fiscal year-end of the report's year), NOT
  // the upload date — an FY-2025 report with a December FYE reads "December 2025".
  // Falls back to generated_at only when the period has no detectable year.
  for (const r of reports) {
    if (!COMPLETED_STATUSES.has((r.status ?? '').toLowerCase())) continue;
    const year = yearFromPeriod(r.period);
    let d: Date;
    let when: string;
    if (year) {
      d = new Date(year, fye, 0);
      when = `${MONTHS[fye - 1]} ${year} · Completed`;
    } else if (r.generated_at) {
      d = new Date(r.generated_at);
      if (Number.isNaN(d.getTime())) continue;
      when = `${formatDayMonth(d)} · Completed`;
    } else {
      continue;
    }
    const type = (r.report_type ?? '').toLowerCase();
    const label = r.title || `${type ? type.toUpperCase() : 'Report'} ${r.period}`.trim();
    events.push({
      id: `filed-${r.id}`,
      date: d,
      title: label,
      subtitle: when,
      kind: 'filed',
      dotColor: DOT_DONE,
      tone: 'done',
    });
  }

  // ── 5) Upcoming board meetings (scheduled + not in the past) ─────────────
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (const m of meetings) {
    if ((m.status ?? '') !== 'scheduled') continue;
    const d = toLocalDate(m.meeting_date, m.meeting_time);
    if (Number.isNaN(d.getTime()) || d < startToday) continue;
    events.push({
      id: `mtg-${m.id}`,
      date: d,
      title: m.title,
      subtitle: `${formatDayMonth(d)} · ${formatCountdown(d, now)}`,
      kind: 'meeting',
      dotColor: '#3B52E0',
      tone: 'normal',
    });
  }

  return events.sort(byDateAsc);
}

// Ascending by date, with dateless milestones last — they have no position on a
// timeline, but they must never be dropped.
function byDateAsc(a: TimelineEvent, b: TimelineEvent): number {
  if (!a.date && !b.date) return 0;
  if (!a.date) return 1;
  if (!b.date) return -1;
  return a.date.getTime() - b.date.getTime();
}

// Split for display: what is still owed (milestones + meetings, soonest first) vs
// what has been filed (newest first). An overdue milestone stays in `upcoming` —
// it is still owed, and a late filing is the last thing to hide.
export function splitEvents(events: TimelineEvent[]) {
  const upcoming = events.filter((e) => e.kind !== 'filed').slice().sort(byDateAsc);
  const filed = events
    .filter((e) => e.kind === 'filed')
    .slice()
    .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
  return { upcoming, filed };
}
