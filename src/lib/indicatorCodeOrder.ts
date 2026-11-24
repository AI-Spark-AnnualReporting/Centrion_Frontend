// Indicator codes ("2-1", "2-10", "305-1", "IFRS-S2-29g-i") must be ordered the way
// a person reads them, with the numbers inside compared as numbers. The API sorts
// them as plain text, which put GRI 2-10 before 2-2 (QA audit KP-04).

// A "numeric" collator compares runs of digits by value: 2-2 < 2-10, 6 < 29.
const CODE_COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** Negative if code a comes before code b in reading order, positive if after. */
export function compareIndicatorCodes(a: string | null | undefined, b: string | null | undefined): number {
  return CODE_COLLATOR.compare(a ?? '', b ?? '');
}
