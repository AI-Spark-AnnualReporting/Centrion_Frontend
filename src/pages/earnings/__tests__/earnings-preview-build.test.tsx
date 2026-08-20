// Step 3 — Preview, where the report gets built.
//
// Every section in a rail, one in the pane. Financial sections are told what
// belongs in them in the user's own words; narrative sections show their prose,
// and the ones written FROM the figures show what they are still waiting on.
//
// The rule the whole screen is held to: it must never dead-end. A section that
// cannot run yet says which sections are empty and links to each; Run stays
// clickable regardless; a run that comes back empty is a reason, not an error.

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
    getEarningsSections: vi.fn(),
    runEarningsSection: vi.fn(),
    patchEarningsSectionContent: vi.fn(),
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
    getEarningsSections: (...a: unknown[]) => h.getEarningsSections(...a),
    runEarningsSection: (...a: unknown[]) => h.runEarningsSection(...a),
    patchEarningsSectionContent: (...a: unknown[]) => h.patchEarningsSectionContent(...a),
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

import EarningsPreviewPage from '../EarningsPreviewPage';

const fig = (id: string, label: string, group: string | null = null) => ({
  id, display_label: label, value: 1000, unit: 'SAR_million',
  table: 'Income', group, memory_key: `custom__${id}`,
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
    <MemoryRouter initialEntries={['/earnings/rep-1/preview']}>
      <Routes>
        <Route path="/earnings/:reportId/preview" element={<EarningsPreviewPage />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  h.getEarningsFigureSections.mockResolvedValue(SECTIONS);
  h.getEarningsSections.mockResolvedValue({ sections: [] });
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

describe('EarningsPreviewPage', () => {
  it('opens on the first section, with every section in the rail and no model call', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Financial Highlights' })).toBeInTheDocument();
    // one pane at a time; the rail is how you reach the rest
    expect(screen.queryByRole('heading', { name: 'Cash Flow Highlights' })).toBeNull();
    expect(screen.getByRole('button', { name: /Cash Flow Highlights/ })).toBeInTheDocument();
    expect(h.searchSectionFigures).not.toHaveBeenCalled();
  });

  it('the rail switches which section fills the pane', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    fireEvent.click(screen.getByRole('button', { name: /Cash Flow Highlights/ }));
    expect(await screen.findByRole('heading', { name: 'Cash Flow Highlights' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Financial Highlights' })).toBeNull();
  });

  it("sends the user's words for that one section", async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });

    fireEvent.change(
      screen.getByLabelText('What figures belong in Financial Highlights'),
      { target: { value: 'margins and segment revenue' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Search figures' }));

    await waitFor(() =>
      expect(h.searchSectionFigures).toHaveBeenCalledWith(
        'rep-1', 's04_financial_highlights', 'margins and segment revenue'));
  });

  it('shows what came back, under that section', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    fireEvent.click(screen.getByRole('button', { name: 'Search figures' }));

    // Wait for the search itself to land before reading the ledger — the rows
    // are rendered by the state it sets, not by the click.
    await waitFor(() => expect(h.searchSectionFigures).toHaveBeenCalled());
    expect(await screen.findByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('Gross margin')).toBeInTheDocument();
    expect(screen.getByText('2 lines')).toBeInTheDocument();
  });

  it('searching one section leaves the others alone', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    fireEvent.click(screen.getByRole('button', { name: 'Search figures' }));

    await screen.findByText('Revenue');
    expect(h.searchSectionFigures).toHaveBeenCalledTimes(1);
    // cash flow, untouched — still showing no figures in the rail
    fireEvent.click(screen.getByRole('button', { name: /Cash Flow Highlights/ }));
    expect(await screen.findByText('Tell us what belongs here')).toBeInTheDocument();
  });

  it('a failed search says so and keeps the section as it was', async () => {
    h.searchSectionFigures.mockRejectedValue(new h.MockApiError(500, 'Model unavailable'));
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    fireEvent.click(screen.getByRole('button', { name: 'Search figures' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Model unavailable');
    expect(screen.getByText('Tell us what belongs here')).toBeInTheDocument();
  });

  it('removing a figure saves the rest of the section', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    fireEvent.click(screen.getByRole('button', { name: 'Search figures' }));
    await screen.findByText('Gross margin');

    fireEvent.click(screen.getByRole('button', { name: 'Remove Gross margin' }));
    await waitFor(() =>
      expect(h.setSectionFigures).toHaveBeenCalledWith(
        'rep-1', 's04_financial_highlights', ['qf_1']));
  });

  it('Add figure opens the picker for that section', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    fireEvent.click(screen.getByRole('button', { name: 'Add figure' }));

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
    fireEvent.click(screen.getByRole('button', { name: 'Add figure' }));
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
      () => expect(h.navigateMock).toHaveBeenCalledWith('/earnings/rep-1/report'),
      { timeout: 3000 },
    );
  });

  const FILLED = {
    ...SECTIONS,
    sections: [
      { section_code: 's04_financial_highlights', title: 'Financial Highlights',
        prompt: 'revenue and margins', figures: [fig('qf_1', 'Revenue')], total: 1 },
      { section_code: 's10b_cash_flow', title: 'Cash Flow Highlights',
        prompt: null, figures: [], total: 0 },
    ],
  };

  it('quotes the brief of a section that has figures, until you ask again', async () => {
    h.getEarningsFigureSections.mockResolvedValue(FILLED);
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });

    // quoted, not an input, and no way to search it again
    expect(screen.getByText('“revenue and margins”')).toBeInTheDocument();
    expect(
      screen.queryByLabelText('What figures belong in Financial Highlights'),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Search figures' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Ask again' }));

    // reopened with what was asked last time, ready to be changed
    const box = await screen.findByLabelText('What figures belong in Financial Highlights');
    expect(box).toHaveValue('revenue and margins');
    expect(screen.getByRole('button', { name: 'Search figures' })).toBeInTheDocument();
  });

  it('a second ask sends the new words and reports what it added', async () => {
    h.getEarningsFigureSections.mockResolvedValue(FILLED);
    h.searchSectionFigures.mockResolvedValue({
      report_id: 'rep-1', section_code: 's04_financial_highlights',
      prompt: 'and the segment splits', found: 2, total: 3,
      figures: [fig('qf_1', 'Revenue'), fig('qf_4', 'Upstream'), fig('qf_5', 'Downstream')],
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    fireEvent.click(screen.getByRole('button', { name: 'Ask again' }));

    const box = await screen.findByLabelText('What figures belong in Financial Highlights');
    fireEvent.change(box, { target: { value: 'and the segment splits' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search figures' }));

    await waitFor(() =>
      expect(h.searchSectionFigures).toHaveBeenCalledWith(
        'rep-1', 's04_financial_highlights', 'and the segment splits'));
    // the one it already had is still there, with the two new ones
    expect(await screen.findByText('Upstream')).toBeInTheDocument();
    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(await screen.findByText('Added 2 more.')).toBeInTheDocument();
  });

  it('an ask that finds nothing new says so rather than looking broken', async () => {
    h.getEarningsFigureSections.mockResolvedValue(FILLED);
    h.searchSectionFigures.mockResolvedValue({
      report_id: 'rep-1', section_code: 's04_financial_highlights',
      prompt: 'x', found: 0, total: 1, figures: [fig('qf_1', 'Revenue')],
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    fireEvent.click(screen.getByRole('button', { name: 'Ask again' }));
    await screen.findByLabelText('What figures belong in Financial Highlights');
    fireEvent.click(screen.getByRole('button', { name: 'Search figures' }));

    expect(await screen.findByText(/Nothing new for those words/)).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Add figure' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Cash Flow Highlights/ }));
    expect(await screen.findByRole('button', { name: 'Add figure' })).toBeInTheDocument();
  });

  it('figures that have landed are not left dimmed', async () => {
    // analysis-reading means "stepping back while we think" — it belongs to the
    // wait, not to the result. Keyed off the landing it never came back up.
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    fireEvent.click(screen.getByRole('button', { name: 'Search figures' }));

    const row = await screen.findByText('Revenue');
    expect(row.closest('.analysis-reading')).toBeNull();
  });

  it('tells apart two rows that read the same, and stays quiet otherwise', async () => {
    // "Free cash flow" is three different figures in one report. The label alone
    // cannot say which; the group it sits under can.
    h.getEarningsFigureSections.mockResolvedValue({
      ...SECTIONS,
      sections: [
        { section_code: 's10b_cash_flow', title: 'Cash Flow Highlights', prompt: 'cash',
          total: 3, figures: [
            fig('qf_1', 'Free cash flow', 'MEMORANDUM (non-IFRS)'),
            fig('qf_2', 'Free cash flow', '9. HEADLINE METRICS'),
            fig('qf_3', 'Capital expenditures', 'INVESTING ACTIVITIES'),
          ] },
      ],
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Cash Flow Highlights' });

    expect(screen.getAllByText('Free cash flow')).toHaveLength(2);
    expect(screen.getByText('MEMORANDUM (non-IFRS)')).toBeInTheDocument();
    expect(screen.getByText('9. HEADLINE METRICS')).toBeInTheDocument();
    // the unique label does not need it, so it does not get it
    expect(screen.queryByText('INVESTING ACTIVITIES')).toBeNull();
  });

  it('shows only the sections the backend says are in the report', async () => {
    // The screen does NOT filter — it renders what it is given. Step 3 having its
    // own idea of the section set is exactly the bug: it used to offer all nine
    // whatever the Outline said, so 83 figures went into sections that were not in
    // the report and Preview showed none of them.
    h.getEarningsFigureSections.mockResolvedValue({
      ...SECTIONS,
      sections: [
        { section_code: 's04_financial_highlights', title: 'Financial Highlights',
          prompt: null, figures: [], total: 0 },
      ],
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    expect(screen.queryByRole('heading', { name: 'Cash Flow Highlights' })).toBeNull();
  });

  it('a report with no figure sections says so, and offers the way back', async () => {
    h.getEarningsFigureSections.mockResolvedValue({ ...SECTIONS, sections: [] });
    renderPage();

    expect(await screen.findByText('No sections to fill in')).toBeInTheDocument();
    // not a spinner, not an error — a choice, with a door
    fireEvent.click(screen.getByRole('button', { name: 'Choose sections' }));
    expect(h.navigateMock).toHaveBeenCalledWith('/earnings/rep-1/outline');
  });

  it('offers a way back to add a section', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    fireEvent.click(screen.getByRole('button', { name: '+ Add a section' }));
    expect(h.navigateMock).toHaveBeenCalledWith('/earnings/rep-1/outline');
  });

  // ── The narrative half ──────────────────────────────────────────────────────

  const NARRATIVE = [
    { section_code: 's05_management_commentary', title: 'CEO Commentary', mode: 'quote',
      source_type: 'Release', status: 'produced', included: true,
      content: JSON.stringify({ quote: 'Our results reinforce our ability to deliver.',
                                attribution: 'Amin H. Nasser, President and CEO' }) },
    { section_code: 's03_exec_summary', title: 'Executive Summary', mode: 'generate',
      source_type: 'Hybrid', status: 'pending', included: true, content: null },
  ];

  it('lists narrative sections beside the financial ones', async () => {
    h.getEarningsSections.mockResolvedValue({ sections: NARRATIVE });
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });

    // the whole report is reachable from one rail
    expect(screen.getByRole('button', { name: /CEO Commentary/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Executive Summary/ })).toBeInTheDocument();
  });

  it('shows a produced narrative section, with a way to run it again', async () => {
    h.getEarningsSections.mockResolvedValue({ sections: NARRATIVE });
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    fireEvent.click(screen.getByRole('button', { name: /CEO Commentary/ }));

    expect(await screen.findByText(/reinforce our ability to deliver/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeInTheDocument();
  });

  it('an un-run section names what it is waiting on, and links to it', async () => {
    h.getEarningsSections.mockResolvedValue({ sections: NARRATIVE });
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    fireEvent.click(screen.getByRole('button', { name: /Executive Summary/ }));

    expect(await screen.findByText(/2 sections still have no figures/)).toBeInTheDocument();
    // each one is a door, not a scolding
    const jump = screen.getByRole('button', { name: 'Cash Flow Highlights →' });
    fireEvent.click(jump);
    expect(await screen.findByRole('heading', { name: 'Cash Flow Highlights' })).toBeInTheDocument();
  });

  it('never blocks Run, however unready it thinks the report is', async () => {
    // The check informs. A user who knows something we do not still gets to press it.
    h.getEarningsSections.mockResolvedValue({ sections: NARRATIVE });
    h.runEarningsSection.mockResolvedValue({
      ...NARRATIVE[1], status: 'produced', content: 'Revenue rose.' });
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    fireEvent.click(screen.getByRole('button', { name: /Executive Summary/ }));

    const run = await screen.findByRole('button', { name: 'Run this section' });
    expect(run).not.toBeDisabled();
    fireEvent.click(run);

    await waitFor(() =>
      expect(h.runEarningsSection).toHaveBeenCalledWith('rep-1', 's03_exec_summary', false));
    expect(await screen.findByText('Revenue rose.')).toBeInTheDocument();
  });

  it('a run that comes back empty is a reason, not a dead end', async () => {
    h.getEarningsSections.mockResolvedValue({ sections: NARRATIVE });
    h.runEarningsSection.mockResolvedValue({ ...NARRATIVE[1], content: '' });
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    fireEvent.click(screen.getByRole('button', { name: /Executive Summary/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Run this section' }));

    expect(await screen.findByText(/didn't produce anything usable/)).toBeInTheDocument();
    // and the way forward is still right there
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  // ── Layout ─────────────────────────────────────────────────────────────────
  //
  // The rail shipped as a full-width band across the top with the section stacked
  // underneath, because an inline gridTemplateColumns was quietly beating the
  // stylesheet rule that made it two columns. It looked like a sidebar in the code
  // and like a header on the screen.

  it('puts the rail beside the content, not above it', async () => {
    renderPage();
    const heading = await screen.findByRole('heading', { name: 'Financial Highlights' });

    const rail = screen.getByText('Sections').closest('.card') as HTMLElement;
    const grid = rail.parentElement as HTMLElement;
    expect(grid.style.display).toBe('grid');
    // two tracks, rail first — the whole point
    expect(grid.style.gridTemplateColumns).toBe('280px 1fr');
    // and the section pane is the sibling that follows it, not a row below
    expect(grid.contains(heading)).toBe(true);
    expect(grid.children.length).toBe(2);
  });

  it('selecting Cover & colours renders something', async () => {
    // The rail always offers this row, so a blank pane is not an option. It was
    // blank: both section lookups missed and nothing else was keyed on it.
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    fireEvent.click(screen.getByRole('button', { name: /Cover & colours/ }));

    expect(await screen.findByRole('heading', { name: /Cover & colours/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Choose cover/ })).toBeInTheDocument();
  });

});
