// Consensus vs Actual — the verdict, and the table that asks for it.
//
// THE BOUNDARY CASES BELOW ARE MIRRORED IN THE BACKEND, in
// tests/test_earnings_consensus.py. The rule is implemented twice — here so it
// updates as the user types, there so the same answer reaches the PDF — and two
// implementations of one rule is how a screen and a report end up disagreeing
// about whether a quarter was a beat. If you change a number here, change it there.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  beatMiss,
  verdictLabel,
  surpriseLabel,
  IN_LINE_TOLERANCE_PCT,
} from '@/components/earnings/beatMiss';
import { ConsensusLedger } from '@/components/earnings/ConsensusLedger';

const fig = (
  id: string,
  label: string,
  value: number,
  expected: number | null = null,
) => ({
  id,
  display_label: label,
  value,
  unit: 'SAR_million',
  table: 'Income',
  group: null,
  expected_value: expected,
  memory_key: `custom__${id}`,
});

describe('beatMiss', () => {
  it('matches the examples from the brief', () => {
    expect(beatMiss(2.15, 2.0)).toEqual({ verdict: 'beat', pct: 7.5 });
    expect(beatMiss(467, 450)).toEqual({ verdict: 'beat', pct: 3.8 });
    expect(beatMiss(122, 125)).toEqual({ verdict: 'miss', pct: -2.4 });
  });

  it('calls anything inside half a percent in line', () => {
    expect(beatMiss(100.4, 100)?.verdict).toBe('in_line');
    expect(beatMiss(99.6, 100)?.verdict).toBe('in_line');
  });

  it('treats the boundary as inclusive', () => {
    // MIRRORED IN THE BACKEND — exactly on the line is in line
    expect(beatMiss(100.5, 100)?.verdict).toBe('in_line');
    expect(beatMiss(99.5, 100)?.verdict).toBe('in_line');
  });

  it('calls just outside it a real result', () => {
    // MIRRORED IN THE BACKEND
    expect(beatMiss(100.6, 100)).toEqual({ verdict: 'beat', pct: 0.6 });
    expect(beatMiss(99.4, 100)).toEqual({ verdict: 'miss', pct: -0.6 });
  });

  it('keeps the tolerance as a named constant', () => {
    expect(IN_LINE_TOLERANCE_PCT).toBe(0.5);
  });

  it('gives no verdict without an expectation', () => {
    // Not zero, not "in line". Most rows never get one.
    expect(beatMiss(100, null)).toBeNull();
    expect(beatMiss(null, 100)).toBeNull();
    expect(beatMiss(100, undefined)).toBeNull();
  });

  it('gives no verdict against an expectation of zero', () => {
    // The percentage would be an infinity dressed up as a number.
    expect(beatMiss(5, 0)).toBeNull();
    expect(beatMiss(0, 0)).toBeNull();
  });

  it('reads a negative expectation the right way round', () => {
    // Losing less than expected is a beat.
    expect(beatMiss(-8, -10)?.verdict).toBe('beat');
    expect(beatMiss(-12, -10)?.verdict).toBe('miss');
  });

  it('writes the size with a real minus sign', () => {
    expect(`${verdictLabel('beat')}  ${surpriseLabel(7.5)}`).toBe('✓ Beat  +7.5%');
    expect(`${verdictLabel('miss')}  ${surpriseLabel(-2.4)}`).toBe('✗ Miss  −2.4%');
  });
});

describe('ConsensusLedger', () => {
  const render3 = (onSetExpected = vi.fn()) => {
    render(
      <ConsensusLedger
        figures={[
          fig('a', 'Earnings per share', 2.15, 2.0),
          fig('b', 'Net income', 122, 125),
          fig('c', 'External revenue', 424095),
        ]}
        onSetExpected={onSetExpected}
        onRemove={vi.fn()}
      />,
    );
    return onSetExpected;
  };

  it('shows the verdict and its size beside each answered row', () => {
    render3();
    const eps = screen.getByRole('row', { name: /Earnings per share/ });
    expect(within(eps).getByText('✓ Beat')).toBeInTheDocument();
    expect(within(eps).getByText('+7.5%')).toBeInTheDocument();

    const ni = screen.getByRole('row', { name: /Net income/ });
    expect(within(ni).getByText('✗ Miss')).toBeInTheDocument();
    expect(within(ni).getByText('−2.4%')).toBeInTheDocument();
  });

  it('leaves a row nobody forecast with its actual and nothing else', () => {
    // Present and visibly unanswered. Hiding it loses a real figure; a zero
    // invents a forecast.
    render3();
    const rev = screen.getByRole('row', { name: /External revenue/ });
    expect(within(rev).getByText('424,095')).toBeInTheDocument();
    expect(within(rev).getByLabelText('Expected External revenue')).toHaveValue('');
    expect(within(rev).queryByText(/Beat|Miss|In-line/)).toBeNull();
  });

  it('saves what is typed, once, on blur', () => {
    const onSet = render3();
    const box = screen.getByLabelText('Expected External revenue');
    fireEvent.change(box, { target: { value: '450000' } });
    fireEvent.blur(box);
    expect(onSet).toHaveBeenCalledWith('c', 450000);
  });

  it('clearing the box clears the expectation rather than storing a zero', () => {
    const onSet = render3();
    const box = screen.getByLabelText('Expected Earnings per share');
    fireEvent.change(box, { target: { value: '' } });
    fireEvent.blur(box);
    expect(onSet).toHaveBeenCalledWith('a', null);
  });

  it('refuses something that is not a number instead of storing it', () => {
    const onSet = render3();
    const box = screen.getByLabelText('Expected External revenue');
    fireEvent.change(box, { target: { value: 'about 450k' } });
    fireEvent.blur(box);
    expect(onSet).not.toHaveBeenCalled();
    expect(box).toHaveValue('');   // put back, not left lying
  });

  it('counts how many rows have been answered', () => {
    render3();
    expect(screen.getByText(/3 lines · 2 with an expectation/)).toBeInTheDocument();
  });
});
