// "Units to confirm" on the user-lane Extraction step
// (plan: Centriton/.claude/plans/quarterly-unit-confirmation.md).
//
// The backend marks a figure whose unit it GUESSED. Pinned here: every question is
// shown pre-filled with the guess, bad input is explained next to the field,
// nothing is sent twice, a failed save keeps the user's choices, and the way to the
// outline stays closed until every unit is confirmed.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import UserExtractionReview from '@/components/quarterly/UserExtractionReview';
import { buildQuestionItems, choiceProblem } from '@/components/quarterly/UnitQuestions';
import type { CustomExtractionRow, CustomExtractionSection, ExtractionReviewResponse, UnitAnswer } from '@/types/quarterly';

const EPS_ROW = {
  id: 'eps', label: 'Earnings per share (basic and diluted)', value: 0.71,
  value_display: 'SAR 0.71', unit: 'SAR_per_share', sheet: 'Income',
  question: {
    reason_code: 'label',
    reason: 'We read the unit from the line’s name: “Earnings per share (basic and diluted)”.',
    guess: { kind: 'per_share' as const, currency: 'SAR' },
  },
};
const SHARES_ROW = {
  id: 'shares', label: 'Ordinary shares in issue (billions)', value: 220,
  value_display: '220 billion shares', unit: 'billion shares', sheet: 'Notes',
  question: {
    reason_code: 'label', reason: 'We read the unit from the line’s name.',
    guess: { kind: 'other' as const, text: 'billion shares' },
  },
};
const PLAIN_ROW = {
  id: 'ni', label: 'Net income', value: 159115, value_display: 'SAR 159,115M',
  unit: 'SAR_million', sheet: 'Income', question: null,
};

function sections(rows: CustomExtractionRow[] = [EPS_ROW, SHARES_ROW, PLAIN_ROW]): CustomExtractionSection[] {
  return [{ section_code: 'sec_income', title: 'Income Statement', is_custom: true, rows }];
}

function payload(over: Partial<ExtractionReviewResponse> = {}, unconfirmed = 2): ExtractionReviewResponse {
  return {
    report_id: 'r1', company_id: 'c1', run_id: null, awaiting_review: false,
    confirmed: [], pending: [], metrics_mode: 'user', period: 'Q3-2023', editable: true,
    financial_currency: 'SAR',
    sections: sections(), tables: [],
    summary: {
      confirmed_count: 3, pending_count: 0, discarded_count: 0, file_count: 1, table_count: 1,
      extracted_count: 1, skipped_count: 0, section_count: 1, assumed_count: 0,
      unconfirmed_count: unconfirmed,
    } as ExtractionReviewResponse['summary'],
    ...over,
  };
}

function renderScreen(data: ExtractionReviewResponse, onConfirmUnits?: (a: UnitAnswer[]) => Promise<void>) {
  return render(
    <MemoryRouter>
      <UserExtractionReview reportId="r1" data={data} onConfirmUnits={onConfirmUnits} />
    </MemoryRouter>,
  );
}

describe('building the questions', () => {
  it('asks one question per guessed row and none for sure rows', () => {
    const items = buildQuestionItems(sections());
    expect(items.map((i) => i.ids)).toEqual([['eps'], ['shares']]);
  });

  it('asks a scale disagreement once per table', () => {
    const conflict = (id: string) => ({
      ...PLAIN_ROW, id, table: 'Income Statement',
      question: { reason_code: 'scale_conflict', reason: 'Which is right?',
                  guess: { kind: 'money' as const, currency: 'SAR', scale: 'million' } },
    });
    const items = buildQuestionItems(sections([conflict('a'), conflict('b'), conflict('c')]));
    expect(items).toHaveLength(1);
    expect(items[0].ids).toEqual(['a', 'b', 'c']);
    expect(items[0].label).toContain('Every amount');
  });

  it('explains what is wrong with a choice', () => {
    const base = { kind: 'other' as const, currency: 'SAR', scale: 'millions', text: '' };
    expect(choiceProblem(base)).toMatch(/Type the unit/);
    expect(choiceProblem({ ...base, text: '   ' })).toMatch(/Type the unit/);
    expect(choiceProblem({ ...base, text: 'x'.repeat(31) })).toMatch(/30 characters/);
    expect(choiceProblem({ ...base, text: 'tonnes per day' })).toBeNull();
    expect(choiceProblem({ ...base, text: 'طن يوميا' })).toBeNull();
    expect(choiceProblem({ ...base, kind: 'money', currency: '' })).toMatch(/currency/);
  });
});

describe('the Units to confirm card', () => {
  it('lists each question, pre-filled with our guess', () => {
    renderScreen(payload(), vi.fn());
    expect(screen.getByRole('region', { name: 'Units to confirm' })).toBeInTheDocument();
    expect(screen.getByText('2 units to confirm')).toBeInTheDocument();
    expect((screen.getByLabelText('This figure is', { selector: '#unit-0-kind' }) as HTMLSelectElement).value)
      .toBe('per_share');
    expect((screen.getByLabelText('Unit', { selector: '#unit-1-text' }) as HTMLInputElement).value)
      .toBe('billion shares');
  });

  it('sends every answer in the endpoint shape', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    renderScreen(payload(), onConfirm);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm units' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm.mock.calls[0][0]).toEqual([
      { ids: ['eps'], kind: 'per_share', currency: 'SAR' },
      { ids: ['shares'], kind: 'other', text: 'billion shares' },
    ]);
  });

  it('refuses an empty unit and says so next to the field', () => {
    const onConfirm = vi.fn();
    renderScreen(payload(), onConfirm);
    fireEvent.change(screen.getByLabelText('Unit', { selector: '#unit-1-text' }), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm units' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(/Type the unit/)).toBeInTheDocument();
    expect(screen.getByText('Fix 1 unit first.')).toBeInTheDocument();
  });

  it('sends once on a double click', async () => {
    let finish: () => void = () => {};
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    renderScreen(payload(), onConfirm);
    const button = screen.getByRole('button', { name: 'Confirm units' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    finish();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm units' })).toBeEnabled());
  });

  it('keeps the user’s choices and shows the message when saving fails', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('The outline is locked.'));
    renderScreen(payload(), onConfirm);
    fireEvent.change(screen.getByLabelText('This figure is', { selector: '#unit-0-kind' }),
      { target: { value: 'percent' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm units' }));
    expect(await screen.findByText('The outline is locked.')).toBeInTheDocument();
    expect((screen.getByLabelText('This figure is', { selector: '#unit-0-kind' }) as HTMLSelectElement).value)
      .toBe('percent');
  });

  it('is hidden when there is nothing to confirm', () => {
    renderScreen(payload({ sections: sections([PLAIN_ROW]) }, 0), vi.fn());
    expect(screen.queryByRole('region', { name: 'Units to confirm' })).toBeNull();
  });

  it('cannot be answered once the outline is locked', () => {
    renderScreen(payload({ editable: false }), vi.fn());
    expect(screen.getByRole('button', { name: 'Confirm units' })).toBeDisabled();
    expect(screen.getByText(/units can no longer be changed/)).toBeInTheDocument();
  });
});

describe('the way to the outline', () => {
  it('stays closed while units are unconfirmed', () => {
    renderScreen(payload(), vi.fn());
    expect(screen.getByRole('button', { name: 'Continue to outline →' })).toBeDisabled();
    expect(screen.getByText('Confirm 2 units first.')).toBeInTheDocument();
  });

  it('opens once every unit is confirmed', () => {
    renderScreen(payload({ sections: sections([PLAIN_ROW]) }, 0), vi.fn());
    expect(screen.getByRole('button', { name: 'Continue to outline →' })).toBeEnabled();
  });
});

describe('the section header', () => {
  it('says when some lines carry their own unit', () => {
    const data = payload({
      sections: sections([{ ...PLAIN_ROW }, { ...SHARES_ROW, question: null, unit_raw: 'billion shares' }]),
      tables: [{
        file: 'x.xlsx', table: 'Income Statement', status: 'extracted', reason: null, rows: 2,
        section_code: 'sec_income', section_title: 'Income Statement', currency: 'SAR', scale: 'million',
        header_row: 0, label_col: 0, value_col: 1, value_col_header: 'SAR millions',
        period_source: 'declared', grouped_with: [],
      }],
    }, 0);
    renderScreen(data, vi.fn());
    expect(screen.getByText('SAR · million · 1 with their own unit')).toBeInTheDocument();
  });
});
