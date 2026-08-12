// Reading the currency and scale back out of an already-formatted figure.
//
// The backend formats a figure once ("SAR 170,324M") and drops the unit, scale and
// currency before the string ever reaches a renderer — nothing downstream carries
// them as data. So both the extraction screen and the report table recover them the
// same way: by parsing the string. This module is that one rule, shared, because two
// screens showing the same table must not disagree about what its numbers mean.
//
// The Python side of the export has its own copy in report_export.py
// (_money_parts / _bare_figure / _units_caption) — unavoidable across languages, and
// pinned by tests on both sides.

// What the backend's _fmt_value emits for money: a currency code, digits, an optional
// scale letter — and for a negative the prefix sits INSIDE the accounting parentheses.
const MONEY_RE = /^\(?\s*([A-Z]{3})\s*([\d,]+(?:\.\d+)?)\s*([KMB])?\s*\)?$/i;

const SCALE_WORDS: Record<string, string> = {
  K: 'thousands',
  M: 'millions',
  B: 'billions',
};

export interface FigureUnits {
  currency: string;
  /** "K" | "M" | "B", or "" when the figures are at actual scale. */
  scale: string;
}

/** The currency and scale of one formatted figure, or null if it isn't money. */
export function moneyParts(display: string | null | undefined): FigureUnits | null {
  const m = MONEY_RE.exec((display ?? '').trim());
  return m ? { currency: m[1].toUpperCase(), scale: (m[3] ?? '').toUpperCase() } : null;
}

/**
 * The one currency and scale a set of cells is priced in — or null when they don't
 * agree, and null is the important half.
 *
 * A table can legitimately hold SAR amounts, a percentage and a per-share figure at
 * once, and "all amounts in SAR millions" would then be a false statement. When that
 * happens this declines, and the caller leaves every cell exactly as it was.
 */
export function deriveUnits(displays: Array<string | null | undefined>): FigureUnits | null {
  let found: FigureUnits | null = null;
  for (const d of displays) {
    const parts = moneyParts(d);
    if (!parts) continue; // a rate, a ratio, a label — simply not money
    if (!found) found = parts;
    else if (found.currency !== parts.currency || found.scale !== parts.scale) return null;
  }
  return found;
}

/**
 * "SAR 170,324M" → "170,324". The unit is stated once above the table; repeating it
 * in every cell is the noise that made a 6x5 table unreadable.
 *
 * Stripped from the display string rather than reformatted from the value, so whatever
 * scale the report declared is preserved — and only when the prefix is this table's own
 * currency, so a percentage row ("4.7%", a coupon rate) is left exactly as it is, and a
 * genuinely foreign cell stays visibly foreign.
 */
export function bareFigure(display: string | null | undefined, currency?: string | null): string {
  const raw = (display ?? '').trim();
  if (!raw || !currency) return raw;
  const cur = currency.toUpperCase().replace(/[^A-Z]/g, '');
  if (!cur) return raw;
  const negative = raw.match(new RegExp(`^\\((?:${cur})\\s*(.+?)([KMB])?\\)$`, 'i'));
  if (negative) return `(${negative[1]})`;
  const plain = raw.match(new RegExp(`^${cur}\\s*(.+?)([KMB])?$`, 'i'));
  return plain ? plain[1] : raw;
}

/**
 * What a filing prints where there is nothing: never a bare 0. A statement of changes
 * in equity is mostly nil cells — printed as zeros they are a wall of noise with the
 * real movements buried in it.
 */
export const NIL_CELL = '—';

// A zero amount, whether or not the currency was stripped — "0", "0.00", "(0)",
// "SAR 0M", "(SAR 0M)". A table whose units disagree keeps its prefixes, and a nil
// cell there is still nil.
//
// A rate of "0.0%" and "0 bps" deliberately do NOT match: zero percent is a fact
// about the business, an empty equity column is not.
const NIL_RE = /^\(?\s*(?:[A-Z]{3}\s*)?0(?:[.,]0+)?\s*[KMB]?\s*\)?$/i;

/** How one grid cell prints: currency stripped, nil as a dash. */
export function gridValue(display: string | null | undefined, currency?: string | null): string {
  const value = bareFigure(display, currency);
  return !value || NIL_RE.test(value) ? NIL_CELL : value;
}

/**
 * "All amounts in SAR millions unless otherwise stated."
 *
 * The trailing clause earns its place: a grid can carry a rate column beside the
 * amounts, and that cell keeps its own %, so the sentence has to leave room for it.
 */
export function unitsCaption({ currency, scale }: FigureUnits): string {
  const word = SCALE_WORDS[scale];
  return word
    ? `All amounts in ${currency} ${word} unless otherwise stated.`
    : `All amounts in ${currency} unless otherwise stated.`;
}
