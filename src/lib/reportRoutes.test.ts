import { describe, it, expect } from 'vitest';
import { canOpenReport, generationHref, hasSomethingToReview, opensModulePage } from './reportRoutes';
import type { AuthUser } from '@/types/auth';
import { safePath } from '@/pages/TokenHandoffPage';

describe('generationHref', () => {
  it('opens an approved report at its assembled page', () => {
    expect(
      generationHref({
        state: 'ready',
        target: { kind: 'earnings_report', company_id: 'cmp_1', report_id: 'rep_1' },
      }),
    ).toBe('/earnings/rep_1/preview');
  });

  it('opens an unapproved report at its preview, where the work shows', () => {
    expect(
      generationHref({
        state: 'not_ready',
        target: { kind: 'quarterly_report', company_id: 'cmp_1', report_id: 'rep_1' },
      }),
    ).toBe('/quarterly-report/rep_1/preview');
    expect(
      generationHref({
        state: 'not_ready',
        target: { kind: 'board_report', company_id: 'cmp_1', report_id: 'rep_2' },
      }),
    ).toBe('/board-report/rep_2/preview');
  });

  it('gives an approved quarterly its assembled document instead', () => {
    expect(
      generationHref({
        state: 'ready',
        target: { kind: 'quarterly_report', company_id: 'cmp_1', report_id: 'rep_1' },
      }),
    ).toBe('/quarterly-report/rep_1/report');
  });

  it('routes annual by CYCLE id — the report id lands on an empty page', () => {
    expect(
      generationHref({
        state: 'in_progress',
        target: {
          kind: 'annual_cycle',
          company_id: 'cmp_1',
          report_id: 'rep_shell',
          cycle_id: 'cyc_9',
        },
      }),
    ).toBe('/annual-report/cycles/cyc_9');
  });

  it('sends ESG to its own coverage page, one per report', () => {
    expect(
      generationHref({
        state: 'not_applicable',
        target: { kind: 'esg_page', company_id: 'cmp_1', report_id: 'rep_esg' },
      }),
    ).toBe('/reports/rep_esg');
  });

  it('falls back to the ESG list when the target names no report', () => {
    expect(
      generationHref({ state: 'not_applicable', target: { kind: 'esg_page', company_id: 'cmp_1' } }),
    ).toBe('/reports');
  });

  it('has nowhere to send an IR briefing', () => {
    expect(
      generationHref({ state: 'not_applicable', target: { kind: null, company_id: 'cmp_1' } }),
    ).toBeNull();
  });

  it('refuses to navigate on a target missing its id', () => {
    expect(
      generationHref({ state: 'in_progress', target: { kind: 'annual_cycle', company_id: 'cmp_1' } }),
    ).toBeNull();
    expect(
      generationHref({ state: 'ready', target: { kind: 'board_report', company_id: 'cmp_1' } }),
    ).toBeNull();
  });
});

describe('safePath (token handoff)', () => {
  it('follows an in-app path', () => {
    expect(safePath('/earnings/rep_1/preview')).toBe('/earnings/rep_1/preview');
  });

  it('refuses anything that leaves this origin', () => {
    // Arriving with a valid token in hand, so an open redirect here hands the
    // session to whoever wrote the link.
    expect(safePath('//evil.example')).toBe('/');
    expect(safePath('/\\evil.example')).toBe('/');
    expect(safePath('https://evil.example')).toBe('/');
    expect(safePath(null)).toBe('/');
  });
});

describe('opensModulePage', () => {
  const target = { kind: 'earnings_report' as const, company_id: 'cmp_1', report_id: 'rep_1' };

  it('leaves for the report while it is unapproved', () => {
    expect(opensModulePage({ state: 'not_ready', target })).toBe(true);
    expect(opensModulePage({ state: 'in_progress', target })).toBe(true);
  });

  it('keeps an approved report on the review screen', () => {
    expect(opensModulePage({ state: 'ready', target })).toBe(false);
  });

  it('always leaves for ESG, which has no sections to render here', () => {
    expect(
      opensModulePage({
        state: 'ready',
        target: { kind: 'esg_page', company_id: 'cmp_1', report_id: 'rep_esg' },
      }),
    ).toBe(true);
  });
});

describe('hasSomethingToReview', () => {
  const target = { kind: 'annual_cycle' as const, company_id: 'cmp_1', cycle_id: 'cyc_1' };

  it('offers nothing for an annual report until it is approved', () => {
    expect(hasSomethingToReview({ state: 'not_ready', target, done: 0 }, 'draft')).toBe(false);
    expect(hasSomethingToReview({ state: 'in_progress', target, done: 11 }, 'in_review')).toBe(false);
    // Written through, still not signed off.
    expect(hasSomethingToReview({ state: 'ready', target, done: 13 }, 'draft')).toBe(false);
  });

  it('offers it once the report is approved', () => {
    expect(hasSomethingToReview({ state: 'ready', target, done: 13 }, 'approved')).toBe(true);
    expect(hasSomethingToReview({ state: 'ready', target, done: 13 }, 'published')).toBe(true);
  });

  it('keeps the review on the module lanes, which report no count', () => {
    // not_ready there is the normal state of a report that is out for review
    // right now — hiding it would make sign-off impossible.
    expect(
      hasSomethingToReview(
        {
          state: 'not_ready',
          target: { kind: 'quarterly_report', company_id: 'cmp_1', report_id: 'rep_1' },
          done: null,
        },
        'draft',
      ),
    ).toBe(true);
  });

  it('leaves ESG and IR briefings as they were', () => {
    // They carry no section count, so this rule has nothing to say about them.
    expect(
      hasSomethingToReview(
        {
          state: 'not_applicable',
          target: { kind: 'esg_page', company_id: 'cmp_1', report_id: 'rep_esg' },
          done: null,
        },
        'draft',
      ),
    ).toBe(true);
    expect(
      hasSomethingToReview(
        { state: 'not_applicable', target: { kind: null, company_id: 'cmp_1' }, done: null },
        'draft',
      ),
    ).toBe(true);
  });
});

describe('canOpenReport', () => {
  const who = (role: AuthUser['role'], features: string[] | null): AuthUser =>
    ({ user_id: 'usr_1', email: 'a@b.c', full_name: 'A B', role, visible_features: features }) as AuthUser;

  const quarterly = {
    state: 'not_ready' as const,
    target: { kind: 'quarterly_report' as const, company_id: 'cmp_1', report_id: 'rep_1' },
  };
  const annual = {
    state: 'in_progress' as const,
    target: { kind: 'annual_cycle' as const, company_id: 'cmp_1', cycle_id: 'cyc_1' },
  };

  it('follows the module the report lives in', () => {
    expect(canOpenReport(who('department_user', ['board_report']), quarterly)).toBe(false);
    expect(canOpenReport(who('department_user', ['quarterly_report']), quarterly)).toBe(true);
  });

  it('leaves annual to the report, not the reader', () => {
    // An approved annual opens for anyone in the conversation: it is read in
    // the Hub's own reviewer screen, not behind the admin+IR annual routes.
    // Whether it is approved at all is hasSomethingToReview's question.
    expect(canOpenReport(who('department_user', []), annual)).toBe(true);
    expect(canOpenReport(who('project_manager', null), annual)).toBe(true);
    expect(canOpenReport(who('admin', ['annual_report']), annual)).toBe(true);
  });

  it('fails closed everywhere else', () => {
    expect(canOpenReport(who('admin', null), quarterly)).toBe(false);
    expect(canOpenReport(null, quarterly)).toBe(false);
    expect(
      canOpenReport(who('admin', ['quarterly_report']), {
        state: 'not_applicable',
        target: { kind: null, company_id: 'cmp_1' },
      }),
    ).toBe(false);
  });
});
