// Reading a figure's units back out of an already-formatted string.
//
// The backend formats once ("SAR 170,324M") and drops the currency/scale before the
// string reaches any renderer, so both the extraction screen and the report table
// recover them by parsing. This is that shared rule — and the half that matters most
// is when it DECLINES: a table mixing currencies must not be captioned as if it
// didn't, and a rate column must never be stripped of its %.

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { moneyParts, deriveUnits, bareFigure, unitsCaption, gridValue, NIL_CELL } from '@/components/quarterly/figureUnits';
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

  it('takes the majority denomination rather than needing unanimity', () => {
    // One foreign line no longer makes forty SAR rows go on repeating "SAR";
    // bareFigure leaves the odd cell alone, which is what the caption promises.
    expect(deriveUnits(['SAR 100M', 'SAR 5M', 'SAR 2M', 'USD 9M']))
      .toEqual({ currency: 'SAR', scale: 'M' });
  });

  it('still declines on a tie, because "mostly" would name neither', () => {
    expect(deriveUnits(['SAR 100M', 'SAR 5M', 'USD 9M', 'USD 3M'])).toBeNull();
  });

  it('declines on mixed scales even when one is the clear majority', () => {
    // bareFigure strips the scale letter with the code, so captioning this in
    // millions would print 5B as "5" — the figure wrong by a factor of a thousand.
    expect(deriveUnits(['SAR 100M', 'SAR 5M', 'SAR 2M', 'SAR 9B'])).toBeNull();
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
      .toBe('All figures in SAR millions unless otherwise stated.');
    expect(unitsCaption({ currency: 'SAR', scale: '' }))
      .toBe('All figures in SAR unless otherwise stated.');
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
    expect(screen.getByText('All figures in SAR millions unless otherwise stated.')).toBeInTheDocument();
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

// ── nil cells ────────────────────────────────────────────────────────────────
// A statement of changes in equity is mostly nil. Printed as zeros the real
// movements are buried in them; a filing prints a dash.

describe('a nil cell', () => {
  it.each(['SAR 0M', '(SAR 0M)', 'SAR 0', 'USD 0M', '0', '0.00', '(0)', ''])(
    '%s prints as a dash', (display) => {
      expect(gridValue(display, 'SAR')).toBe(NIL_CELL);
    });

  it.each(['0.0%', '0%', '0 bps'])('but a zero RATE stays: %s', (display) => {
    // Zero percent is a fact about the business; an empty equity column is not.
    expect(gridValue(display, 'SAR')).toBe(display);
  });

  it('is dashed even when the units disagreed and nothing was stripped', () => {
    expect(gridValue('SAR 0M', null)).toBe(NIL_CELL);
    expect(gridValue('SAR 100M', null)).toBe('SAR 100M');
  });

  it('leaves real figures alone', () => {
    expect(gridValue('SAR 100,603M', 'SAR')).toBe('100,603');
    expect(gridValue('(SAR 10M)', 'SAR')).toBe('(10)');
  });
});

describe('the equity grid on the report page', () => {
  it('prints no zeros at all', () => {
    render(<SectionContent section={gridSection([
      ['Share capital', 'SAR 0M'],
      ['Retained earnings', 'SAR 307,135M'],
    ])} />);
    const table = screen.getByRole('table');
    expect(within(table).queryByText('0')).not.toBeInTheDocument();
    expect(within(table).queryByText('SAR 0M')).not.toBeInTheDocument();
    expect(within(table).getByText('307,135')).toBeInTheDocument();
    expect(within(table).getAllByText(NIL_CELL).length).toBeGreaterThan(0);
  });
});

// ── Already-produced reports: the pre-_fmt_value earnings shape ──────────────
// Sections produced before the formatter change still carry "123,534 SAR_million"
// in the database, and the produce cache keys on a section's INPUTS — so they do
// not re-render on their own. These strings have to read correctly as they are.
describe('the old stored format', () => {
  it('is recognised as money so the table still gets its caption', () => {
    expect(moneyParts('123,534 SAR_million')).toEqual({ currency: 'SAR', scale: 'M' });
    expect(moneyParts('-116,185 SAR_million')).toEqual({ currency: 'SAR', scale: 'M' });
    expect(moneyParts('1.2 SAR_billion')).toEqual({ currency: 'SAR', scale: 'B' });
  });

  it('is not confused with something that merely looks similar', () => {
    expect(moneyParts('4.7%')).toBeNull();
    expect(moneyParts('55 USD/bbl')).toBeNull();
    expect(moneyParts('102 percent')).toBeNull();
  });

  it('bares the cell and turns the old minus into accounting parentheses', () => {
    expect(bareFigure('123,534 SAR_million', 'SAR')).toBe('123,534');
    expect(bareFigure('-116,185 SAR_million', 'SAR')).toBe('(116,185)');
  });

  it('leaves a genuinely foreign cell visibly foreign', () => {
    expect(bareFigure('9,000 USD_million', 'SAR')).toBe('9,000 USD_million');
  });

  it('derives one denomination across a whole legacy table', () => {
    expect(deriveUnits([
      '123,534 SAR_million', '-116,185 SAR_million', '424,095 SAR_million', '4.7%',
    ])).toEqual({ currency: 'SAR', scale: 'M' });
  });
});
