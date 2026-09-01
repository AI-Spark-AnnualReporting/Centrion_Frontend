// The assembled report's section mapper.
//
// It builds a ProducedSection field-by-field, which means anything added upstream
// is silently dropped unless someone lists it here. That has already happened once:
// the backend sent the Analyse commentary, the renderer asked for it, and this
// mapper threw it away — so the paragraphs never appeared on the report page.

import { describe, it, expect } from 'vitest';
import { toProduced } from '@/pages/quarterly/AssembledReportPage';
import type { AssembledSection, SectionAnalysis } from '@/types/quarterly';

const ANALYSIS: SectionAnalysis = {
  text: 'Revenue was SAR 424,095 for the quarter.\n\nNet income was SAR 122,188.',
  generated_at: '2026-08-12T10:00:00Z',
  model: 'gpt-4.1',
  fingerprint: 'abc123',
};

function assembled(over: Partial<AssembledSection> = {}): AssembledSection {
  return {
    section_code: 'sec_income',
    title: 'Income & Comprehensive Income',
    display_order: 3,
    source_type: 'Extraction',
    mode: 'table',
    content: JSON.stringify({ title: 'Income', rows: [{ label: 'Revenue', current_display: 'SAR 1' }] }),
    ...over,
  };
}

describe('mapping an assembled section for the report page', () => {
  it('carries the analysis through — this is what was dropped', () => {
    expect(toProduced(assembled({ analysis: ANALYSIS })).analysis).toEqual(ANALYSIS);
  });

  it('is null, not undefined, for a section never analysed', () => {
    expect(toProduced(assembled()).analysis).toBeNull();
  });

  it('still maps everything else it always did', () => {
    const out = toProduced(assembled());
    expect(out.section_code).toBe('sec_income');
    expect(out.title).toBe('Income & Comprehensive Income');
    expect(out.display_order).toBe(3);
    expect(out.mode).toBe('table');
    expect(out.status).toBe('produced');
    expect(out.feeder_status).toBe('ready');
  });

  it('stringifies content the endpoint returned as an object', () => {
    const out = toProduced(assembled({ content: { title: 'T', rows: [] } as unknown as string }));
    expect(typeof out.content).toBe('string');
    expect(out.content).toContain('"title":"T"');
  });
});
