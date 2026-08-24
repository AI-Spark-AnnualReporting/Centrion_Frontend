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

// The shape the earnings lane used to emit before it moved onto _fmt_value: the
// number first, then the raw storage token — "123,534 SAR_million", with a plain
// minus for a negative. Reports produced before that change still have these
// strings stored, and the produce cache keys on a section's inputs so they never
// re-render on their own. Recognising the old shape is what lets an EXISTING
// report read correctly on screen instead of showing the token.
// Mirrors report_export._LEGACY_MONEY_RE.
const LEGACY_MONEY_RE = /^\(?\s*(-?)\s*([\d,]+(?:\.\d+)?)\s+([A-Z]{3})_([A-Z]+)\s*\)?$/i;

const LEGACY_SCALE_LETTERS: Record<string, string> = {
  thousand: 'K', thousands: 'K',
  million: 'M', millions: 'M',
  billion: 'B', billions: 'B',
  actual: '', units: '',
};

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
  const raw = (display ?? '').trim();
  const m = MONEY_RE.exec(raw);
  if (m) return { currency: m[1].toUpperCase(), scale: (m[3] ?? '').toUpperCase() };
  const legacy = LEGACY_MONEY_RE.exec(raw);
  if (legacy) {
    const letter = LEGACY_SCALE_LETTERS[legacy[4].toLowerCase()];
    if (letter !== undefined) return { currency: legacy[3].toUpperCase(), scale: letter };
  }
  return null;
}

/**
 * The currency and scale a set of cells is MOSTLY priced in — or null when no single
 * sentence would be true of them, and null is the important half.
 *
 * The majority wins rather than unanimity. A table legitimately holds SAR amounts
 * beside a percentage or a per-share figure, and those are exactly what "unless
 * otherwise stated" is for: bareFigure only strips a prefix matching this table's own
 * currency, so the odd cell keeps its unit and stays visibly different. Requiring
 * unanimity meant one rate row made all forty amount rows go on repeating "SAR".
 *
 * Two cases still decline, because the caption there would be false rather than
 * merely incomplete:
 *   - The same currency at more than one SCALE. bareFigure strips the scale letter
 *     along with the code, so "SAR 5B" under a millions caption would print as "5"
 *     and read as five million.
 *   - No single majority — one SAR row against one USD row names neither.
 *
 * Mirrors report_export._derive_table_units; the two are pinned by tests on both
 * sides and must not drift.
 */
export function deriveUnits(displays: Array<string | null | undefined>): FigureUnits | null {
  const counts = new Map<string, { units: FigureUnits; n: number }>();
  for (const d of displays) {
    const parts = moneyParts(d);
    if (!parts) continue; // a rate, a ratio, a label — simply not money
    const key = `${parts.currency}|${parts.scale}`;
    const seen = counts.get(key);
    if (seen) seen.n += 1;
    else counts.set(key, { units: parts, n: 1 });
  }
  if (counts.size === 0) return null;

  const scalesByCurrency = new Map<string, Set<string>>();
  for (const { units } of counts.values()) {
    const scales = scalesByCurrency.get(units.currency) ?? new Set<string>();
    scales.add(units.scale);
    scalesByCurrency.set(units.currency, scales);
  }
  for (const scales of scalesByCurrency.values()) if (scales.size > 1) return null;

  const ranked = [...counts.values()].sort((a, b) => b.n - a.n);
  if (ranked.length > 1 && ranked[0].n === ranked[1].n) return null;
  return ranked[0].units;
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
  if (plain) return plain[1];
  // The pre-_fmt_value earnings shape (see LEGACY_MONEY_RE). The minus becomes
  // accounting parentheses, which is what the string would have carried had it
  // been written today.
  const legacy = LEGACY_MONEY_RE.exec(raw);
  if (legacy && legacy[3].toUpperCase() === cur) {
    return legacy[1] ? `(${legacy[2]})` : legacy[2];
  }
  return raw;
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
 * "All figures in SAR millions unless otherwise stated."
 *
 * The trailing clause earns its place: a grid can carry a rate column beside the
 * amounts, and that cell keeps its own %, so the sentence has to leave room for it.
 */
export function unitsCaption({ currency, scale }: FigureUnits): string {
  const word = SCALE_WORDS[scale];
  return word
    ? `All figures in ${currency} ${word} unless otherwise stated.`
    : `All figures in ${currency} unless otherwise stated.`;
}

// ── Storage tokens written into PROSE ────────────────────────────────────────
//
// The narrative producers were handed a figure's display string, and the analysis
// prompt tells the model to quote it EXACTLY as displayed — so "248,891
// SAR_million" was copied into the sentence and then stored. Fixing the formatter
// does not reach text that was already written, so sentences are rewritten at
// render time instead.
//
// Prose spells the scale out ("SAR 248,891 million"): a table column has a caption
// above it doing that job, a sentence does not, and "SAR 248,891M" mid-sentence
// reads like a typo. Negatives take the accounting parentheses the tables use.
//
// Mirrors report_export.canonical_money_in_text; pinned by tests on both sides.
const PROSE_MONEY_RE = /(?<![\w,.])(-?)\s*([\d,]+(?:\.\d+)?)\s+([A-Z]{3})_([A-Z]+)\b/gi;

const PROSE_SCALE_WORDS: Record<string, string> = {
  thousand: 'thousand', thousands: 'thousand',
  million: 'million', millions: 'million',
  billion: 'billion', billions: 'billion',
  actual: '', units: '',
};

/** "248,891 SAR_million" → "SAR 248,891 million"; a negative → "(SAR 57,869 million)". */
export function canonicalMoneyInText(text: string): string {
  if (!text || !text.includes('_')) return text; // the overwhelmingly common case
  return text.replace(PROSE_MONEY_RE, (whole, sign, digits, currency, scale) => {
    const word = PROSE_SCALE_WORDS[String(scale).toLowerCase()];
    if (word === undefined) return whole; // not a scale token — leave the sentence alone
    const body = `${String(currency).toUpperCase()} ${digits}${word ? ` ${word}` : ''}`;
    return sign ? `(${body})` : body;
  });
}
