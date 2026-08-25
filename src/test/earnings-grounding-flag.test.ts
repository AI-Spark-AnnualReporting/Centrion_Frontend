// The wire → screen translation for "these numbers are not in the figures".
//
// This is where the whole feature was broken, and where no test looked. The page
// tests mock at the API boundary, so they hand themselves a section with
// `grounding_flag` already set — a shape the backend has never produced. The
// mapper read three singular STRING keys while the backend sends
// `feeder.grounding_violations` (GET /sections) and `grounding_violations`
// (PATCH/refine), both LISTS. So the flag was always null, the banner never
// rendered, and the only symptom was a 409 on Approve naming a raw section code.

import { describe, it, expect } from 'vitest';
import { normalizeEarningsSections } from '@/lib/api';

const wire = (over: Record<string, unknown> = {}) => ({
  sections: [{
    section_code: 's08_financial_review',
    title: 'Financial Review (MD&A)',
    display_order: 8,
    mode: 'generate',
    status: 'produced',
    content: 'Revenue fell 15.4%.',
    ...over,
  }],
});

const first = (raw: unknown) => normalizeEarningsSections(raw).sections[0];

describe('reading a grounding flag off the wire', () => {
  it('finds it nested under feeder, which is how GET /sections sends it', () => {
    const s = first(wire({ feeder: { grounding_violations: ['15.4%', '1.9%'] } }));
    expect(s.grounding_flag).toBe('15.4%, 1.9%');
  });

  it('finds it at the top level, which is how the PATCH and refine responses send it', () => {
    expect(first(wire({ grounding_violations: ['15.4%'] })).grounding_flag).toBe('15.4%');
  });

  it('names every offending number, not just the first', () => {
    // One number at a time would make clearing the flag a sequence of guesses.
    const s = first(wire({ feeder: { grounding_violations: ['15.4%', '1.9%', '31.1'] } }));
    expect(s.grounding_flag).toBe('15.4%, 1.9%, 31.1');
  });

  it('reads the acknowledgement from feeder.edit_acknowledged, the field actually stored', () => {
    const s = first(wire({
      feeder: { grounding_violations: ['15.4%'], edit_acknowledged: true },
    }));
    expect(s.grounding_acknowledged).toBe(true);
  });

  it('leaves a clean section clean', () => {
    const s = first(wire({ feeder: {} }));
    expect(s.grounding_flag).toBeNull();
    expect(s.grounding_acknowledged).toBe(false);
  });

  it('still honours the older singular string keys', () => {
    // Nothing observed sends these, but reading them costs nothing and removing
    // them could only break something unseen.
    expect(first(wire({ grounding_flag: 'Revenue not grounded' })).grounding_flag)
      .toBe('Revenue not grounded');
  });

  it('survives a malformed list without dropping the section', () => {
    const s = first(wire({ feeder: { grounding_violations: [null, 3, ''] } }));
    expect(s.section_code).toBe('s08_financial_review');
    expect(s.grounding_flag).toBe('3');
  });

  it('does not disturb the rest of the section', () => {
    const s = first(wire({ feeder: { grounding_violations: ['15.4%'] } }));
    expect(s.title).toBe('Financial Review (MD&A)');
    expect(s.display_order).toBe(8);
    expect(s.mode).toBe('generate');
  });
});
