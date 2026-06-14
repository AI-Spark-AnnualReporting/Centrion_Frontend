// Client-side Arabic/English language check for typed text (no network).
//
// Used to validate that a user's free-text answer is written in the report's
// content language. Mirrors the backend script-ratio classifier (language.py)
// and the Annual Reporting frontend: count Arabic vs Latin letters and require
// at least MIN_CORRECT_RATIO of them to be in the expected language. Short text
// (< MIN_LETTERS) is never flagged, so a half-typed answer isn't error-flagged.

export type ContentLanguage = 'english' | 'arabic';

// At least 70% of letters must be in the expected language — i.e. up to ~30%
// of the other script (quoted terms, names, units, numbers) is tolerated.
export const MIN_CORRECT_RATIO = 0.7;
const MIN_LETTERS = 12;

function isArabicLetter(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return (
    (c >= 0x0600 && c <= 0x06ff) || // Arabic
    (c >= 0x0750 && c <= 0x077f) || // Arabic Supplement
    (c >= 0x08a0 && c <= 0x08ff) || // Arabic Extended-A
    (c >= 0xfb50 && c <= 0xfdff) || // Presentation Forms-A
    (c >= 0xfe70 && c <= 0xfeff) //   Presentation Forms-B
  );
}

function isLatinLetter(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
}

function letterCounts(text: string): { arabic: number; latin: number } {
  let arabic = 0;
  let latin = 0;
  for (const ch of text || '') {
    if (isArabicLetter(ch)) arabic++;
    else if (isLatinLetter(ch)) latin++;
  }
  return { arabic, latin };
}

/**
 * Whether `text` is acceptable for the `expected` language.
 * Fewer than MIN_LETTERS letters always passes (grace while typing); otherwise
 * at least MIN_CORRECT_RATIO of the letters must be in the expected script.
 */
export function isLanguageAcceptable(
  text: string,
  expected: ContentLanguage,
): boolean {
  const { arabic, latin } = letterCounts(text);
  const total = arabic + latin;
  if (total < MIN_LETTERS) return true;
  const correct = expected === 'arabic' ? arabic : latin;
  return correct / total >= MIN_CORRECT_RATIO;
}

/** A warning message when `text` is the wrong language, or null when it's fine. */
export function languageMismatchWarning(
  text: string,
  expected: ContentLanguage,
): string | null {
  if (isLanguageAcceptable(text, expected)) return null;
  const want = expected === 'arabic' ? 'Arabic' : 'English';
  return `This report's language is ${want} — please write mostly in ${want} (at least ${Math.round(
    MIN_CORRECT_RATIO * 100,
  )}%).`;
}
