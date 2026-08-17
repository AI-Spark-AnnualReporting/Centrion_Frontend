// Rendering a section's tables.
//
// Two shapes reach this component from the user-metrics lane. A note schedule is a
// GRID — line items down the side, categories across the top — and a sheet can stack
// several tables of different shapes, so a section carries `tables` rather than one row
// list. Everything else still carries `rows`, and has to render exactly as it did.

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SectionContent } from '@/components/quarterly/SectionContent';
import type { ProducedSection } from '@/types/quarterly';

function renderContent(content: unknown) {
  const section = {
    section_code: 's', title: 'S', display_order: 1, source_type: 'Extraction',
    mode: 'table', status: 'produced', content: JSON.stringify(content),
    feeder_status: 'ready',
  } as unknown as ProducedSection;
  return render(<SectionContent section={section} />);
}

describe('section tables', () => {
  it('renders a matrix as a grid with a column per category', () => {
    renderContent({
      title: 'PP&E',
      matrix_columns: [{ key: 'Land', label: 'Land' }, { key: 'Buildings', label: 'Buildings' }],
      rows: [
        { label: 'Cost', role: 'header' },
        {
          label: 'Opening balance', role: 'line', current_display: '55,911',
          cells: [{ key: 'Land', display: '55,911' }, { key: 'Buildings', display: '91,617' }],
        },
      ],
    });

    // One header per category, and no "Current" column — every column IS a category.
    expect(screen.getByRole('columnheader', { name: 'Land' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Buildings' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Current' })).not.toBeInTheDocument();
    expect(screen.getByText('55,911')).toBeInTheDocument();
    expect(screen.getByText('91,617')).toBeInTheDocument();
    // The banner still spans the row.
    expect(screen.getByText('Cost')).toBeInTheDocument();
  });

  it('renders each table of a stacked sheet, keeping its own columns', () => {
    renderContent({
      title: 'N5 PP&E',
      tables: [
        {
          title: 'N5 Property Plant Equipment',
          matrix_columns: [{ key: 'Land', label: 'Land' }],
          rows: [{
            label: 'Opening balance', current_display: '55,911',
            cells: [{ key: 'Land', display: '55,911' }],
          }],
        },
        {
          title: 'Right-of-use assets included above',
          rows: [{ label: 'Total right-of-use assets', current_display: '57,688' }],
        },
      ],
    });

    expect(screen.getByText('N5 Property Plant Equipment')).toBeInTheDocument();
    expect(screen.getByText('Right-of-use assets included above')).toBeInTheDocument();
    // The grid keeps its category column; the plain list keeps the ordinary one. Before
    // this, the tables branch dropped matrix_columns and the grid lost its categories.
    expect(screen.getByRole('columnheader', { name: 'Land' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Current' })).toBeInTheDocument();
    expect(screen.getByText('57,688')).toBeInTheDocument();
  });

  it('leaves an ordinary single-table section alone', () => {
    renderContent({
      title: 'Income Statement',
      rows: [{ label: 'Revenue', current_display: 'SAR 424,095' }],
    });

    const table = screen.getByRole('table');
    expect(within(table).getByText('Revenue')).toBeInTheDocument();
    expect(within(table).getByText('SAR 424,095')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Current' })).toBeInTheDocument();
  });
});
