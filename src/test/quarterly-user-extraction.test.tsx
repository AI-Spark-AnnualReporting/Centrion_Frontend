// User-metrics extraction screen.
//
// The point of this screen is the half the other lanes don't have: a table that
// produced NOTHING. In this lane that is a missing section, and before the screen
// existed the only symptom was an outline reading "Awaiting financial data" with no
// cause anywhere. So what is pinned here is that a skipped table is visible, says
// why, and cannot be confused with one that worked.

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import UserExtractionReview from '@/components/quarterly/UserExtractionReview';
import type { ExtractionReviewResponse, UserExtractionTable } from '@/types/quarterly';

function table(over: Partial<UserExtractionTable> = {}): UserExtractionTable {
  return {
    file: '01_Aramco_Q3_2023_Income_Statement.xlsx',
    table: 'Income & Comprehensive Income',
    status: 'extracted',
    reason: null,
    rows: 35,
    section_code: 'sec_income',
    section_title: 'Income & Comprehensive Income',
    currency: 'SAR',
    scale: 'million',
    header_row: 5,
    label_col: 0,
    value_col: 2,
    value_col_header: 'SAR millions',
    period_source: 'declared',
    grouped_with: [],
    ...over,
  };
}

function payload(over: Partial<ExtractionReviewResponse> = {}): ExtractionReviewResponse {
  return {
    report_id: 'r1',
    company_id: 'c1',
    run_id: null,
    awaiting_review: false,
    confirmed: [],
    pending: [],
    metrics_mode: 'user',
    period: 'Q3-2023',
    editable: true,
    sections: [
      {
        section_code: 'sec_income',
        title: 'Income & Comprehensive Income',
        is_custom: true,
        rows: [
          { id: 'f1', label: 'Revenue', value: 424095, value_display: 'SAR 424,095', unit: 'SAR_million', sheet: 'Income & Comprehensive Income' },
          { id: 'f2', label: 'Net income', value: 122188, value_display: 'SAR 122,188', unit: 'SAR_million', sheet: 'Income & Comprehensive Income' },
        ],
      },
    ],
    tables: [table()],
    summary: {
      confirmed_count: 2, pending_count: 0, discarded_count: 0,
      file_count: 1, table_count: 1, extracted_count: 1,
      skipped_count: 0, section_count: 1, assumed_count: 0,
    } as ExtractionReviewResponse['summary'],
    ...over,
  };
}

function renderScreen(data: ExtractionReviewResponse) {
  return render(
    <MemoryRouter>
      <UserExtractionReview reportId="r1" data={data} />
    </MemoryRouter>,
  );
}

describe('user-metrics extraction screen', () => {
  it('shows each section, its lines, and which table they were read from', () => {
    renderScreen(payload());

    expect(screen.getByText('What we read from your files')).toBeInTheDocument();
    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('SAR 424,095')).toBeInTheDocument();
    // The quarter we looked for is the screen's headline question.
    expect(screen.getByText('Q3-2023')).toBeInTheDocument();
    // How we read it — the line a developer needs to trust the number.
    expect(screen.getByText(/header row 5/)).toBeInTheDocument();
    expect(screen.getByText(/SAR millions/)).toBeInTheDocument();
  });

  it('names a skipped table and the reason, since that is a section that will not exist', () => {
    const skipped = table({
      file: '04_Aramco_Q3_2023_Changes_in_Equity.xlsx',
      table: 'Changes in Equity',
      status: 'skipped',
      reason: 'the column we would use for line names looks like numbers, not names',
      rows: 0,
      section_code: null,
      section_title: null,
    });
    renderScreen(payload({
      tables: [table(), skipped],
      summary: { ...payload().summary, skipped_count: 1, table_count: 2 } as ExtractionReviewResponse['summary'],
    }));

    const panel = screen.getByText(/Not used/).closest('div')!.parentElement!;
    expect(within(panel).getByText('Changes in Equity')).toBeInTheDocument();
    expect(within(panel).getByText(/looks like numbers/)).toBeInTheDocument();
  });

  it('says so plainly when nothing at all was read', () => {
    renderScreen(payload({
      sections: [],
      tables: [table({ status: 'skipped', reason: 'its columns name other periods, not Q3-2023', rows: 0 })],
      summary: { confirmed_count: 0, pending_count: 0, discarded_count: 0, file_count: 1,
                 table_count: 1, extracted_count: 0, skipped_count: 1, section_count: 0,
                 assumed_count: 0 } as ExtractionReviewResponse['summary'],
    }));

    // Said twice on purpose — once at the top as the headline, once beside Continue,
    // because continuing anyway is a real choice and it should not be a silent one.
    expect(screen.getAllByText(/no financial sections/)).toHaveLength(2);
    expect(screen.getByText(/not Q3-2023/)).toBeInTheDocument();
  });

  it('marks a section whose quarter was assumed rather than named', () => {
    renderScreen(payload({ tables: [table({ period_source: 'assumed' })] }));
    expect(screen.getByText(/nothing named a period/)).toBeInTheDocument();
  });

  it('shows when several tables were merged into one section', () => {
    const a = table({ table: 'Revenue by region', grouped_with: ['Revenue by product'] });
    const b = table({ file: '02.xlsx', table: 'Revenue by product', grouped_with: ['Revenue by region'] });
    renderScreen(payload({ tables: [a, b] }));

    expect(screen.getByText('2 tables merged')).toBeInTheDocument();
    expect(screen.getByText('Revenue by region')).toBeInTheDocument();
    expect(screen.getByText('Revenue by product')).toBeInTheDocument();
  });

  it('caps a long section and expands on request', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      id: `f${i}`, label: `Line ${i}`, value: i, value_display: `SAR ${i}`,
      unit: 'SAR_million', sheet: 'Income & Comprehensive Income',
    }));
    const data = payload();
    data.sections![0].rows = rows;
    renderScreen(data);

    expect(screen.queryByText('Line 19')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Show all 20 lines'));
    expect(screen.getByText('Line 19')).toBeInTheDocument();
  });
});
