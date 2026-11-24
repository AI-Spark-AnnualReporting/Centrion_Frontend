// A company's fiscal year, worked out from the year-end month it gave at onboarding
// (companies.fiscal_year_end_month, 1-12).
//
// Convention (same as lib/disclosure.ts): FY N ENDS on the last day of the
// year-end month in year N. So with a June year-end, FY2025 = 1 Jul 2024 – 30 Jun 2025;
// with a December year-end, FY2025 = 1 Jan – 31 Dec 2025.
//
// Dates are built as plain 'YYYY-MM-DD' strings (never through toISOString), so a
// browser in a timezone ahead of UTC can't shift them by a day.

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Used when the company has no valid year-end month — the same default the
// disclosure timeline uses.
const DEFAULT_YEAR_END_MONTH = 12;

export interface FiscalPeriod {
  startDate: string; // 'YYYY-MM-DD'
  endDate: string; // 'YYYY-MM-DD'
}

/** The year-end month to use: the given one if it's 1-12, otherwise December. */
function getValidYearEndMonth(month: number | null | undefined): number {
  if (typeof month === 'number' && Number.isInteger(month) && month >= 1 && month <= 12) {
    return month;
  }
  return DEFAULT_YEAR_END_MONTH;
}

/** Number of days in a month (month is 1-12). Day 0 of the next month = last day of this one. */
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** 'YYYY-MM-DD' from year, month (1-12) and day. */
function toDateString(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/** First and last day of fiscal year `fiscalYear` for a company with this year-end month. */
export function getFiscalPeriod(fiscalYear: number, yearEndMonth: number | null | undefined): FiscalPeriod {
  const endMonth = getValidYearEndMonth(yearEndMonth);
  const endDate = toDateString(fiscalYear, endMonth, getDaysInMonth(fiscalYear, endMonth));

  // The year starts on the 1st of the month after the previous year-end.
  let startYear = fiscalYear - 1;
  let startMonth = endMonth + 1;
  if (startMonth === 13) {
    startMonth = 1;
    startYear = fiscalYear;
  }
  const startDate = toDateString(startYear, startMonth, 1);

  return { startDate, endDate };
}

/** '2025-06-30' → '30 Jun 2025'. */
function formatDateString(value: string): string {
  const [year, month, day] = value.split('-');
  return `${Number(day)} ${MONTH_NAMES[Number(month) - 1]} ${year}`;
}

/** 'Covers' text for a period, e.g. '1 Jul 2024 – 30 Jun 2025'. */
export function formatFiscalPeriod(period: FiscalPeriod): string {
  return `${formatDateString(period.startDate)} – ${formatDateString(period.endDate)}`;
}
