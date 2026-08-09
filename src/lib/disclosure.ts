// Derives the disclosure "events" that drive the Disclosure Timeline card and the
// Board & Meetings calendar from data the app already serves — no backend changes.
//
// Sources:
//   • DERIVED next-due milestones — the latest uploaded annual/ESG report's fiscal
//     year + 1, placed at the company's fiscal year-end month (the core feature for
//     newly-registered companies). An existing annual reporting cycle for that year
//     overrides the derived date with its real submission deadline.
//   • Upcoming board MEETINGS (real, scheduled, future).
//   • FILED reports (a report row with a real generated_at) shown as "Completed".

import type { Company } from '@/types/company';
import type { Meeting } from '@/types/meeting';
import type { Cycle } from '@/types/cycles';
import { MONTHS, diffDays, formatCountdown, formatDayMonth, toLocalDate } from './calendar';

// The row shape GET /api/v1/reports/{company_id} returns (mirrors DashboardESG's
// ReportListItem). Note: no `status` and no `created_at` — `generated_at` is the
// only date, and presence in the list means the report exists/was generated.
export interface ReportListItem {
  id: string;
  period: string;
  report_type?: string | null;
  generated_at?: string | null;
  title?: string | null;
}

export type EventKind = 'due' | 'meeting' | 'filed';
export type EventTone = 'urgent' | 'normal' | 'done';

export interface TimelineEvent {
  id: string;
  date: Date;
  title: string;
  subtitle: string;
  kind: EventKind;
  dotColor: string;
  tone: EventTone;
  cta?: { label: string; path: string };
}

// "FY-2025" → 2025 (0 when no 4-digit year, e.g. "FY-unknown"/null).
export function yearFromPeriod(period?: string | null): number {
  if (!period) return 0;
  const m = period.match(/(\d{4})/);
  return m ? Number(m[1]) : 0;
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

interface DeriveInput {
  reports?: ReportListItem[];
  meetings?: Meeting[];
  company?: Company | null;
  cycles?: Cycle[];
}

const DUE_SPECS: { type: 'annual' | 'esg'; title: string; cta: { label: string; path: string } }[] = [
  { type: 'annual', title: 'Next Annual report due', cta: { label: 'Start cycle', path: '/annual-report' } },
  { type: 'esg', title: 'Next ESG report due', cta: { label: 'Open ESG studio', path: '/reports' } },
];

export function deriveEvents(input: DeriveInput, now: Date = new Date()): TimelineEvent[] {
  const { reports = [], meetings = [], company, cycles = [] } = input;
  const events: TimelineEvent[] = [];
  const fye = company?.fiscal_year_end_month ?? 12; // 1–12; default December

  // 1) Derived next-due milestones (annual + ESG).
  for (const spec of DUE_SPECS) {
    const latest = latestByType(reports, spec.type);
    if (!latest) continue;
    const year = yearFromPeriod(latest.period);
    if (!year) continue; // "FY-unknown" / undetectable → skip this milestone

    let dueDate = new Date(year + 1, fye, 0); // last day of the FYE month, next year
    let official = false;
    let cta = spec.cta;
    let approvedCycleYear: number | null = null;

    // A real annual cycle for next year: route the CTA into that cycle's data,
    // supersede the derived date with its deadline, and mark it done once the
    // cycle's assembled report is approved.
    if (spec.type === 'annual' && cycles.length) {
      const cycle = cycles.find((c) => c.fiscal_year === year + 1);
      if (cycle) {
        cta = { label: 'Open cycle', path: `/annual-report/cycles/${cycle.id}` };
        if (cycle.submission_deadline) {
          const parsed = toLocalDate(cycle.submission_deadline.slice(0, 10));
          if (!Number.isNaN(parsed.getTime())) {
            dueDate = parsed;
            official = true;
          }
        }
        if ((cycle.report_status ?? '').toLowerCase() === 'approved') {
          approvedCycleYear = cycle.fiscal_year;
        }
      }
    }

    // Approved annual cycle → a completed (green) item, keeping the "Open cycle" CTA.
    if (approvedCycleYear != null) {
      events.push({
        id: `due-${spec.type}`,
        date: new Date(approvedCycleYear, fye, 0),
        title: `Annual Report ${approvedCycleYear}`,
        subtitle: `${MONTHS[fye - 1]} ${approvedCycleYear} · Completed`,
        kind: 'filed',
        dotColor: '#0F9D6B',
        tone: 'done',
        cta,
      });
      continue;
    }

    const days = diffDays(dueDate, now);
    const dotColor = days <= 30 ? '#E5484D' : days <= 120 ? '#E8A33D' : '#6366F1';
    const when = official
      ? `${formatDayMonth(dueDate)} · ${formatCountdown(dueDate, now)} · official deadline`
      : `${MONTHS[fye - 1]} ${year + 1} · ${formatCountdown(dueDate, now)}`;
    events.push({
      id: `due-${spec.type}`,
      date: dueDate,
      title: spec.title,
      subtitle: when,
      kind: 'due',
      dotColor,
      tone: days <= 30 ? 'urgent' : 'normal',
      cta,
    });
  }

  // 2) Filed reports — dated by their reporting period (the fiscal year-end of the
  //    report's year), NOT the upload/created date. e.g. an FY-2025 report with a
  //    December FYE reads "December 2025". Falls back to generated_at only when the
  //    period has no detectable year ("FY-unknown").
  for (const r of reports) {
    const year = yearFromPeriod(r.period);
    let d: Date;
    let when: string;
    if (year) {
      d = new Date(year, fye, 0); // last day of the FYE month, report's fiscal year
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
      dotColor: '#0F9D6B',
      tone: 'done',
    });
  }

  // 3) Upcoming board meetings (scheduled + not in the past).
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

  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}

// Split for display: future deadlines/meetings vs. recently-filed (newest first).
export function splitEvents(events: TimelineEvent[], now: Date = new Date()) {
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const upcoming = events.filter((e) => e.kind !== 'filed' && e.date >= startToday);
  const filed = events
    .filter((e) => e.kind === 'filed')
    .sort((a, b) => b.date.getTime() - a.date.getTime());
  return { upcoming, filed };
}
