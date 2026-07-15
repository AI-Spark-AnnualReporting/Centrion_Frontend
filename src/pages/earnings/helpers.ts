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

// ─── Part 2 — figures ─────────────────────────────────────────────────────────
// A figure is flagged for review when its confidence is below 90 — unless it was
// manually edited (confidence null → a human override, never flagged).
export function isFlagged(confidence: number | null, edited: boolean): boolean {
  return !edited && typeof confidence === 'number' && confidence < 90;
}

// Confidence tier for colouring. Backend `flag` wins when present; otherwise
// derive from confidence: ≥90 green · 85–<90 amber · <85 red · null → manual.
export type ConfidenceTier = 'green' | 'amber' | 'red' | 'manual';
export function confidenceTier(
  confidence: number | null,
  flag?: string | null,
): ConfidenceTier {
  if (flag) {
    const f = flag.toLowerCase();
    if (f.includes('ok') || f.includes('good') || f === 'green') return 'green';
    if (f.includes('review') || f.includes('warn') || f === 'amber') return 'amber';
    if (f.includes('low') || f.includes('bad') || f === 'red') return 'red';
  }
  if (typeof confidence !== 'number') return 'manual';
  if (confidence >= 90) return 'green';
  if (confidence >= 85) return 'amber';
  return 'red';
}

// Format a figure value with thousands separators + optional unit.
// e.g. (4182.6, 'SAR M') → '4,182.6 SAR M'; (null, …) → '—'.
export function formatFigureValue(value: number | null, unit?: string | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const num = value.toLocaleString('en-US', { maximumFractionDigits: 3 });
  return unit ? `${num} ${unit}` : num;
}
