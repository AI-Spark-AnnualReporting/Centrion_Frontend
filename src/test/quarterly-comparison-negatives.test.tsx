// Hand-editing a figure in a comparison table, when the figures are negative.
//
// Filed statements write negatives in accounting parentheses — (49,593) is -49593 —
// and the backend formatter emits them, so a cash-flow or expense table is mostly
// parenthesised. Two things used to break on exactly those rows: the display parser
// didn't unwrap the parens (so the change column silently blanked the moment you
// edited anything), and the recompute divided by a SIGNED prior (so the sign flipped
// and a cost that grew read as a fall).
//
// Reference case: Aramco Q3-2024 vs Q3-2023 capital expenditures, (41,354) → (49,593).

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditableSectionContent } from '@/components/quarterly/EditableSectionContent';
import type { ProducedSection } from '@/types/quarterly';

type Row = Record<string, unknown>;

function sectionWith(rows: Row[]): ProducedSection {
  return {
    section_code: 'c_test_cash_flows',
    title: 'Cash Flows',
    display_order: 1,
    source_type: 'financial',
    mode: 'table',
    status: 'produced',
    feeder_status: 'ready',
    content: JSON.stringify({ title: 'Cash Flows', rows }),
  } as ProducedSection;
}

function row(label: string, current: string, prior: string, pct: number | null): Row {
  return {
    label,
    current_display: current,
    prior_display: prior,
    change_pct: pct,
    change_direction: pct == null ? null : pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat',
  };
}

/** Render in edit mode, retype one cell, save, and hand back the row that changed. */
function editAndSave(rows: Row[], cellValue: string, typed: string, rowIndex = 0): Row {
  const onSave = vi.fn();
  render(
    <EditableSectionContent
      section={sectionWith(rows)}
      editing
      saving={false}
      error={null}
      onSave={onSave}
      onCancel={() => {}}
    />,
  );
  fireEvent.change(screen.getByDisplayValue(cellValue), { target: { value: typed } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(onSave).toHaveBeenCalledOnce();
  return JSON.parse(onSave.mock.calls[0][0]).rows[rowIndex];
}

describe('recomputing the change % on an edited comparison row', () => {
  it('reads accounting parentheses instead of blanking the change', () => {
    // Both figures parenthesised — the case that used to null out entirely.
    const saved = editAndSave(
      [row('Capital expenditures', '(SAR 48,000M)', '(SAR 41,354M)', -16.1)],
      '(SAR 48,000M)',
      '(SAR 49,593M)',
    );
    expect(saved.change_pct).not.toBeNull();
    expect(saved.change_pct).toBe(-19.9);
  });

  it('a figure falling further below zero reads as a fall, not a rise', () => {
    // Capex spend GREW. The signed figure fell 19.9%. Dividing by the signed
    // prior would have printed +19.9 and a green ▲.
    const saved = editAndSave(
      [row('Capital expenditures', '(SAR 48,000M)', '(SAR 41,354M)', -16.1)],
      '(SAR 48,000M)',
      '(SAR 49,593M)',
    );
    expect(saved.change_pct).toBe(-19.9);
    expect(saved.change_direction).toBe('down');
  });

  it('a figure rising toward zero reads as a rise', () => {
    // Income taxes and zakat (116,185) → (91,750): a shrinking charge.
    const saved = editAndSave(
      [row('Income taxes and zakat', '(SAR 90,000M)', '(SAR 116,185M)', -22.5)],
      '(SAR 90,000M)',
      '(SAR 91,750M)',
    );
    expect(saved.change_pct).toBe(21.0);
    expect(saved.change_direction).toBe('up');
  });

  it('handles a negative prior crossing up through zero', () => {
    const saved = editAndSave(
      [row('Trade receivables', 'SAR 5,000M', '(SAR 26,326M)', 119.0)],
      'SAR 5,000M',
      'SAR 5,191M',
    );
    expect(saved.change_pct).toBe(119.7);
    expect(saved.change_direction).toBe('up');
  });

  it('accepts parentheses typed by hand, the way they are typed into a spreadsheet', () => {
    const saved = editAndSave(
      [row('Movement between provisional and final prices', 'SAR 2,000M', 'SAR 4,386M', -54.4)],
      'SAR 2,000M',
      '(1,755M)',
    );
    expect(saved.change_pct).toBe(-140.0);
    expect(saved.change_direction).toBe('down');
  });

  it('leaves an all-positive row exactly as it was', () => {
    // The abs() must be a no-op wherever the prior is already positive.
    const saved = editAndSave(
      [row('Revenue', 'SAR 400,000M', 'SAR 424,095M', -5.7)],
      'SAR 400,000M',
      'SAR 416,628M',
    );
    expect(saved.change_pct).toBe(-1.8);
    expect(saved.change_direction).toBe('down');
  });

  it('edits the prior side too', () => {
    const saved = editAndSave(
      [row('Capital expenditures', '(SAR 49,593M)', '(SAR 40,000M)', -24.0)],
      '(SAR 40,000M)',
      '(SAR 41,354M)',
    );
    expect(saved.change_pct).toBe(-19.9);
  });

  it('clears the change when a cell is emptied rather than inventing one', () => {
    const saved = editAndSave(
      [row('Capital expenditures', '(SAR 49,593M)', '(SAR 41,354M)', -19.9)],
      '(SAR 49,593M)',
      '',
    );
    expect(saved.change_pct).toBeNull();
    expect(saved.change_direction).toBeNull();
  });
});
