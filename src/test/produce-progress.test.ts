import { describe, it, expect } from 'vitest';
import { computeProduceProgress } from '@/components/reports/QuarterlyGeneratingScreen';

// The loader's progress for a batch section-produce run comes from the heartbeat the
// backend already writes after every section (agent_runs.output_summary =
// {results, total}). It used to ask GET /agent_runs/{id}/nodes instead, which 404s for
// this kind of run, so the bar sat at its 6% floor for the whole build.
//
// output_summary holds three unrelated shapes, so the "not this one" cases below are
// the point of the function, not padding.
describe('computeProduceProgress', () => {
  it('returns null when there is nothing measured yet', () => {
    expect(computeProduceProgress(null)).toBeNull();
    expect(computeProduceProgress(undefined)).toBeNull();
    expect(computeProduceProgress({})).toBeNull();
    expect(computeProduceProgress('running')).toBeNull();
    expect(computeProduceProgress(42)).toBeNull();
  });

  it('ignores an extraction pipeline summary', () => {
    // `total` is the discriminator: the pipeline summary reports total_uploaded.
    expect(
      computeProduceProgress({
        total_uploaded: 3,
        figures_extracted: 120,
        results: [{ ok: true }],
      }),
    ).toBeNull();
  });

  it('ignores a period_not_found summary', () => {
    expect(
      computeProduceProgress({
        error: 'period_not_found',
        requested_period: 'Q3-2024',
        available_periods: ['Q2-2024'],
      }),
    ).toBeNull();
  });

  it('reads a real heartbeat', () => {
    expect(
      computeProduceProgress({ results: Array.from({ length: 12 }), total: 28 }),
    ).toEqual({ done: 12, total: 28, percent: 43 });
  });

  it('stays under 100 while the run is still open', () => {
    // The caller passes 100 itself once the run envelope says completed; the bar must
    // never overshoot and come back down.
    expect(
      computeProduceProgress({ results: Array.from({ length: 28 }), total: 28 })?.percent,
    ).toBe(99);
  });

  it('clamps a results list that overruns total', () => {
    expect(
      computeProduceProgress({ results: Array.from({ length: 40 }), total: 28 }),
    ).toEqual({ done: 28, total: 28, percent: 99 });
  });

  it('returns null for a malformed heartbeat rather than dividing by zero', () => {
    expect(computeProduceProgress({ results: [], total: 0 })).toBeNull();
    expect(computeProduceProgress({ results: [], total: -1 })).toBeNull();
    expect(computeProduceProgress({ results: 'nope', total: 28 })).toBeNull();
    expect(computeProduceProgress({ total: 28 })).toBeNull();
  });

  it('reports zero progress once the run exists but no section has finished', () => {
    expect(computeProduceProgress({ results: [], total: 28 })).toEqual({
      done: 0,
      total: 28,
      percent: 0,
    });
  });
});
