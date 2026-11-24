// A cycle's start/end dates are no longer typed by the admin: they are filled with
// the company's fiscal period for the picked year (the DB requires them, nothing
// downstream reads them). FY N ends on the last day of the year-end month in year N.

import { describe, it, expect } from 'vitest';
import { getFiscalPeriod, formatFiscalPeriod } from '@/lib/fiscalPeriod';

describe('getFiscalPeriod', () => {
  it('December year-end = the calendar year', () => {
    expect(getFiscalPeriod(2025, 12)).toEqual({ startDate: '2025-01-01', endDate: '2025-12-31' });
  });

  it('June year-end starts in the previous July', () => {
    expect(getFiscalPeriod(2025, 6)).toEqual({ startDate: '2024-07-01', endDate: '2025-06-30' });
  });

  it('January year-end starts in the previous February', () => {
    expect(getFiscalPeriod(2026, 1)).toEqual({ startDate: '2025-02-01', endDate: '2026-01-31' });
  });

  it('September year-end ends on the 30th', () => {
    expect(getFiscalPeriod(2025, 9)).toEqual({ startDate: '2024-10-01', endDate: '2025-09-30' });
  });

  it('February year-end lands on the 29th in a leap year and the 28th otherwise', () => {
    expect(getFiscalPeriod(2024, 2).endDate).toBe('2024-02-29');
    expect(getFiscalPeriod(2025, 2).endDate).toBe('2025-02-28');
  });

  it('falls back to a December year-end when the month is missing or invalid', () => {
    const december = { startDate: '2025-01-01', endDate: '2025-12-31' };
    expect(getFiscalPeriod(2025, null)).toEqual(december);
    expect(getFiscalPeriod(2025, undefined)).toEqual(december);
    expect(getFiscalPeriod(2025, 0)).toEqual(december);
    expect(getFiscalPeriod(2025, 13)).toEqual(december);
  });
});

describe('formatFiscalPeriod', () => {
  it('reads as a plain date range', () => {
    expect(formatFiscalPeriod(getFiscalPeriod(2025, 6))).toBe('1 Jul 2024 – 30 Jun 2025');
    expect(formatFiscalPeriod(getFiscalPeriod(2025, 12))).toBe('1 Jan 2025 – 31 Dec 2025');
  });
});
