// A section keeps the shape its source printed it in.
//
// A results workbook prints segments across the top and line items down the side.
// Flattened into label/value pairs that became "External revenue — Upstream"
// repeated once per segment: the same table with its shape thrown away and three
// times the rows.

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SectionTable } from '@/components/earnings/SectionTable';

const GRID = JSON.stringify({
  title: 'Segment Performance',
  tables: [
    {
      title: 'N4 Operating Segments',
      matrix_columns: [
        { key: 'Upstream', label: 'Upstream' },
        { key: 'Downstream', label: 'Downstream' },
        { key: 'Corporate', label: 'Corporate' },
      ],
      rows: [
        { code: 'a', label: 'External revenue', cells: [
          { key: 'Upstream', display: '196,753' },
          { key: 'Downstream', display: '226,561' },
          { key: 'Corporate', display: '781' },
        ] },
        { code: 'b', label: 'Capital expenditures', cells: [
          { key: 'Upstream', display: '33,693' },
          { key: 'Corporate', display: '605' },
        ] },
      ],
    },
    {
      title: 'Other lines',
      rows: [{ code: 'c', label: 'Total revenue', current_display: '424,095 SAR_million' }],
    },
  ],
});

const FLAT = JSON.stringify({
  title: 'Financial Highlights',
  tables: [{ title: 'Financial Highlights', rows: [
    { code: 'r', label: 'Revenue', current_display: '424,095 SAR_million' },
    { code: 'n', label: 'Net income', current_display: '122,188 SAR_million' },
  ] }],
});

describe('SectionTable', () => {
  it('lays a grid out as a grid, one column per category', () => {
    render(<SectionTable content={GRID} />);

    const header = screen.getByRole('row', { name: /Line item/ });
    expect(within(header).getByText('Upstream')).toBeInTheDocument();
    expect(within(header).getByText('Downstream')).toBeInTheDocument();
    expect(within(header).getByText('Corporate')).toBeInTheDocument();

    // and the values land in the right cells
    const revenue = screen.getByRole('row', { name: /External revenue/ });
    expect(within(revenue).getByText('196,753')).toBeInTheDocument();
    expect(within(revenue).getByText('226,561')).toBeInTheDocument();
  });

  it('a category a line has no value for reads as a dash, not as missing', () => {
    render(<SectionTable content={GRID} />);
    const capex = screen.getByRole('row', { name: /Capital expenditures/ });
    // Upstream 33,693 · Downstream — · Corporate 605
    expect(within(capex).getByText('33,693')).toBeInTheDocument();
    expect(within(capex).getByText('—')).toBeInTheDocument();
    expect(within(capex).getByText('605')).toBeInTheDocument();
  });

  it('keeps loose lines out of the grid rather than merging them in', () => {
    render(<SectionTable content={GRID} />);
    expect(screen.getByText('Other lines')).toBeInTheDocument();
    const total = screen.getByRole('row', { name: /Total revenue/ });
    expect(within(total).getByText('424,095 SAR_million')).toBeInTheDocument();
  });

  it('a section with no columns is still a plain Metric/Value table', () => {
    render(<SectionTable content={FLAT} />);
    expect(screen.getByRole('columnheader', { name: 'Metric' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Value' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Line item' })).toBeNull();
    expect(screen.getByText('424,095 SAR_million')).toBeInTheDocument();
  });

  it('renders a section that prints its own named columns', () => {
    // Consensus vs Actual. Without this the row keys meant nothing to the
    // Metric/Value renderer, which found no label and no current_display and drew
    // a table of blank rows all reading "Pending".
    render(
      <SectionTable
        content={JSON.stringify({
          title: 'Consensus vs Actual',
          tables: [{
            title: 'Consensus vs Actual',
            columns: ['Line', 'Actual', 'Expected', 'Result'],
            rows: [
              { code: 'a', Line: 'Earnings per share', Actual: '2.15',
                Expected: '2.00', Result: '✓ Beat  +7.5%' },
              { code: 'b', Line: 'External revenue', Actual: '424,095',
                Expected: '—', Result: '—' },
            ],
          }],
        })}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Expected' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Result' })).toBeInTheDocument();

    const eps = screen.getByRole('row', { name: /Earnings per share/ });
    expect(within(eps).getByText('2.15')).toBeInTheDocument();
    expect(within(eps).getByText(/Beat/)).toBeInTheDocument();

    // nothing anywhere claims a row is pending
    expect(screen.queryByText('Pending')).toBeNull();
  });

});
