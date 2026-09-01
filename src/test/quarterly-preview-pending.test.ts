// A section that has not been produced YET is not a section that produced nothing.
//
// Batch production runs in the background after the outline is locked and takes minutes
// on a large report — a real Q3-2024 run took 11 and a half. Opening Preview a minute in
// showed 44 unproduced sections rendering "No data found for this section", which is the
// failure panel. The report was fine; the screen said it wasn't.

import { describe, it, expect } from 'vitest';
import { sectionState, isProducing, wantsInput } from '@/components/quarterly/sectionState';
import type { ProducedSection } from '@/types/quarterly';

function section(over: Partial<ProducedSection> = {}): ProducedSection {
  return {
    section_code: 'c_x_n3_fair_value',
    title: 'N3 Fair Value',
    display_order: 43,
    source_type: 'Extraction',
    mode: 'table',
    status: 'pending',
    content: null,
    feeder_status: 'ready',
    ...over,
  } as unknown as ProducedSection;
}

describe('a section still in the production queue', () => {
  it('is pending, not empty', () => {
    // Before this it fell through to 'empty', which renders the input panel.
    expect(sectionState(section())).toBe('pending');
  });

  it('is not asked for input', () => {
    // The whole failure was asking the user to supply content for a section we had
    // not tried to produce yet.
    expect(wantsInput(sectionState(section()))).toBe(false);
  });

  it('is pending while drafting too', () => {
    expect(sectionState(section({ status: 'drafting' }))).toBe('pending');
  });

  it('becomes produced once its content lands', () => {
    const produced = section({
      status: 'produced',
      content: JSON.stringify({ title: 'N3', rows: [{ label: 'Revenue', current_display: '1' }] }),
    });
    expect(sectionState(produced)).toBe('produced');
  });

  it('still says needs-input when the outline already knows the input is missing', () => {
    // Accurate and actionable before production runs — that case must not be
    // swallowed by the new state.
    const missing = section({ feeder_status: 'needs_input', message: 'Awaiting financial data' });
    expect(sectionState(missing)).toBe('needs_input');
  });

  it('reports no data only once production has actually run', () => {
    // 'empty' is the backend saying it produced and found nothing.
    expect(sectionState(section({ status: 'empty' }))).toBe('empty');
  });
});

describe('isProducing', () => {
  it('is true while any section is still waiting', () => {
    const done = section({ status: 'produced', content: '{"rows":[{"label":"a","current_display":"1"}]}' });
    expect(isProducing([done, section()])).toBe(true);
  });

  it('is false once every section has been reached', () => {
    const done = section({ status: 'produced', content: '{"rows":[{"label":"a","current_display":"1"}]}' });
    const noData = section({ status: 'empty' });
    expect(isProducing([done, noData])).toBe(false);
  });

  it('is false for an empty report rather than hanging on nothing', () => {
    expect(isProducing([])).toBe(false);
  });
});
