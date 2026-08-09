// A governance grid's `columns` list is the server's, and the editor must hand
// it back untouched — dropping it on save would silently reorder the table (and
// lose any column no row happens to fill) the next time it renders.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditableSectionContent } from '@/components/quarterly/EditableSectionContent';
import type { ProducedSection } from '@/types/quarterly';

const grid = {
  title: 'Board meeting attendance',
  columns: ['Director', '18 Feb', '22 Apr'],
  rows: [{ Director: 'Nora Al-Qahtani', '18 Feb': '✓', '22 Apr': '✗' }],
};

const section = (content: unknown): ProducedSection => ({
  section_code: 'BR35',
  title: 'Board meeting attendance',
  display_order: 1,
  source_type: 'Co. Secretary',
  mode: 'table',
  status: 'done',
  content: JSON.stringify(content),
  feeder_status: 'ready',
});

describe('EditableSectionContent — columns round-trip', () => {
  it('edits a cell and saves the columns list unchanged, in order', () => {
    const onSave = vi.fn();
    render(
      <EditableSectionContent
        section={section(grid)}
        editing
        saving={false}
        error={null}
        onSave={onSave}
        onCancel={() => {}}
      />,
    );

    // The editor lays the grid out in the server's column order.
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent?.trim())).toEqual([
      'Director',
      '18 Feb',
      '22 Apr',
    ]);

    fireEvent.change(screen.getByDisplayValue('✗'), { target: { value: '✓' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(onSave.mock.calls[0][0] as string);
    expect(saved.columns).toEqual(['Director', '18 Feb', '22 Apr']);
    expect(saved.title).toBe('Board meeting attendance');
    expect(saved.rows[0]).toEqual({ Director: 'Nora Al-Qahtani', '18 Feb': '✓', '22 Apr': '✓' });
  });

  it('still derives its columns when the payload has none', () => {
    render(
      <EditableSectionContent
        section={section({ rows: [{ Committee: 'Audit', Members: 'F. Al-Dosari' }] })}
        editing
        saving={false}
        error={null}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent?.trim())).toEqual([
      'Committee',
      'Members',
    ]);
  });
});
