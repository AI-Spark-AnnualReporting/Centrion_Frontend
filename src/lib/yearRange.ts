// The pickable window for Fiscal Year fields: this year ± YEAR_SPAN.
// Used by YearPicker (the grid) and by forms as a safety check on submit.

// How many years either side of the current year can be picked.
export const YEAR_SPAN = 10;

/** Years from (this year - span) to (this year + span), oldest first. */
export function getYearRange(span: number = YEAR_SPAN): number[] {
  const thisYear = new Date().getFullYear();
  const years: number[] = [];
  for (let year = thisYear - span; year <= thisYear + span; year++) {
    years.push(year);
  }
  return years;
}

/** True when the year is inside the pickable window (this year ± span). */
export function isYearInRange(year: number, span: number = YEAR_SPAN): boolean {
  const thisYear = new Date().getFullYear();
  return year >= thisYear - span && year <= thisYear + span;
}
