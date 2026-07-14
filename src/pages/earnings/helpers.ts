import type { EarningsVariant, EarningsQuarter, ReportTone } from '@/types/earnings';

// Human-readable period label. Annual → "FY 2025"; Quarterly → "Q3 2025".
export function formatPeriodLabel(
  variant: EarningsVariant,
  fiscalYear: number,
  quarter?: number | null,
): string {
  if (variant === 'quarterly' && quarter != null) return `Q${quarter} ${fiscalYear}`;
  return `FY ${fiscalYear}`;
}

// The `period` string the GET /earnings/sources endpoint keys on. Dash form,
// mirroring the app's stored period strings ("FY-2025" / "Q3-2025").
// NOTE: exact format is unconfirmed — verify against the live backend.
export function sourcesPeriodKey(
  variant: EarningsVariant,
  fiscalYear: number,
  quarter?: number | null,
): string {
  if (variant === 'quarterly' && quarter != null) return `Q${quarter}-${fiscalYear}`;
  return `FY-${fiscalYear}`;
}

// Year picker options — current year ±10, newest first (mirrors the quarterly form).
export function earningsYearOptions(): number[] {
  const now = new Date().getFullYear();
  const years: number[] = [];
  for (let y = now + 10; y >= now - 10; y--) years.push(y);
  return years;
}

// The minimal setup-form state that gates the Continue button.
export interface EarningsSetupState {
  variant: EarningsVariant | null;
  fiscalYear: number | null;
  quarter: EarningsQuarter | null;
  tone: ReportTone | null;
  sourceIds: string[];
}

// Continue is allowed only when type + period + tone + ≥1 source are set.
// Quarterly additionally requires a quarter; annual does not.
export function canContinue(s: EarningsSetupState): boolean {
  if (!s.variant || s.fiscalYear == null || !s.tone) return false;
  if (s.variant === 'quarterly' && s.quarter == null) return false;
  return s.sourceIds.length > 0;
}
