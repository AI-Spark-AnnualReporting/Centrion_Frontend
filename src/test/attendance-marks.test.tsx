// The attendance matrix prints marks, not "Present"/"Absent" — a grid of words
// is the widest thing on the page and reads as a wall of text. The word the
// minutes actually used stays on the row's `_full` key and belongs on hover, so
// drawing a cross never loses an "Apologies".

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SectionContent } from '@/components/quarterly/SectionContent';
import type { ProducedSection } from '@/types/quarterly';

const section = (content: unknown): ProducedSection => ({
  section_code: 'BR35',
  title: 'Board & committee meeting attendance',
  display_order: 1,
  source_type: 'Co. Secretary',
  mode: 'table',
  status: 'done',
  content: JSON.stringify(content),
  feeder_status: 'ready',
});

const grid = {
  title: 'Attendance',
  columns: ['Member', 'Board meeting (30 Jul 2026)', 'Attended'],
  rows: [
    {
      Member: 'Aizaz',
      'Board meeting (30 Jul 2026)': '✓',
      'board_meeting_(30_jul_2026)_full': 'Present',
      Attended: '1 of 1',
    },
    {
      Member: 'Usama',
      'Board meeting (30 Jul 2026)': '✗',
      'board_meeting_(30_jul_2026)_full': 'Apologies',
      Attended: '0 of 1',
    },
    {
      Member: 'Ahsan',
      'Board meeting (30 Jul 2026)': '—',
      Attended: '—',
    },
  ],
};

describe('attendance marks', () => {
  it('prints the marks rather than the words', () => {
    render(<SectionContent section={section(grid)} />);
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.getByText('✗')).toBeInTheDocument();
    // The words would otherwise win: the cell prefers `_full` when a row has one.
    expect(screen.queryByText('Present')).not.toBeInTheDocument();
    expect(screen.queryByText('Apologies')).not.toBeInTheDocument();
  });

  it('colours the tick green and the cross red', () => {
    render(<SectionContent section={section(grid)} />);
    expect(screen.getByText('✓')).toHaveStyle({ color: '#10B981' });
    expect(screen.getByText('✗')).toHaveStyle({ color: '#EF4444' });
  });

  it('keeps the word the minutes used on hover', () => {
    render(<SectionContent section={section(grid)} />);
    expect(screen.getByText('✓')).toHaveAttribute('title', 'Present');
    expect(screen.getByText('✗')).toHaveAttribute('title', 'Apologies');
  });

  it('leaves the em dash uncoloured — no minutes filed is not an absence', () => {
    render(<SectionContent section={section(grid)} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
    dashes.forEach((d) => expect(d.tagName).not.toBe('SPAN'));
  });
});
