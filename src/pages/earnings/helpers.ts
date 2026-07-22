import type { EarningsVariant, EarningsQuarter, ReportTone, EarningsFigure, SelectableSource } from '@/types/earnings';

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
  // Staged, not-yet-uploaded files also count as "has a source" — the unified
  // Continue flow uploads them as part of the same action.
  pendingUploadCount?: number;
}

// Continue is allowed only when type + period + tone + ≥1 source (selected or
// staged-for-upload) are set. Quarterly additionally requires a quarter.
export function canContinue(s: EarningsSetupState): boolean {
  if (!s.variant || s.fiscalYear == null || !s.tone) return false;
  if (s.variant === 'quarterly' && s.quarter == null) return false;
  return s.sourceIds.length > 0 || (s.pendingUploadCount ?? 0) > 0;
}

// ─── Part 2 — figures ─────────────────────────────────────────────────────────
// A figure is flagged for review when its confidence is below 90 — unless it was
// manually edited (confidence null → a human override, never flagged).
export function isFlagged(confidence: number | null, edited: boolean): boolean {
  return !edited && typeof confidence === 'number' && confidence < 90;
}

// Confidence tier for colouring. `flag` is authoritative: needs_input always
// wins ('needs-input'); flagged → amber/red by confidence; ok → normal
// thresholds, or 'manual' when confidence is null. Only an absent/unrecognized
// flag falls back to plain confidence thresholds.
export type ConfidenceTier = 'green' | 'amber' | 'red' | 'manual' | 'needs-input';

function tierFromConfidence(confidence: number | null): ConfidenceTier {
  if (typeof confidence !== 'number') return 'manual';
  if (confidence >= 90) return 'green';
  if (confidence >= 85) return 'amber';
  return 'red';
}

export function confidenceTier(
  confidence: number | null,
  flag?: string | null,
): ConfidenceTier {
  switch (flag) {
    case 'needs_input':
      return 'needs-input';
    case 'flagged':
      return typeof confidence === 'number' && confidence >= 85 ? 'amber' : 'red';
    case 'ok':
      return tierFromConfidence(confidence);
    default:
      // flag absent or unrecognized — fall back to plain confidence thresholds
      return tierFromConfidence(confidence);
  }
}

// Counts figures that need human attention: explicitly flagged for review, or
// needing manual input outright. Drives the footer copy and the
// Continue-confirm gate (a needs_input row must trigger the confirm, not pass
// silently).
export function needsReviewCount(figures: EarningsFigure[]): number {
  return figures.filter((f) => f.flag === 'flagged' || f.flag === 'needs_input').length;
}

// Format a figure value with thousands separators + optional unit.
// e.g. (4182.6, 'SAR M') → '4,182.6 SAR M'; (null, …) → '—'.
export function formatFigureValue(value: number | null, unit?: string | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const num = value.toLocaleString('en-US', { maximumFractionDigits: 3 });
  return unit ? `${num} ${unit}` : num;
}

// ─── Part 6A — comparatives ────────────────────────────────────────────────────
export type DeltaTone = 'up' | 'down' | 'flat' | null;

// A delta only exists when comparative_status is an explicit non-'none' value
// AND change_pct is a real number. Absent/null status is treated the same as
// 'none' (D-12: never render a delta the data doesn't carry).
function hasDelta(change_pct: number | null, comparative_status: string | null): change_pct is number {
  return comparative_status != null && comparative_status !== 'none' && typeof change_pct === 'number';
}

export function deltaTone(change_pct: number | null, comparative_status: string | null): DeltaTone {
  if (!hasDelta(change_pct, comparative_status)) return null;
  if (change_pct > 0) return 'up';
  if (change_pct < 0) return 'down';
  return 'flat';
}

// e.g. (0.114, 'yoy') → '+11.4%'; (null, 'none') → '—'; (-0.05, 'yoy') → '-5.0%'.
export function formatDelta(change_pct: number | null, comparative_status: string | null): string {
  if (!hasDelta(change_pct, comparative_status)) return '—';
  const pct = change_pct * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

// ─── Part 6B — tagged uploads ───────────────────────────────────────────────────
// A source's selection identity — whichever id is populated (official vs
// narrative-track), falling back to its label if somehow neither is present.
export function sourceKey(s: Pick<SelectableSource, 'report_id' | 'document_id' | 'label'>): string {
  return s.report_id ?? s.document_id ?? s.label;
}

// Upload doc type → display label. 'aggregator' is never user-selected but can
// still appear on an existing source, so it's mapped too.
export function formatSourceType(type: string | null): string {
  switch (type) {
    case 'annual':
      return 'Annual';
    case 'interim':
      return 'Interim';
    case 'release':
      return 'Press release';
    case 'presentation':
      return 'Presentation';
    case 'transcript':
      return 'Transcript';
    case 'aggregator':
      return 'Aggregator';
    default:
      return type ?? 'Document';
  }
}

// A low-confidence AI type guess the user hasn't actually corrected yet —
// surfaces "please confirm type" subtly (D-19: never silently trust it).
// Never true once `type` has genuinely diverged from `detected_type` (a real
// correction happened), and never true for a row with no confidence signal.
const LOW_TYPE_CONFIDENCE = 0.6; // confirm 0–1 vs 0–100 scale live (Step 0)

export function needsTypeConfirmation(
  s: Pick<SelectableSource, 'type' | 'detected_type' | 'type_confidence'>,
): boolean {
  return s.type_confidence != null && s.type_confidence < LOW_TYPE_CONFIDENCE && s.type === s.detected_type;
}
