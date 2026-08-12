// The Disclosure Timeline's contract: three standing milestones (Annual, ESG,
// Quarterly) that are ALWAYS present, and only genuinely signed-off reports counted
// as completed.
//
// The card used to badge every report row "Completed" — for one real company that
// meant seven unopened drafts, and a Q1-2027 draft, rendered as finished disclosures
// with a green tick. What's pinned here is the part that judgement can't settle:
// which report anchors "next quarter", what qualifies as filed, and that a company
// with no history still gets all three rows.

import { describe, it, expect } from 'vitest';
import { deriveEvents, splitEvents, parseQuarter, nextQuarter, type ReportListItem } from '@/lib/disclosure';
import type { Company } from '@/types/company';

const NOW = new Date(2026, 7, 12); // 12 Aug 2026
const COMPANY = { fiscal_year_end_month: 10 } as Company; // October year-end

function report(over: Partial<ReportListItem> & { id: string }): ReportListItem {
  return { period: 'FY-2025', report_type: 'annual', status: 'draft', ...over };
}

const due = (events: ReturnType<typeof deriveEvents>, title: string) =>
  events.find((e) => e.title === title);

describe('the three standing milestones', () => {
  it('emits all three even for a company with no reports at all', () => {
    const events = deriveEvents({ reports: [], company: COMPANY }, NOW);
    const titles = events.filter((e) => e.kind === 'due').map((e) => e.title);
    expect(titles).toEqual([
      'Next Annual report due',
      'Next ESG report due',
      'Next Quarterly report due',
    ]);
  });

  it('gives a milestone with no history a CTA and no invented date', () => {
    const events = deriveEvents({ reports: [], company: COMPANY }, NOW);
    const annual = due(events, 'Next Annual report due')!;
    expect(annual.date).toBeNull();
    expect(annual.subtitle).toBe('Not scheduled yet');
    expect(annual.cta).toBeTruthy();
  });

  it('places annual and ESG at the fiscal year-end month of the following year', () => {
    const events = deriveEvents(
      {
        reports: [
          report({ id: 'a', period: 'FY-2025', report_type: 'annual' }),
          report({ id: 'e', period: 'FY-2025', report_type: 'esg' }),
        ],
        company: COMPANY,
      },
      NOW,
    );
    expect(due(events, 'Next Annual report due')!.subtitle).toContain('October 2026');
    expect(due(events, 'Next ESG report due')!.subtitle).toContain('October 2026');
  });
});

describe('pitching the next quarter', () => {
  it('takes the quarter after the latest one on record, drafts included', () => {
    const events = deriveEvents(
      {
        reports: [
          report({ id: 'q1', period: 'Q3-2024', report_type: 'quarterly', status: 'approved' }),
          report({ id: 'q2', period: 'Q1-2027', report_type: 'quarterly', status: 'draft' }),
        ],
        company: COMPANY,
      },
      NOW,
    );
    expect(due(events, 'Next Quarterly report due')!.subtitle).toContain('Q2 2027');
  });

  it('rolls Q4 into Q1 of the next year', () => {
    const events = deriveEvents(
      { reports: [report({ id: 'q', period: 'Q4-2026', report_type: 'quarterly' })], company: COMPANY },
      NOW,
    );
    expect(due(events, 'Next Quarterly report due')!.subtitle).toContain('Q1 2027');
  });

  it('ranks Q4 above Q1 of the same year rather than treating them as a tie', () => {
    const events = deriveEvents(
      {
        reports: [
          report({ id: 'a', period: 'Q4-2025', report_type: 'quarterly' }),
          report({ id: 'b', period: 'Q1-2025', report_type: 'quarterly' }),
        ],
        company: COMPANY,
      },
      NOW,
    );
    expect(due(events, 'Next Quarterly report due')!.subtitle).toContain('Q1 2026');
  });

  it('marks a next quarter that has already passed as overdue, and keeps it', () => {
    // Last filed Q3-2024 → Q4-2024, which closed 20 months before NOW. It stays on
    // the card: a late filing is the last thing to hide.
    const events = deriveEvents(
      { reports: [report({ id: 'q', period: 'Q3-2024', report_type: 'quarterly' })], company: COMPANY },
      NOW,
    );
    const q = due(events, 'Next Quarterly report due')!;
    expect(q.overdue).toBe(true);
    expect(q.tone).toBe('urgent');
    expect(q.subtitle).toContain('overdue by');
    expect(splitEvents(events).upcoming).toContain(q);
  });

  it('ignores non-quarterly periods when picking the anchor', () => {
    const events = deriveEvents(
      {
        reports: [
          report({ id: 'esg', period: 'FY-2026', report_type: 'esg' }),
          report({ id: 'q', period: 'Q2-2025', report_type: 'quarterly' }),
        ],
        company: COMPANY,
      },
      NOW,
    );
    expect(due(events, 'Next Quarterly report due')!.subtitle).toContain('Q3 2025');
  });
});

describe('what counts as completed', () => {
  const mixed = [
    report({ id: 'd', period: 'FY-2024', status: 'draft' }),
    report({ id: 'r', period: 'FY-2023', status: 'in_review' }),
    report({ id: 'p', period: 'FY-2022', status: 'pending_approval' }),
    report({ id: 'a', period: 'FY-2021', status: 'approved' }),
    report({ id: 'b', period: 'FY-2020', status: 'published' }),
  ];

  it('counts only approved and published', () => {
    const filed = deriveEvents({ reports: mixed, company: COMPANY }, NOW).filter((e) => e.kind === 'filed');
    expect(filed.map((e) => e.id).sort()).toEqual(['filed-a', 'filed-b']);
  });

  it('never badges a draft as completed', () => {
    const events = deriveEvents({ reports: mixed, company: COMPANY }, NOW);
    expect(events.some((e) => e.id === 'filed-d')).toBe(false);
    expect(events.filter((e) => e.subtitle.includes('Completed'))).toHaveLength(2);
  });

  it('treats a report with no status as not completed', () => {
    const events = deriveEvents(
      { reports: [{ id: 'x', period: 'FY-2024', report_type: 'annual' }], company: COMPANY },
      NOW,
    );
    expect(events.some((e) => e.kind === 'filed')).toBe(false);
  });
});

describe('ordering for the card', () => {
  it('puts what is owed first, soonest first, with filed reports separated out', () => {
    const events = deriveEvents(
      {
        reports: [
          report({ id: 'a', period: 'FY-2025', report_type: 'annual', status: 'approved' }),
          report({ id: 'e', period: 'FY-2025', report_type: 'esg' }),
          report({ id: 'q', period: 'Q3-2026', report_type: 'quarterly' }),
        ],
        company: COMPANY,
      },
      NOW,
    );
    const { upcoming, filed } = splitEvents(events);

    expect(upcoming.every((e) => e.kind !== 'filed')).toBe(true);
    const dated = upcoming.filter((e) => e.date).map((e) => e.date!.getTime());
    expect(dated).toEqual([...dated].sort((a, b) => a - b));
    expect(filed.map((e) => e.id)).toEqual(['filed-a']);
  });

  it('sorts a dateless milestone last rather than dropping it', () => {
    // No ESG history, so that milestone has no date — it must still survive.
    const { upcoming } = splitEvents(
      deriveEvents(
        { reports: [report({ id: 'q', period: 'Q3-2026', report_type: 'quarterly' })], company: COMPANY },
        NOW,
      ),
    );
    expect(upcoming).toHaveLength(3);
    expect(upcoming[upcoming.length - 1].date).toBeNull();
  });
});

describe('quarter helpers', () => {
  it('parses a quarter period and rejects anything else', () => {
    expect(parseQuarter('Q3-2024')).toEqual({ q: 3, year: 2024 });
    expect(parseQuarter('FY-2024')).toBeNull();
    expect(parseQuarter(null)).toBeNull();
    expect(parseQuarter('Q5-2024')).toBeNull();
  });

  it('advances a quarter, wrapping the year', () => {
    expect(nextQuarter({ q: 1, year: 2026 })).toEqual({ q: 2, year: 2026 });
    expect(nextQuarter({ q: 4, year: 2026 })).toEqual({ q: 1, year: 2027 });
  });
});
