// Deriving a department code from a suggested name.
//
// Why it matters: the suggestions banner exists to remove friction, and making someone
// invent a code by hand right after they clicked a name puts it straight back. The rule is
// deliberately dumb and predictable — first three letters — because it is a starting point
// the user edits, never a value we submit for them.

import { describe, expect, it } from 'vitest';

import { codeCandidates, codeFromName } from '@/lib/departmentCode';

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

// The fallbacks "Add all" walks when a code is refused. It cannot ask the user, so it has
// to have somewhere to go: a soft-deleted department keeps its code, is filtered out of
// GET /admin/departments, and still collides on insert.
describe('codeCandidates', () => {
  it('offers what the form would have prefilled first', () => {
    expect(codeCandidates('Legal Department')[0]).toBe('LEG');
    expect(codeCandidates('Investor Relations')[0]).toBe('INV');
  });

  it('offers initials, which is what a person would have typed', () => {
    // Minor words dropped: not HSSAE.
    expect(codeCandidates('Health, Safety, Security and Environment')).toContain('HSSE');
    expect(codeCandidates('Technology Development')).toContain('TD');
  });

  it('never repeats itself and never exceeds the 10-character column', () => {
    const codes = codeCandidates('Health, Safety, Security and Environment');
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((c) => c.length > 0 && c.length <= 10)).toBe(true);
  });

  it('always has somewhere left to go', () => {
    // Two names that collide on every natural code still end up different, because the
    // counter variants are there underneath.
    expect(codeCandidates('Finance').length).toBeGreaterThan(4);
    expect(codeCandidates('Finance')).toContain('FIN2');
  });

  it('still produces a usable code for a letterless name', () => {
    const codes = codeCandidates('—');
    expect(codes[0]).toBe('DEPT');
    expect(codes.every((c) => c.length > 0)).toBe(true);
  });
});
