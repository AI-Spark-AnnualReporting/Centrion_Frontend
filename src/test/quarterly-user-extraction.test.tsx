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
import { NIL_CELL } from '@/components/quarterly/figureUnits';

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

// ─── grids ───────────────────────────────────────────────────────────────────
// A 6x5 table printed one row per CELL was 28 rows, the line name repeated five times
// and the unit twenty-eight. The screen exists so someone can check what we read
// against the workbook open beside them, so it has to read like that workbook.

function cell(
  label: string, column: string, display: string, group = '', id = `${label}-${column}`,
) {
  return {
    id, label, value: 1, value_display: display, unit: 'SAR_million',
    sheet: 'N4 Operating Segments', group: group || null, column, table: null,
  };
}

function gridPayload(rows: ReturnType<typeof cell>[], over: Partial<UserExtractionTable> = {}) {
  return payload({
    sections: [{
      section_code: 'sec_seg', title: 'N4 Operating Segments', is_custom: true, rows,
    }],
    tables: [table({
      table: 'N4 Operating Segments', section_code: 'sec_seg',
      section_title: 'N4 Operating Segments', shape: 'matrix', column_count: 5,
      rows: rows.length, currency: 'SAR', ...over,
    })],
  });
}

describe('a section the source printed as a grid', () => {
  const ROWS = [
    cell('External revenue', 'Upstream', 'SAR 170,324M'),
    cell('External revenue', 'Downstream', 'SAR 245,808M'),
    cell('External revenue', 'Corporate', 'SAR 496M'),
    cell('External revenue', 'Consolidated', 'SAR 416,628M'),
    cell('Other income related to sales', 'Upstream', 'SAR 20,009M'),
    cell('Other income related to sales', 'Downstream', 'SAR 27,988M'),
    cell('Other income related to sales', 'Corporate', 'SAR 0M'),
    cell('Other income related to sales', 'Consolidated', 'SAR 47,997M'),
  ];

  it('prints one row per line item, not one per cell', () => {
    renderScreen(gridPayload(ROWS));
    // Eight cells, two line items — and each name appears ONCE.
    expect(screen.getAllByText('External revenue')).toHaveLength(1);
    expect(screen.getAllByText('Other income related to sales')).toHaveLength(1);
  });

  it('names each category once, as a column heading', () => {
    renderScreen(gridPayload(ROWS));
    for (const c of ['Upstream', 'Downstream', 'Corporate', 'Consolidated']) {
      expect(screen.getByRole('columnheader', { name: c })).toBeInTheDocument();
    }
  });

  it('states the unit once and leaves the figures bare', () => {
    renderScreen(gridPayload(ROWS));
    // The header carries "SAR · million"; a cell carries the number alone.
    expect(screen.getByText('170,324')).toBeInTheDocument();
    expect(screen.queryByText('SAR 170,324M')).not.toBeInTheDocument();
  });

  it('prints zero as a dash, the way a filing does', () => {
    renderScreen(gridPayload(ROWS));
    // "Other income · Corporate" is 0 — four of these shouting "SAR 0M" was the noise.
    expect(screen.getAllByText(NIL_CELL).length).toBeGreaterThan(0);
    expect(screen.queryByText('SAR 0M')).not.toBeInTheDocument();
  });

  it('keeps a percentage intact — it is not the table currency', () => {
    renderScreen(gridPayload([
      cell('Average annualized capitalization rate', 'Rate', '4.7%'),
      cell('Average annualized capitalization rate', 'Total', 'SAR 452M'),
    ]));
    expect(screen.getByText('4.7%')).toBeInTheDocument();
    expect(screen.getByText('452')).toBeInTheDocument();
  });

  it('orders columns by the widest line, matching the report', () => {
    // Note 10 opens with a reconciliation filling only Total; first-appearance order
    // would put Total ahead of the segments the filing prints before it.
    renderScreen(gridPayload([
      cell('Revenue', 'Total', 'SAR 416,628M', 'Revenue reconciliation'),
      cell('Crude oil', 'Upstream', 'SAR 158,771M', 'Disaggregation'),
      cell('Crude oil', 'Downstream', 'SAR 45,776M', 'Disaggregation'),
      cell('Crude oil', 'Total', 'SAR 204,547M', 'Disaggregation'),
    ]));
    const heads = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads).toEqual(['Line item', 'Upstream', 'Downstream', 'Total']);
  });

  it('shows the subsection the source printed above a group of lines', () => {
    renderScreen(gridPayload([
      cell('Revenue', 'Total', 'SAR 416,628M', 'Revenue reconciliation'),
      cell('Crude oil', 'Total', 'SAR 204,547M', 'Disaggregation of revenue'),
    ]));
    expect(screen.getByText('Revenue reconciliation')).toBeInTheDocument();
    expect(screen.getByText('Disaggregation of revenue')).toBeInTheDocument();
  });

  it('leaves a flat section as the list it already was', () => {
    const flat = payload({
      sections: [{
        section_code: 'sec_income', title: 'Income & Comprehensive Income', is_custom: true,
        rows: [{ id: 'f1', label: 'Revenue', value: 416628, value_display: 'SAR 416,628M',
                 unit: 'SAR_million', sheet: 'Income', group: null, column: null, table: null }],
      }],
      tables: [table({ table: 'Income & Comprehensive Income', section_code: 'sec_income',
                       section_title: 'Income & Comprehensive Income', shape: 'flat' })],
    });
    renderScreen(flat);
    // No grid: the unit stays on the figure and there are no category headings.
    expect(screen.getByText('SAR 416,628M')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader')).not.toBeInTheDocument();
  });
});
