// Reading a figure's units back out of an already-formatted string.
//
// The backend formats once ("SAR 170,324M") and drops the currency/scale before the
// string reaches any renderer, so both the extraction screen and the report table
// recover them by parsing. This is that shared rule — and the half that matters most
// is when it DECLINES: a table mixing currencies must not be captioned as if it
// didn't, and a rate column must never be stripped of its %.

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { moneyParts, deriveUnits, bareFigure, unitsCaption } from '@/components/quarterly/figureUnits';
import { SectionContent } from '@/components/quarterly/SectionContent';
import type { ProducedSection } from '@/types/quarterly';

describe('reading the units off a figure', () => {
  it('recognises money at each scale', () => {
    expect(moneyParts('SAR 170,324M')).toEqual({ currency: 'SAR', scale: 'M' });
    expect(moneyParts('USD 1.2B')).toEqual({ currency: 'USD', scale: 'B' });
    expect(moneyParts('SAR 1,234')).toEqual({ currency: 'SAR', scale: '' });
    expect(moneyParts('(SAR 10M)')).toEqual({ currency: 'SAR', scale: 'M' });
  });

  it('does not mistake a rate, a ratio or a label for money', () => {
    for (const v of ['4.7%', '1.75', 'Opening balance', '', null, undefined]) {
      expect(moneyParts(v)).toBeNull();
    }
  });
});

describe('agreeing on one unit for a table', () => {
  it('takes the unit when every amount matches', () => {
    expect(deriveUnits(['SAR 100M', 'SAR 5M', '(SAR 2M)'])).toEqual({ currency: 'SAR', scale: 'M' });
  });

  it('ignores a rate sitting beside the amounts', () => {
    // The caption says "unless otherwise stated" exactly so this stays true.
    expect(deriveUnits(['SAR 100M', '4.7%'])).toEqual({ currency: 'SAR', scale: 'M' });
  });

  it('declines on two currencies', () => {
    expect(deriveUnits(['SAR 100M', 'USD 5M'])).toBeNull();
  });

  it('declines on two scales', () => {
    expect(deriveUnits(['SAR 100M', 'SAR 5B'])).toBeNull();
  });

  it('declines when there is no money at all', () => {
    expect(deriveUnits(['4.7%', '3.1%'])).toBeNull();
  });
});

describe('baring a figure', () => {
  it.each([
    ['SAR 100,603M', '100,603'],
    ['SAR 1,234', '1,234'],
    ['(SAR 10M)', '(10)'],
    ['SAR 0M', '0'],
    ['4.7%', '4.7%'],
    ['USD 50M', 'USD 50M'],
    ['Opening balance', 'Opening balance'],
  ])('%s -> %s', (input, expected) => {
    expect(bareFigure(input, 'SAR')).toBe(expected);
  });

  it('strips nothing without a currency to strip', () => {
    expect(bareFigure('SAR 100M', null)).toBe('SAR 100M');
  });
});

describe('the caption', () => {
  it('names the scale', () => {
    expect(unitsCaption({ currency: 'SAR', scale: 'M' }))
      .toBe('All amounts in SAR millions unless otherwise stated.');
    expect(unitsCaption({ currency: 'SAR', scale: '' }))
      .toBe('All amounts in SAR unless otherwise stated.');
  });
});

// ── on the report table ──────────────────────────────────────────────────────

function gridSection(cells: Array<[string, string]>): ProducedSection {
  return {
    section_code: 'n6', title: 'N6 Intangible Assets', display_order: 6,
    source_type: 'Extraction', mode: 'table', status: 'produced', feeder_status: 'ready',
    content: JSON.stringify({
      title: 'N6 Intangible Assets',
      matrix_columns: cells.map(([k]) => ({ key: k, label: k })),
      rows: [{
        label: 'Opening balance', role: 'line', indent: 0,
        current_display: cells[0][1],
        cells: cells.map(([k, v]) => ({ key: k, display: v })),
      }],
    }),
  } as ProducedSection;
}

describe('a grid on the report page', () => {
  it('states the currency once and leaves the cells bare', () => {
    render(<SectionContent section={gridSection([['Goodwill', 'SAR 100,603M'], ['Other', 'SAR 4,031M']])} />);
    expect(screen.getByText('All amounts in SAR millions unless otherwise stated.')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText('100,603')).toBeInTheDocument();
    expect(within(table).queryByText('SAR 100,603M')).not.toBeInTheDocument();
  });

  it('keeps a rate column intact', () => {
    render(<SectionContent section={gridSection([['Total', 'SAR 452M'], ['Rate', '4.7%']])} />);
    const table = screen.getByRole('table');
    expect(within(table).getByText('452')).toBeInTheDocument();
    expect(within(table).getByText('4.7%')).toBeInTheDocument();
  });

  it('says nothing and strips nothing when the currencies disagree', () => {
    render(<SectionContent section={gridSection([['Local', 'SAR 100M'], ['Foreign', 'USD 5M']])} />);
    expect(screen.queryByText(/unless otherwise stated/)).not.toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText('SAR 100M')).toBeInTheDocument();
    expect(within(table).getByText('USD 5M')).toBeInTheDocument();
  });
});
