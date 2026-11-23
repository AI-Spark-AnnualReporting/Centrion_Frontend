// Search for the KPI Normalizer's indicator cards (GRI: 128 rows, IFRS: 109).
// Matches the code ("305", "305-1", "S2-29") or the name ("emissions"), plus the
// category and unit, ignoring letter case and extra spaces.

import type { FrameworkIndicator } from '@/lib/api';

/** Lower-case, trimmed, inner runs of spaces collapsed to one. */
function normalizeSearchText(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** True when the indicator's code, name, category or unit contains the query. */
function indicatorMatches(indicator: FrameworkIndicator, query: string): boolean {
  const fields = [
    indicator.source_code,
    indicator.indicator_label,
    indicator.esg_category,
    indicator.expected_unit,
  ];
  for (const field of fields) {
    if (normalizeSearchText(field).includes(query)) return true;
  }
  return false;
}

/** The indicators matching the search box text; all of them when it's empty. */
export function filterIndicators(indicators: FrameworkIndicator[], searchText: string): FrameworkIndicator[] {
  const query = normalizeSearchText(searchText);
  if (query === '') return indicators;
  return indicators.filter((indicator) => indicatorMatches(indicator, query));
}
