// Did the quarter beat what was expected, and by how much.
//
// MIRRORED IN THE BACKEND — routes/earnings.py::_beat_miss. It exists twice on
// purpose: here so the verdict updates as the user types, there so the same answer
// reaches the produced section and the PDF. Two implementations of one rule is
// exactly how a screen and a report end up disagreeing about whether a quarter was
// a beat, so both sides keep the tolerance as a named constant and both have tests
// pinning the same boundary cases. Change a number here and change it there.

/**
 * How far from the expectation still counts as meeting it. A headline metric that
 * lands within half a percent has not beaten anything — calling it a beat invites
 * somebody to quote a beat that is not there.
 */
export const IN_LINE_TOLERANCE_PCT = 0.5;

export type Verdict = 'beat' | 'miss' | 'in_line';

export interface BeatMiss {
  verdict: Verdict;
  /** (actual − expected) ÷ |expected| × 100, to one decimal. */
  pct: number;
}

/**
 * The verdict, or null when there is no honest one.
 *
 * Null means the verdict is OMITTED — not zero, not "in line". Three ways to get
 * there and none of them is a result:
 *  - no expectation was entered (much the commonest; most rows never get one)
 *  - no actual value resolved
 *  - the expectation is zero, where the percentage would be an infinity dressed up
 *    as a number. "Expected nothing" is not "no expectation", but neither one
 *    supports a surprise figure.
 */
export function beatMiss(
  actual: number | null | undefined,
  expected: number | null | undefined,
): BeatMiss | null {
  if (actual == null || expected == null) return null;
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return null;
  if (expected === 0) return null;

  const pct = ((actual - expected) / Math.abs(expected)) * 100;
  const rounded = Math.round(pct * 10) / 10;
  const verdict: Verdict =
    Math.abs(pct) <= IN_LINE_TOLERANCE_PCT ? 'in_line' : pct > 0 ? 'beat' : 'miss';
  return { verdict, pct: rounded };
}

/** The label a reader sees. */
export function verdictLabel(v: Verdict): string {
  return v === 'beat' ? '✓ Beat' : v === 'miss' ? '✗ Miss' : '– In-line';
}

/** The size, with a real minus sign rather than a hyphen. */
export function surpriseLabel(pct: number): string {
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}
