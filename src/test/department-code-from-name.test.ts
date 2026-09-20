// Deriving a department code from a suggested name.
//
// Why it matters: the suggestions banner exists to remove friction, and making someone
// invent a code by hand right after they clicked a name puts it straight back. The rule is
// deliberately dumb and predictable — first three letters — because it is a starting point
// the user edits, never a value we submit for them.

import { describe, expect, it } from 'vitest';

import { codeFromName } from '@/pages/admin/departmentCode';

describe('codeFromName', () => {
  it('takes the first three letters and uppercases them', () => {
    expect(codeFromName('Legal Department')).toBe('LEG');
    expect(codeFromName('Sustainability Department')).toBe('SUS');
    expect(codeFromName('Finance Department')).toBe('FIN');
  });

  it('skips punctuation and spaces rather than encoding them', () => {
    // "Technology & Innovation" must not give "TE&" — the code column is a short slug.
    expect(codeFromName('Technology & Innovation')).toBe('TEC');
    expect(codeFromName('R&D')).toBe('RD');
    expect(codeFromName('  Operations')).toBe('OPE');
  });

  it('keeps digits, since some companies number their units', () => {
    expect(codeFromName('Unit 7 Logistics')).toBe('UNI');
    expect(codeFromName('3D Printing')).toBe('3DP');
  });

  it('returns what it has when the name is shorter than three letters', () => {
    // Not padded: "HR" is a real code here — it is the system default for Human Resources.
    expect(codeFromName('HR')).toBe('HR');
    expect(codeFromName('X')).toBe('X');
  });

  it('is empty for an empty or letterless name', () => {
    expect(codeFromName('')).toBe('');
    expect(codeFromName('   ')).toBe('');
    expect(codeFromName('—')).toBe('');
  });

  it('handles a name that is already a code', () => {
    expect(codeFromName('FIN')).toBe('FIN');
  });
});
