// Where reopening an earnings report should land.
//
// The list used to drop everyone on Preview, hardcoded. Someone who had built a
// report and gone to read it came back a step short — and could not click
// forward either, because the stepper greys a step it thinks is ahead of you.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  rememberStep, stepHint, reportStep, reportHref, furthestStep,
  reachedStepNumber, resumeHref, isFinished,
} from '@/pages/earnings/earnings-resume';

const report = (over: Record<string, unknown> = {}) => ({
  report_id: 'rep-1',
  status: 'draft',
  approved_at: null as string | null,
  locked_at: null as string | null,
  generated_at: null as string | null,
  ...over,
});

beforeEach(() => localStorage.clear());

describe('what the server can decide on its own', () => {
  it('a report that was never built opens at the Outline', () => {
    expect(reportStep(report())).toBe('outline');
  });

  it('a built report opens at Preview', () => {
    expect(reportStep(report({ generated_at: '2026-01-01T00:00:00Z' }))).toBe('preview');
  });

  it.each(['approved', 'locked', 'published'])('a %s report opens at the Report', (status) => {
    expect(reportStep(report({ status, generated_at: '2026-01-01T00:00:00Z' }))).toBe('report');
  });

  it('approved_at alone is enough — status is not the only thing that gets written', () => {
    expect(isFinished(report({ approved_at: '2026-01-01T00:00:00Z' }))).toBe(true);
    expect(reportStep(report({ approved_at: '2026-01-01T00:00:00Z' }))).toBe('report');
  });
});

describe('the one thing the server cannot tell apart', () => {
  // 'draft' + produced looks identical whether the user was last curating
  // figures on Preview or reading the finished report on Report.
  const built = report({ generated_at: '2026-01-01T00:00:00Z' });

  it('remembers that the user was on the Report screen', () => {
    rememberStep('rep-1', 'report');
    expect(reportStep(built, stepHint('rep-1'))).toBe('report');
  });

  it('falls back to Preview with no hint', () => {
    expect(reportStep(built, stepHint('rep-1'))).toBe('preview');
  });

  it('never promotes a report past what the server says it reached', () => {
    // A hint is not evidence the work exists — an unbuilt report still opens at
    // the Outline no matter what the browser remembers.
    rememberStep('rep-1', 'report');
    expect(reportStep(report(), stepHint('rep-1'))).toBe('outline');
  });

  it('the newest hint wins', () => {
    rememberStep('rep-1', 'report');
    rememberStep('rep-1', 'preview');
    expect(stepHint('rep-1')).toBe('preview');
  });
});

describe('the hint is a hint — it never breaks anything', () => {
  it('survives unreadable storage', () => {
    localStorage.setItem('centriton_earnings_steps', 'not json');
    expect(stepHint('rep-1')).toBeUndefined();
    expect(reportStep(report())).toBe('outline');
  });

  it('ignores a value that is not a step', () => {
    localStorage.setItem(
      'centriton_earnings_steps',
      JSON.stringify({ 'rep-1': { step: 'somewhere-else', savedAt: Date.now() } }),
    );
    expect(stepHint('rep-1')).toBeUndefined();
  });

  it('forgets a hint older than a week', () => {
    localStorage.setItem(
      'centriton_earnings_steps',
      JSON.stringify({ 'rep-1': { step: 'report', savedAt: Date.now() - 8 * 24 * 3600 * 1000 } }),
    );
    expect(stepHint('rep-1')).toBeUndefined();
  });

  it('does not throw when storage refuses to write', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => { throw new Error('quota'); });
    expect(() => rememberStep('rep-1', 'report')).not.toThrow();
    setItem.mockRestore();
  });

  it('does not grow without bound', () => {
    for (let i = 0; i < 60; i += 1) rememberStep(`rep-${i}`, 'preview');
    const stored = JSON.parse(localStorage.getItem('centriton_earnings_steps') ?? '{}');
    expect(Object.keys(stored).length).toBeLessThanOrEqual(50);
  });
});

describe('hrefs and stepper reach', () => {
  it('builds the URL for the resolved step', () => {
    rememberStep('rep-1', 'report');
    expect(reportHref(report({ generated_at: '2026-01-01T00:00:00Z' })))
      .toBe('/earnings/rep-1/report');
  });

  it('furthestStep is server-only, so the stepper cannot be talked past it', () => {
    expect(furthestStep(report())).toBe('outline');
    expect(furthestStep(report({ generated_at: 'x' }))).toBe('preview');
    expect(furthestStep(report({ status: 'approved' }))).toBe('report');
  });

  it('unlocks the Report step for someone who has been there', () => {
    rememberStep('rep-1', 'report');
    expect(reachedStepNumber('rep-1', 3)).toBe(4);
  });

  it('never reports less reach than the step you are on', () => {
    rememberStep('rep-1', 'outline');
    expect(reachedStepNumber('rep-1', 3)).toBe(3);
    expect(reachedStepNumber(undefined, 3)).toBe(3);
  });

  it('the id-only banner uses the hint, and otherwise goes where it always went', () => {
    expect(resumeHref('rep-1')).toBe('/earnings/rep-1/outline');
    rememberStep('rep-1', 'preview');
    expect(resumeHref('rep-1')).toBe('/earnings/rep-1/preview');
    expect(resumeHref(null)).toBe('/earnings/setup');
  });
});
