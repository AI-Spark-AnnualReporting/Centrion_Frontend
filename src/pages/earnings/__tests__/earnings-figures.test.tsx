// Step 3 — Figures.
//
// The screen exists because a user-metrics report's lines are the company's own
// and there is no registry to match them against. So the user says what they want
// per section and the model is asked for THAT section with those words in the
// call. The two things worth pinning are that nothing fires until they ask, and
// that their words actually travel.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const h = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number;
    constructor(status: number, message = `API ${status}`) {
      super(message);
      this.status = status;
    }
  }
  return {
    navigateMock: vi.fn(),
    getEarningsFigureSections: vi.fn(),
    searchSectionFigures: vi.fn(),
    setSectionFigures: vi.fn(),
    getEarningsSourceLines: vi.fn(),
    produceEarningsReport: vi.fn(),
    getByPollUrl: vi.fn(),
    getNodes: vi.fn(),
    MockApiError,
  };
});

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => h.navigateMock };
});
vi.mock('@/lib/api', () => ({
  earnings: {
    getEarningsFigureSections: (...a: unknown[]) => h.getEarningsFigureSections(...a),
    searchSectionFigures: (...a: unknown[]) => h.searchSectionFigures(...a),
    setSectionFigures: (...a: unknown[]) => h.setSectionFigures(...a),
    getEarningsSourceLines: (...a: unknown[]) => h.getEarningsSourceLines(...a),
    produceEarningsReport: (...a: unknown[]) => h.produceEarningsReport(...a),
  },
  agentRuns: {
    getByPollUrl: (...a: unknown[]) => h.getByPollUrl(...a),
    getNodes: (...a: unknown[]) => h.getNodes(...a),
  },
  ApiError: h.MockApiError,
}));

import EarningsFiguresPage from '../EarningsFiguresPage';

const fig = (id: string, label: string) => ({
  id, display_label: label, value: 1000, unit: 'SAR_million',
  table: 'Income', memory_key: `custom__${id}`,
});

const SECTIONS = {
  report_id: 'rep-1',
  carried_over: 0,
  sections: [
    { section_code: 's04_financial_highlights', title: 'Financial Highlights',
      prompt: null, figures: [], total: 0 },
    { section_code: 's10b_cash_flow', title: 'Cash Flow Highlights',
      prompt: null, figures: [], total: 0 },
  ],
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/earnings/rep-1/figures']}>
      <Routes>
        <Route path="/earnings/:reportId/figures" element={<EarningsFiguresPage />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  h.getEarningsFigureSections.mockResolvedValue(SECTIONS);
  h.searchSectionFigures.mockResolvedValue({
    report_id: 'rep-1', section_code: 's04_financial_highlights',
    prompt: 'margins', found: 2, total: 2,
    figures: [fig('qf_1', 'Revenue'), fig('qf_2', 'Gross margin')],
  });
  h.setSectionFigures.mockResolvedValue({
    report_id: 'rep-1', section_code: 's04_financial_highlights',
    figures: [fig('qf_1', 'Revenue')], total: 1, removed: 1,
  });
  h.getEarningsSourceLines.mockResolvedValue({
    report_id: 'rep-1', section_code: 's04_financial_highlights', selected_count: 1,
    lines: [
      { id: 'qf_1', label: 'Revenue', column: null, group: null, display_label: 'Revenue',
        value: 1000, unit: 'SAR_million', table: 'Income', source_ref: 'p.1',
        source_report_id: 'q1', selected: true, memory_key: 'custom__qf_1' },
      { id: 'qf_9', label: 'Inventories', column: null, group: null,
        display_label: 'Inventories', value: 50, unit: 'SAR_million',
        table: 'Balance Sheet', source_ref: 'p.2', source_report_id: 'q1',
        selected: false, memory_key: 'custom__qf_9' },
    ],
  });
  h.produceEarningsReport.mockResolvedValue({ run_id: 'run-1', poll_url: '/api/v1/agent_runs/run-1' });
  h.getByPollUrl.mockResolvedValue({ run_id: 'run-1', status: 'completed', error_message: null });
  h.getNodes.mockResolvedValue({ nodes: [] });
});

describe('EarningsFiguresPage', () => {
  it('opens with every section empty and no model call', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Financial Highlights' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cash Flow Highlights' })).toBeInTheDocument();
    expect(h.searchSectionFigures).not.toHaveBeenCalled();
    expect(screen.getAllByText('Tell us what belongs here')).toHaveLength(2);
  });

  it("sends the user's words for that one section", async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });

    fireEvent.change(
      screen.getByLabelText('What figures belong in Financial Highlights'),
      { target: { value: 'margins and segment revenue' } },
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Search figures' })[0]);

    await waitFor(() =>
      expect(h.searchSectionFigures).toHaveBeenCalledWith(
        'rep-1', 's04_financial_highlights', 'margins and segment revenue'));
  });

  it('shows what came back, under that section', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Search figures' })[0]);

    // Wait for the search itself to land before reading the ledger — the rows
    // are rendered by the state it sets, not by the click.
    await waitFor(() => expect(h.searchSectionFigures).toHaveBeenCalled());
    expect(await screen.findByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('Gross margin')).toBeInTheDocument();
    expect(screen.getByText('2 lines')).toBeInTheDocument();
  });

  it('searching one section leaves the others alone', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Cash Flow Highlights' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Search figures' })[0]);

    await screen.findByText('Revenue');
    expect(h.searchSectionFigures).toHaveBeenCalledTimes(1);
    // cash flow, untouched — still inviting a brief
    expect(screen.getByText('Tell us what belongs here')).toBeInTheDocument();
  });

  it('a failed search says so and keeps the section as it was', async () => {
    h.searchSectionFigures.mockRejectedValue(new h.MockApiError(500, 'Model unavailable'));
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Search figures' })[0]);

    expect(await screen.findByRole('alert')).toHaveTextContent('Model unavailable');
    expect(screen.getAllByText('Tell us what belongs here')).toHaveLength(2);
  });

  it('removing a figure saves the rest of the section', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Search figures' })[0]);
    await screen.findByText('Gross margin');

    fireEvent.click(screen.getByRole('button', { name: 'Remove Gross margin' }));
    await waitFor(() =>
      expect(h.setSectionFigures).toHaveBeenCalledWith(
        'rep-1', 's04_financial_highlights', ['qf_1']));
  });

  it('Add figure opens the picker for that section', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add figure' })[0]);

    await waitFor(() =>
      expect(h.getEarningsSourceLines).toHaveBeenCalledWith('rep-1', 's04_financial_highlights'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    // what the section already has comes up ticked, so unticking is how it goes
    expect(await screen.findByRole('checkbox', { name: 'Revenue' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Inventories' })).not.toBeChecked();
  });

  it('the picker saves the whole tick set for that section', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add figure' })[0]);
    await screen.findByRole('checkbox', { name: 'Inventories' });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Inventories' }));
    fireEvent.click(screen.getByRole('button', { name: /done/i }));

    await waitFor(() => expect(h.setSectionFigures).toHaveBeenCalledTimes(1));
    const [, code, ids] = h.setSectionFigures.mock.calls[0];
    expect(code).toBe('s04_financial_highlights');
    expect(new Set(ids as string[])).toEqual(new Set(['qf_1', 'qf_9']));
  });

  it('warns about empty sections rather than blocking Continue', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    expect(screen.getByText(/2 sections have no figures/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Continue →/ }));
    await waitFor(() => expect(h.produceEarningsReport).toHaveBeenCalledWith('rep-1'));
  });

  it('Continue produces here, and only then goes to Preview', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    fireEvent.click(screen.getByRole('button', { name: /Continue →/ }));

    expect(await screen.findByText('Composing your report')).toBeInTheDocument();
    expect(h.navigateMock).not.toHaveBeenCalled();
    await waitFor(
      () => expect(h.navigateMock).toHaveBeenCalledWith('/earnings/rep-1/preview'),
      { timeout: 3000 },
    );
  });

  it('a section that has figures offers no second search', async () => {
    // One search per section: after it lands, the brief is a record of what was
    // asked for and the section is curated by hand.
    h.getEarningsFigureSections.mockResolvedValue({
      ...SECTIONS,
      sections: [
        { section_code: 's04_financial_highlights', title: 'Financial Highlights',
          prompt: 'revenue and margins', figures: [fig('qf_1', 'Revenue')], total: 1 },
        { section_code: 's10b_cash_flow', title: 'Cash Flow Highlights',
          prompt: null, figures: [], total: 0 },
      ],
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });

    // only the empty section still offers it
    expect(screen.getAllByRole('button', { name: 'Search figures' })).toHaveLength(1);
    // and the filled one shows what was asked for, as text
    expect(screen.getByText('“revenue and margins”')).toBeInTheDocument();
    expect(
      screen.queryByLabelText('What figures belong in Financial Highlights'),
    ).toBeNull();
  });

  it('a section keeps Add figure whether or not it has any', async () => {
    h.getEarningsFigureSections.mockResolvedValue({
      ...SECTIONS,
      sections: [
        { section_code: 's04_financial_highlights', title: 'Financial Highlights',
          prompt: 'x', figures: [fig('qf_1', 'Revenue')], total: 1 },
        { section_code: 's10b_cash_flow', title: 'Cash Flow Highlights',
          prompt: null, figures: [], total: 0 },
      ],
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    // manual curation is the way back in, so it is never withdrawn
    expect(screen.getAllByRole('button', { name: 'Add figure' })).toHaveLength(2);
  });

  it('figures that have landed are not left dimmed', async () => {
    // analysis-reading means "stepping back while we think" — it belongs to the
    // wait, not to the result. Keyed off the landing it never came back up.
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Search figures' })[0]);

    const row = await screen.findByText('Revenue');
    expect(row.closest('.analysis-reading')).toBeNull();
  });

});
