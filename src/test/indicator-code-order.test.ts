// The KPI Normalizer lists indicator codes in reading order. The API sorts them
// as text, which gave 2-1, 2-10, 2-11 … 2-2, put GRI 101 before GRI 2 and GRI 3
// after GRI 207, and IFRS-S2 6a after 36e (QA audit KP-04). These are the real
// code lists from the catalogue, in the order the API returns them.

import { describe, it, expect } from 'vitest';
import { compareIndicatorCodes } from '@/lib/indicatorCodeOrder';

const GRI_AS_API_SORTS =
  '101-1 | 101-2 | 101-3 | 101-4 | 101-5 | 101-6 | 101-7 | 101-8 | 2-1 | 2-10 | 2-11 | 2-12 | 2-13 | 2-14 | 2-15 | 2-16 | 2-17 | 2-18 | 2-19 | 2-2 | 2-20 | 2-21 | 2-22 | 2-23 | 2-24 | 2-25 | 2-26 | 2-27 | 2-28 | 2-29 | 2-3 | 2-30 | 2-4 | 2-5 | 2-6 | 2-7 | 2-8 | 2-9 | 201-1 | 201-2 | 201-3 | 201-4 | 202-1 | 202-2 | 203-1 | 203-2 | 204-1 | 205-1 | 205-2 | 205-3 | 206-1 | 207-1 | 207-2 | 207-3 | 207-4 | 3-1 | 3-2 | 3-3 | 301-1 | 301-2 | 301-3 | 302-1 | 302-2 | 302-3 | 302-4 | 302-5 | 303-1 | 303-2 | 303-3 | 303-4 | 303-5 | 304-1 | 304-2 | 304-3 | 304-4 | 305-1 | 305-2 | 305-3 | 305-4 | 305-5 | 305-6 | 305-7 | 306-1 | 306-2 | 306-3 | 306-4 | 306-5 | 308-1 | 308-2 | 401-1 | 401-2 | 401-3 | 402-1 | 403-1 | 403-10 | 403-2 | 403-3 | 403-4 | 403-5 | 403-6 | 403-7 | 403-8 | 403-9 | 404-1 | 404-2 | 404-3 | 405-1 | 405-2 | 406-1 | 407-1 | 408-1 | 409-1 | 410-1 | 411-1 | 412-1 | 412-2 | 412-3 | 413-1 | 413-2 | 414-1 | 414-2 | 415-1 | 416-1 | 416-2 | 417-1 | 417-2 | 417-3 | 418-1'.split(
    ' | ',
  );

const IFRS_S2_AS_API_SORTS =
  'IFRS-S2-10a | IFRS-S2-10b | IFRS-S2-13a | IFRS-S2-14a-i | IFRS-S2-14a-ii | IFRS-S2-29a-i-1 | IFRS-S2-29a-i-2 | IFRS-S2-29a-iii | IFRS-S2-29g-i | IFRS-S2-29g-ii | IFRS-S2-32 | IFRS-S2-36e | IFRS-S2-6a | IFRS-S2-6a-i | IFRS-S2-6a-ii | IFRS-S2-6b-i'.split(
    ' | ',
  );

const sorted = (codes: string[]) => [...codes].sort(compareIndicatorCodes);

describe('compareIndicatorCodes (KPI Normalizer order)', () => {
  it('puts GRI 2-2 right after 2-1, and 2-10 after 2-9', () => {
    const out = sorted(GRI_AS_API_SORTS);
    expect(out.slice(0, 11)).toEqual(['2-1', '2-2', '2-3', '2-4', '2-5', '2-6', '2-7', '2-8', '2-9', '2-10', '2-11']);
  });

  it('orders the GRI standards 2 → 3 → 101 → 201 … → 418', () => {
    const out = sorted(GRI_AS_API_SORTS);
    expect(out.indexOf('2-30')).toBeLessThan(out.indexOf('3-1'));
    expect(out.indexOf('3-3')).toBeLessThan(out.indexOf('101-1'));
    expect(out.indexOf('101-8')).toBeLessThan(out.indexOf('201-1'));
    expect(out[out.length - 1]).toBe('418-1');
  });

  it('puts 403-10 after 403-9, not after 403-1', () => {
    const out = sorted(GRI_AS_API_SORTS);
    expect(out.indexOf('403-9') + 1).toBe(out.indexOf('403-10'));
  });

  it('keeps every code (sorting never drops or duplicates one)', () => {
    const out = sorted(GRI_AS_API_SORTS);
    expect(out).toHaveLength(GRI_AS_API_SORTS.length);
    expect(new Set(out)).toEqual(new Set(GRI_AS_API_SORTS));
  });

  it('puts IFRS-S2 6a first and 36e last, with sub-items under their parent', () => {
    expect(sorted(IFRS_S2_AS_API_SORTS)).toEqual([
      'IFRS-S2-6a', 'IFRS-S2-6a-i', 'IFRS-S2-6a-ii', 'IFRS-S2-6b-i',
      'IFRS-S2-10a', 'IFRS-S2-10b', 'IFRS-S2-13a', 'IFRS-S2-14a-i', 'IFRS-S2-14a-ii',
      'IFRS-S2-29a-i-1', 'IFRS-S2-29a-i-2', 'IFRS-S2-29a-iii', 'IFRS-S2-29g-i', 'IFRS-S2-29g-ii',
      'IFRS-S2-32', 'IFRS-S2-36e',
    ]);
  });

  it('treats a missing code as empty instead of crashing', () => {
    expect(sorted(['2-2', null as unknown as string, '2-1'])).toEqual([null, '2-1', '2-2']);
  });
});
