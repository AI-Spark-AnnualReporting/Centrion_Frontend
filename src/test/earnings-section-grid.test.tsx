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
    // Bare: the currency is stated once above the table now, and the old stored
    // "424,095 SAR_million" is recognised and stripped the same as a fresh one.
    expect(within(total).getByText('424,095')).toBeInTheDocument();
  });

  it('a section with no columns is still a plain Metric/Value table', () => {
    render(<SectionTable content={FLAT} />);
    expect(screen.getByRole('columnheader', { name: 'Metric' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Value' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Line item' })).toBeNull();
    expect(screen.getByText('424,095')).toBeInTheDocument();
    expect(
      screen.getByText('All figures in SAR millions unless otherwise stated.'),
    ).toBeInTheDocument();
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

// The third table shape: its own named columns, rows keyed BY those names.
// Consensus vs Actual. Covered late — the flat and matrix shapes were fixed first
// and this one returns early in the renderer, so it went on printing the token.
describe('SectionTable — a table with its own named columns', () => {
  const CONSENSUS = JSON.stringify({
    title: 'Consensus vs Actual',
    tables: [{
      title: 'Consensus vs Actual',
      columns: ['Line', 'Actual', 'Expected', 'Result'],
      rows: [
        { code: 'a', Line: 'Revenue from sales', Actual: '424 SAR_million', Expected: '—', Result: '—' },
        { code: 'b', Line: 'Revenue', Actual: '424,095 SAR_million', Expected: '—', Result: '—' },
      ],
    }],
  });

  it('states the currency once and bares the cells', () => {
    render(<SectionTable content={CONSENSUS} />);
    expect(
      screen.getByText('All figures in SAR millions unless otherwise stated.'),
    ).toBeInTheDocument();
    expect(screen.getByText('424,095')).toBeInTheDocument();
    expect(screen.queryByText(/SAR_million/)).toBeNull();
  });

  it('leaves a table of text columns exactly as it was', () => {
    // The board's governance tables share this shape but hold no money — nothing
    // matches, so no caption is claimed and no cell is touched.
    render(<SectionTable content={JSON.stringify({
      title: 'Board Attendance',
      tables: [{
        title: 'Board Attendance',
        columns: ['Name', 'Role', 'Attended'],
        rows: [{ code: 'a', Name: 'A. Rahman', Role: 'Chair', Attended: '4 of 4' }],
      }],
    })} />);
    expect(screen.queryByText(/unless otherwise stated/)).toBeNull();
    expect(screen.getByText('Chair')).toBeInTheDocument();
    expect(screen.getByText('4 of 4')).toBeInTheDocument();
  });
});

// The catch-all, after this leak was found three separate times in three
// different render paths. All three table shapes, one assertion.
describe('SectionTable — no storage token survives any shape', () => {
  it.each([
    ['flat', JSON.stringify({ title: 'T', tables: [{ title: 'T', rows: [
      { code: 'a', label: 'Revenue', current_display: '424,095 SAR_million' }] }] })],
    ['named columns', JSON.stringify({ title: 'T', tables: [{ title: 'T',
      columns: ['Line', 'Actual'],
      rows: [{ code: 'a', Line: 'Revenue', Actual: '424,095 SAR_million' }] }] })],
    ['matrix', JSON.stringify({ title: 'T', tables: [{ title: 'T',
      matrix_columns: [{ key: 'Upstream', label: 'Upstream' }],
      rows: [{ code: 'a', label: 'External revenue',
               cells: [{ key: 'Upstream', display: '424,095 SAR_million' }] }] }] })],
  ])('%s', (_shape, content) => {
    const { container } = render(<SectionTable content={content} />);
    expect(container.textContent).not.toMatch(/SAR_million/);
    expect(container.textContent).toContain('424,095');
    expect(container.textContent).toMatch(/unless otherwise stated/);
  });
});

// s06_operational_kpis produces a row per registry KPI whether or not one can
// ever exist. Six are bank measures (NPL ratio, CASA ratio, customer deposits) on
// a company that is not a bank; four are metrics the extractor has no catalogue
// entry for. Each printed its own gap reason as its value, so the finished report
// carried a line reading "NPL ratio: sector_excluded".
describe('SectionTable — rows that can never carry a figure', () => {
  const KPIS = JSON.stringify({
    title: 'Operational Highlights / KPIs',
    tables: [{ title: 'Operational Highlights / KPIs', rows: [
      { code: 'production_volume', label: 'Production / sales volume', gap_reason: 'not_in_catalog' },
      { code: 'npl_ratio', label: 'NPL ratio', gap_reason: 'sector_excluded' },
      { code: 'throughput', label: 'Refinery throughput', gap_reason: 'not_resolved' },
      { code: 'solar', label: 'Solar capacity', current_display: '5.5' },
    ] }],
  });

  it('the finished report leaves them out', () => {
    const { container } = render(<SectionTable content={KPIS} deliverable />);
    expect(container.textContent).not.toMatch(/NPL ratio/);
    expect(container.textContent).not.toMatch(/Production \/ sales volume/);
    expect(container.textContent).not.toMatch(/sector_excluded|not_in_catalog/);
  });

  it('a genuine gap this period still shows — it is information', () => {
    // not_resolved means the line WAS expected and the figure did not arrive.
    const { container } = render(<SectionTable content={KPIS} deliverable />);
    expect(container.textContent).toContain('Refinery throughput');
    expect(container.textContent).toContain('Solar capacity');
  });

  it('the workbench still shows everything, so the gaps stay visible while curating', () => {
    const { container } = render(<SectionTable content={KPIS} />);
    expect(container.textContent).toContain('NPL ratio');
    expect(container.textContent).toContain('Production / sales volume');
  });
});
