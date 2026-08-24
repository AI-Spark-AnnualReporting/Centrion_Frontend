// Step 3 — Preview, where a finished report gets checked.
//
// The brief for every financial section is typed on the Outline and Continue
// builds the whole thing, so this screen never asks for anything. It shows what
// came back, lets it be adjusted by hand, and lets each section be marked done.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
    finaliseEarningsSectionFigures: vi.fn(),
    analyseEarningsSection: vi.fn(),
    saveEarningsSectionAnalysis: vi.fn(),
    searchSectionFigures: vi.fn(),
    setSectionFigures: vi.fn(),
    getEarningsSourceLines: vi.fn(),
    produceEarningsReport: vi.fn(),
    refineEarningsSection: vi.fn(),
    getByPollUrl: vi.fn(),
    getNodes: vi.fn(),
    getEarningsCoverTemplates: vi.fn(),
    getEarningsColorPalettes: vi.fn(),
    getEarningsCoverSelection: vi.fn(),
    saveEarningsCoverSelection: vi.fn(),
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
    finaliseEarningsSectionFigures: (...a: unknown[]) => h.finaliseEarningsSectionFigures(...a),
    analyseEarningsSection: (...a: unknown[]) => h.analyseEarningsSection(...a),
    saveEarningsSectionAnalysis: (...a: unknown[]) => h.saveEarningsSectionAnalysis(...a),
    searchSectionFigures: (...a: unknown[]) => h.setSectionFigures(...a),
    setSectionFigures: (...a: unknown[]) => h.setSectionFigures(...a),
    getEarningsSourceLines: (...a: unknown[]) => h.getEarningsSourceLines(...a),
    produceEarningsReport: (...a: unknown[]) => h.produceEarningsReport(...a),
    refineEarningsSection: (...a: unknown[]) => h.refineEarningsSection(...a),
    getEarningsCoverTemplates: (...a: unknown[]) => h.getEarningsCoverTemplates(...a),
    getEarningsColorPalettes: (...a: unknown[]) => h.getEarningsColorPalettes(...a),
    getEarningsCoverSelection: (...a: unknown[]) => h.getEarningsCoverSelection(...a),
    saveEarningsCoverSelection: (...a: unknown[]) => h.saveEarningsCoverSelection(...a),
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
  h.setSectionFigures.mockResolvedValue({
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
  h.getEarningsCoverTemplates.mockResolvedValue({ cover_templates: [] });
  h.getEarningsColorPalettes.mockResolvedValue({ color_palettes: [] });
  h.getEarningsCoverSelection.mockResolvedValue({ cover_template_key: null, brand: null });
});

describe('EarningsPreviewPage', () => {
  it('opens on the first section, with every section in the rail and no model call', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Financial Highlights' })).toBeInTheDocument();
    // one pane at a time; the rail is how you reach the rest
    expect(screen.queryByRole('heading', { name: 'Cash Flow Highlights' })).toBeNull();
    expect(screen.getByRole('button', { name: /Cash Flow Highlights/ })).toBeInTheDocument();
    expect(h.setSectionFigures).not.toHaveBeenCalled();
  });

  it('the rail switches which section fills the pane', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    fireEvent.click(screen.getByRole('button', { name: /Cash Flow Highlights/ }));
    expect(await screen.findByRole('heading', { name: 'Cash Flow Highlights' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Financial Highlights' })).toBeNull();
  });

  it('removing a figure saves the rest of the section', async () => {
    h.getEarningsFigureSections.mockResolvedValue({
      ...SECTIONS,
      sections: [
        { section_code: 's04_financial_highlights', title: 'Financial Highlights',
          prompt: 'margins', total: 2,
          figures: [fig('qf_1', 'Revenue'), fig('qf_2', 'Gross margin')] },
      ],
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    await screen.findByText('Gross margin');

    fireEvent.click(screen.getByRole('button', { name: 'Remove Gross margin' }));
    await waitFor(() =>
      expect(h.setSectionFigures).toHaveBeenCalledWith(
        'rep-1', 's04_financial_highlights', ['qf_1']));
  });

  it('Add figures opens the picker for that section', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    fireEvent.click(screen.getByRole('button', { name: 'Add figures' }));

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
    fireEvent.click(screen.getByRole('button', { name: 'Add figures' }));
    await screen.findByRole('checkbox', { name: 'Inventories' });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Inventories' }));
    fireEvent.click(screen.getByRole('button', { name: /done/i }));

    await waitFor(() => expect(h.setSectionFigures).toHaveBeenCalledTimes(1));
    const [, code, ids] = h.setSectionFigures.mock.calls[0];
    expect(code).toBe('s04_financial_highlights');
    expect(new Set(ids as string[])).toEqual(new Set(['qf_1', 'qf_9']));
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

  it('does not offer an "Add a section" button on the rail', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    expect(screen.queryByRole('button', { name: '+ Add a section' })).not.toBeInTheDocument();
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

  it('shows a produced narrative section, with no Regenerate button', async () => {
    h.getEarningsSections.mockResolvedValue({ sections: NARRATIVE });
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    fireEvent.click(screen.getByRole('button', { name: /CEO Commentary/ }));

    expect(await screen.findByText(/reinforce our ability to deliver/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Regenerate' })).not.toBeInTheDocument();
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

  // Reported live on s11_guidance: the section sat at "not run" with a Run
  // button, and pressing it changed nothing — no prose, no error, no
  // explanation. It HAD run. The backend answers "your documents say nothing
  // about this" with a fixed sentence, and Preview blanked that sentence, so a
  // finished section was indistinguishable from one nobody had run.
  const NO_DATA = JSON.stringify({
    heading: null,
    content: 'No forward-looking guidance was disclosed in the uploaded documents for this period.',
  });

  const withGuidance = (content: string | null) => [
    ...NARRATIVE,
    { section_code: 's11_guidance', title: 'Guidance / Outlook', mode: 'generate',
      source_type: 'AI-written', status: 'produced', included: true, content },
  ];

  it('a section that ran and found nothing says so, instead of looking un-run', async () => {
    h.getEarningsSections.mockResolvedValue({ sections: withGuidance(NO_DATA) });
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    fireEvent.click(screen.getByRole('button', { name: /Guidance/ }));

    // The finding itself, stated…
    expect(await screen.findByText(/No forward-looking guidance was disclosed/)).toBeInTheDocument();
    // …not a Run button implying it was never attempted.
    expect(screen.queryByRole('button', { name: 'Run this section' })).toBeNull();
    // Running it again is still offered, for when a source is added.
    expect(screen.getByRole('button', { name: 'Run again' })).toBeInTheDocument();
    // And it says what happens to it.
    expect(screen.getByText(/left out of the finished report/)).toBeInTheDocument();
  });

  it('the rail calls that its own state, not "not run"', async () => {
    h.getEarningsSections.mockResolvedValue({ sections: withGuidance(NO_DATA) });
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    const row = screen.getByRole('button', { name: /Guidance/ });
    expect(row).toHaveTextContent('nothing to report');
    expect(row).not.toHaveTextContent('not run');
  });

  it('a section that genuinely has not run still says not run', async () => {
    h.getEarningsSections.mockResolvedValue({ sections: withGuidance(null) });
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    expect(screen.getByRole('button', { name: /Guidance/ })).toHaveTextContent('not run');
  });

  // The produce endpoint returns four fields — section_code, status, content,
  // error. It was being normalised into a WHOLE section first, which invented a
  // title (falling back to the section code), display_order 0 and mode
  // 'generate' for everything missing; merged over the real section, those won.
  // Running a section renamed it to its own code.
  it('running a section does not rename it to its own section code', async () => {
    h.getEarningsSections.mockResolvedValue({ sections: withGuidance(null) });
    h.runEarningsSection.mockResolvedValue({
      section_code: 's11_guidance', status: 'produced', content: 'Guidance follows.', error: null,
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    fireEvent.click(screen.getByRole('button', { name: /Guidance/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Run this section' }));

    expect(await screen.findByText('Guidance follows.')).toBeInTheDocument();
    // The title survives the run — in the pane and in the rail.
    expect(screen.getByRole('heading', { name: 'Guidance / Outlook' })).toBeInTheDocument();
    expect(screen.queryByText('s11_guidance')).toBeNull();
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

  // ── This screen no longer asks for anything ────────────────────────────────

  const FILLED_ONE = {
    ...SECTIONS,
    sections: [
      { section_code: 's04_financial_highlights', title: 'Financial Highlights',
        prompt: 'revenue and margins', total: 1, figures: [fig('qf_1', 'Revenue')],
        finalised: false },
    ],
  };

  it('has no brief box and no way to search', async () => {
    h.getEarningsFigureSections.mockResolvedValue(FILLED_ONE);
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });

    // the brief was typed on the Outline; here it is only a record of it
    expect(screen.getByText('“revenue and margins”')).toBeInTheDocument();
    expect(
      screen.queryByLabelText('What figures belong in Financial Highlights'),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: /Search/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ask again' })).toBeNull();
  });

  it('offers Add figures and Finalise figures', async () => {
    h.getEarningsFigureSections.mockResolvedValue(FILLED_ONE);
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });

    expect(screen.getByRole('button', { name: 'Add figures' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finalise figures' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add figure' })).toBeNull();
  });

  it('finalising swaps Add figures for Analyse, and can be undone', async () => {
    // A bookmark, not a lock. A one-way door with nothing behind it would only be
    // a nuisance the first time somebody spots a mistake.
    h.getEarningsFigureSections.mockResolvedValue(FILLED_ONE);
    h.finaliseEarningsSectionFigures.mockResolvedValue({});
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });

    fireEvent.click(screen.getByRole('button', { name: 'Finalise figures' }));

    await waitFor(() =>
      expect(h.finaliseEarningsSectionFigures).toHaveBeenCalledWith(
        'rep-1', 's04_financial_highlights', true, undefined));
    // The green text is gone; the useful thing in its place is the commentary.
    expect(await screen.findByRole('button', { name: /Analyse/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add figures' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(await screen.findByRole('button', { name: 'Add figures' })).toBeInTheDocument();
  });

  it('a failed finalise puts the button back rather than lying', async () => {
    h.getEarningsFigureSections.mockResolvedValue(FILLED_ONE);
    h.finaliseEarningsSectionFigures.mockRejectedValue(new h.MockApiError(500, 'nope'));
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    fireEvent.click(screen.getByRole('button', { name: 'Finalise figures' }));

    expect(await screen.findByRole('button', { name: 'Finalise figures' })).toBeInTheDocument();
  });

  it('the footer counts what is left to finalise', async () => {
    h.getEarningsFigureSections.mockResolvedValue({
      ...SECTIONS,
      sections: [
        { section_code: 's04_financial_highlights', title: 'Financial Highlights',
          prompt: null, total: 1, figures: [fig('qf_1', 'Revenue')], finalised: true },
        { section_code: 's10b_cash_flow', title: 'Cash Flow Highlights',
          prompt: null, total: 2, figures: [], finalised: false },
      ],
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    expect(screen.getByText(/1 of\s+2 sections finalised/)).toBeInTheDocument();
  });

  const CONSENSUS_ONE = {
    ...SECTIONS,
    sections: [
      { section_code: 's12_consensus', title: 'Consensus vs Actual',
        prompt: null, total: 1,
        figures: [{ ...fig('qf_1', 'External revenue'), value: 424095,
                    expected_value: null }] },
    ],
  };

  it('a typed expectation stays on screen and is not sent yet', async () => {
    // Reported twice: type a value, the verdict appears, then it reverts to
    // blank. It was an optimistic write rolling back behind a failing request.
    // Now typing touches nothing but the screen, so there is no request to fail.
    h.getEarningsFigureSections.mockResolvedValue(CONSENSUS_ONE);
    renderPage();
    await screen.findByRole('heading', { name: 'Consensus vs Actual' });

    const box = screen.getByLabelText('Expected External revenue');
    fireEvent.change(box, { target: { value: '450000' } });
    fireEvent.blur(box);

    expect(await screen.findByText('✗ Miss')).toBeInTheDocument();
    expect(screen.getByLabelText('Expected External revenue')).toHaveValue('450000');
    expect(h.finaliseEarningsSectionFigures).not.toHaveBeenCalled();
  });

  it('says the typed numbers are not saved until the section is finalised', async () => {
    // Held locally is only honest if the screen admits it. Silence here is what
    // turns "I typed it" into "it was saved".
    h.getEarningsFigureSections.mockResolvedValue(CONSENSUS_ONE);
    renderPage();
    await screen.findByRole('heading', { name: 'Consensus vs Actual' });

    const box = screen.getByLabelText('Expected External revenue');
    fireEvent.change(box, { target: { value: '450000' } });
    fireEvent.blur(box);

    expect(await screen.findByText(/1 expectation typed/)).toBeInTheDocument();
  });

  it('finalising writes every typed expectation in one request', async () => {
    h.getEarningsFigureSections.mockResolvedValue(CONSENSUS_ONE);
    h.finaliseEarningsSectionFigures.mockResolvedValue({});
    renderPage();
    await screen.findByRole('heading', { name: 'Consensus vs Actual' });

    const box = screen.getByLabelText('Expected External revenue');
    fireEvent.change(box, { target: { value: '450000' } });
    fireEvent.blur(box);
    fireEvent.click(screen.getByRole('button', { name: 'Finalise figures' }));

    await waitFor(() =>
      expect(h.finaliseEarningsSectionFigures).toHaveBeenCalledWith(
        'rep-1', 's12_consensus', true, { qf_1: 450000 }));
    expect(h.finaliseEarningsSectionFigures).toHaveBeenCalledTimes(1);
  });

  it('a failed finalise keeps the typed numbers and says what happened', async () => {
    // The number must not disappear because the write failed. It is still on
    // screen, still pending, and pressing Finalise again sends it.
    h.getEarningsFigureSections.mockResolvedValue(CONSENSUS_ONE);
    h.finaliseEarningsSectionFigures.mockRejectedValue(new h.MockApiError(500, 'nope'));
    renderPage();
    await screen.findByRole('heading', { name: 'Consensus vs Actual' });

    const box = screen.getByLabelText('Expected External revenue');
    fireEvent.change(box, { target: { value: '450000' } });
    fireEvent.blur(box);
    fireEvent.click(screen.getByRole('button', { name: 'Finalise figures' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/didn't save/);
    expect(screen.getByLabelText('Expected External revenue')).toHaveValue('450000');
    expect(await screen.findByText(/1 expectation typed/)).toBeInTheDocument();
  });

  it('an analysis survives switching sections and coming back', async () => {
    // Reported: analyse, click another section, come back — gone. The control
    // remounts on every rail switch (deliberately, so an in-flight request cannot
    // leak onto the next section) and re-seeds from section.analysis, so a fresh
    // result has to be lifted into the page or it is thrown away until a reload.
    h.getEarningsFigureSections.mockResolvedValue({
      ...SECTIONS,
      sections: [
        { section_code: 's04_financial_highlights', title: 'Financial Highlights',
          prompt: null, total: 1, finalised: true,
          figures: [fig('qf_1', 'Revenue')] },
        { section_code: 's10b_cash_flow', title: 'Cash Flow Highlights',
          prompt: null, total: 1, finalised: true,
          figures: [fig('qf_2', 'Free cash flow')] },
      ],
    });
    h.getEarningsSections.mockResolvedValue({
      sections: [
        { section_code: 's04_financial_highlights', title: 'Financial Highlights',
          mode: 'table', status: 'produced', included: true,
          content: '{"tables":[]}', analysis: null },
      ],
    });
    h.analyseEarningsSection.mockResolvedValue({
      text: '- Revenue is the largest line in the section.',
      fingerprint: 'FP', warnings: [], edited: false,
    });

    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });

    fireEvent.click(screen.getByRole('button', { name: /Analyse/ }));
    // the dialog's own confirm, not the trigger behind it
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Analyse' }));
    expect(await screen.findByText(/largest line in the section/)).toBeInTheDocument();

    // away…
    fireEvent.click(screen.getAllByRole('button', { name: /Cash Flow Highlights/ })[0]);
    expect(await screen.findByText('Free cash flow')).toBeInTheDocument();
    // …and back
    fireEvent.click(screen.getAllByRole('button', { name: /Financial Highlights/ })[0]);
    expect(await screen.findByText('Revenue')).toBeInTheDocument();

    expect(await screen.findByText(/largest line in the section/)).toBeInTheDocument();
  });

  it('replays a stored analysis on load, without anyone clicking Analyse', async () => {
    // This is the half the normaliser bug hid. The in-session path above worked,
    // so the feature looked fine; a reload lost the bullets, and clicking Analyse
    // again returned instantly from the server cache, which made it look like
    // they had never gone.
    h.getEarningsFigureSections.mockResolvedValue({
      ...SECTIONS,
      sections: [
        { section_code: 's04_financial_highlights', title: 'Financial Highlights',
          prompt: null, total: 1, finalised: true,
          figures: [fig('qf_1', 'Revenue')] },
      ],
    });
    h.getEarningsSections.mockResolvedValue({
      sections: [
        { section_code: 's04_financial_highlights', title: 'Financial Highlights',
          mode: 'table', status: 'produced', included: true,
          content: '{"tables":[]}',
          analysis: { text: '- Revenue is the largest line in the section.',
                      generated_at: '2026-08-24T08:18:10Z', model: 'gpt-4.1',
                      fingerprint: 'FP' } },
      ],
    });

    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });

    expect(await screen.findByText(/largest line in the section/)).toBeInTheDocument();
    expect(h.analyseEarningsSection).not.toHaveBeenCalled();
  });


  // ── The refine bar ──────────────────────────────────────────────────────────
  //
  // Edit retypes the section and Regenerate throws it away and rebuilds it. This
  // is the middle option that was missing: say what you want changed and keep
  // everything else.

  const WRITTEN = [
    { section_code: 's03_exec_summary', title: 'Executive Summary', mode: 'generate',
      source_type: 'Hybrid', status: 'produced', included: true,
      content: 'Net income was SAR 103,365 million, a 15.4% decrease.' },
    { section_code: 's11_guidance', title: 'Guidance / Outlook', mode: 'generate',
      source_type: 'AI-written', status: 'pending', included: true, content: null },
  ];

  const openWritten = async () => {
    h.getEarningsSections.mockResolvedValue({ sections: WRITTEN });
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    fireEvent.click(screen.getAllByRole('button', { name: /Executive Summary/ })[0]);
    return screen.findByText(/Refine this section/i);
  };

  it('a chip fills the box rather than sending on its own', async () => {
    await openWritten();

    fireEvent.click(screen.getByRole('button', { name: 'Make it concise' }));

    expect(screen.getByPlaceholderText(/Tell the agent how to adjust/)).toHaveValue('Make it concise');
    expect(h.refineEarningsSection).not.toHaveBeenCalled();
  });

  it('sending an instruction puts the rewritten text on screen', async () => {
    await openWritten();
    h.refineEarningsSection.mockResolvedValue({
      section_code: 's03_exec_summary', status: 'produced',
      content: 'Net income fell 15.4% to SAR 103,365 million.',
      grounding_violations: [],
    });

    fireEvent.change(screen.getByPlaceholderText(/Tell the agent how to adjust/),
                     { target: { value: 'Make it concise' } });
    fireEvent.click(screen.getByRole('button', { name: /Send/ }));

    await waitFor(() => expect(h.refineEarningsSection).toHaveBeenCalledWith(
      'rep-1', 's03_exec_summary', 'Make it concise'));
    expect(await screen.findByText(/Net income fell 15.4%/)).toBeInTheDocument();
  });

  it('a refine that fails keeps the text that was already there', async () => {
    await openWritten();
    h.refineEarningsSection.mockRejectedValue(new h.MockApiError(502, 'The rewrite came back empty.'));

    fireEvent.change(screen.getByPlaceholderText(/Tell the agent how to adjust/),
                     { target: { value: 'Make it concise' } });
    fireEvent.click(screen.getByRole('button', { name: /Send/ }));

    expect(await screen.findByText('The rewrite came back empty.')).toBeInTheDocument();
    expect(screen.getByText(/Net income was SAR 103,365 million/)).toBeInTheDocument();
  });

  it('a section nobody has run yet is offered Run, not a rewrite', async () => {
    h.getEarningsSections.mockResolvedValue({ sections: WRITTEN });
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    fireEvent.click(screen.getAllByRole('button', { name: /Guidance/ })[0]);

    expect(await screen.findByRole('button', { name: 'Run this section' })).toBeInTheDocument();
    expect(screen.queryByText(/Refine this section/i)).not.toBeInTheDocument();
  });

  it('a figures table has no rewrite bar — there is no prose in it', async () => {
    h.getEarningsSections.mockResolvedValue({ sections: WRITTEN });
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });

    expect(screen.queryByText(/Refine this section/i)).not.toBeInTheDocument();
  });

  // ── A section that never became content ─────────────────────────────────────
  //
  // Filing figures is the work on this screen, so the rail ticked a section the
  // moment it had any. Non-IFRS Reconciliations had thirty-one, ticked green,
  // counted toward the total, produced nothing, and was dropped from the export
  // without a word. Figures filed is not the same as section built, and the rail
  // now says which one it means.

  const STALLED_SECTIONS = {
    sections: [
      { section_code: 's15_non_ifrs_recon', title: 'Non-IFRS Reconciliations',
        prompt: null, total: 2, finalised: false,
        figures: [fig('qf_1', 'Free cash flow'), fig('qf_2', 'EBIT')] },
      { section_code: 's04_financial_highlights', title: 'Financial Highlights',
        prompt: null, total: 1, finalised: false, figures: [fig('qf_3', 'Revenue')] },
    ],
  };

  it('says so when figures were filed but the section never got built', async () => {
    h.getEarningsFigureSections.mockResolvedValue(STALLED_SECTIONS);
    h.getEarningsSections.mockResolvedValue({
      sections: [
        { section_code: 's15_non_ifrs_recon', title: 'Non-IFRS Reconciliations',
          mode: 'table', status: 'needs_input', included: true, content: null },
        { section_code: 's04_financial_highlights', title: 'Financial Highlights',
          mode: 'table', status: 'produced', included: true, content: '{"rows":[]}' },
      ],
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Non-IFRS Reconciliations' });

    expect(screen.getByText(/not in report/)).toBeInTheDocument();
    expect(await screen.findByText(/will not appear in it/)).toBeInTheDocument();
  });

  it('does not count a section that never got built as done', async () => {
    h.getEarningsFigureSections.mockResolvedValue(STALLED_SECTIONS);
    h.getEarningsSections.mockResolvedValue({
      sections: [
        { section_code: 's15_non_ifrs_recon', title: 'Non-IFRS Reconciliations',
          mode: 'table', status: 'needs_input', included: true, content: null },
        { section_code: 's04_financial_highlights', title: 'Financial Highlights',
          mode: 'table', status: 'produced', included: true, content: '{"rows":[]}' },
      ],
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Non-IFRS Reconciliations' });

    // one of the two, not two of two
    expect(screen.getByText(/1\/2/)).toBeInTheDocument();
  });

  it('says nothing at all about a section that built normally', async () => {
    h.getEarningsFigureSections.mockResolvedValue(STALLED_SECTIONS);
    h.getEarningsSections.mockResolvedValue({
      sections: [
        { section_code: 's15_non_ifrs_recon', title: 'Non-IFRS Reconciliations',
          mode: 'table', status: 'produced', included: true,
          content: '{"rows":[{"label":"Free cash flow"}]}' },
        { section_code: 's04_financial_highlights', title: 'Financial Highlights',
          mode: 'table', status: 'produced', included: true, content: '{"rows":[]}' },
      ],
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Non-IFRS Reconciliations' });

    expect(screen.queryByText(/not in report/)).not.toBeInTheDocument();
    expect(screen.queryByText(/will not appear in it/)).not.toBeInTheDocument();
    expect(screen.getByText(/2\/2/)).toBeInTheDocument();
  });

  it('a section with no figures yet is just not started, not stalled', async () => {
    // It has nothing filed, so "not built" is not news -- the ordinary empty
    // state already says what to do.
    h.getEarningsFigureSections.mockResolvedValue({
      sections: [
        { section_code: 's15_non_ifrs_recon', title: 'Non-IFRS Reconciliations',
          prompt: null, total: 0, finalised: false, figures: [] },
      ],
    });
    h.getEarningsSections.mockResolvedValue({ sections: [] });
    renderPage();
    await screen.findByRole('heading', { name: 'Non-IFRS Reconciliations' });

    expect(screen.queryByText(/not in report/)).not.toBeInTheDocument();
    expect(screen.queryByText(/will not appear in it/)).not.toBeInTheDocument();
  });

  // ── What the screen shows before the data arrives ──────────────────────────
  //
  // The loader would hand over and the page would be blank for a second or two --
  // a small centred spinner in a full-width empty page reads as nothing at all.
  // The structure arrives first now, and only the values are missing.

  it('draws the page structure while the figures are still loading', async () => {
    let release: (v: unknown) => void = () => {};
    h.getEarningsFigureSections.mockReturnValue(new Promise((r) => { release = r; }));
    renderPage();

    // Present before anything resolves: the rail, its header, and the table frame.
    expect(await screen.findByRole('status', { name: /loading the report preview/i }))
      .toBeInTheDocument();
    expect(screen.getByText('Sections')).toBeInTheDocument();
    expect(screen.getByText('LINE')).toBeInTheDocument();
    expect(screen.getByText('VALUE')).toBeInTheDocument();

    release(SECTIONS);
    expect(await screen.findByRole('heading', { name: 'Financial Highlights' })).toBeInTheDocument();
    // …and it gets out of the way once the real thing is there.
    expect(screen.queryByRole('status', { name: /loading the report preview/i }))
      .not.toBeInTheDocument();
  });

  it('shows no skeleton when the load failed — nothing is coming', async () => {
    h.getEarningsFigureSections.mockRejectedValue(new h.MockApiError(500));
    renderPage();

    await waitFor(() =>
      expect(screen.queryByRole('status', { name: /loading the report preview/i }))
        .not.toBeInTheDocument());
  });

  it('still shows a nothing-to-report section on Preview, with the reason and a way to retry', async () => {
    // Hidden on the Report screen and absent from the file, but this is where it
    // can be acted on, so here it stays — with the finding stated rather than a
    // blank panel and a Run button that explains nothing.
    const SENTENCE = 'No forward-looking guidance was disclosed in the uploaded documents for this period.';
    h.getEarningsSections.mockResolvedValue({
      sections: [
        { section_code: 's11_guidance', title: 'Guidance / Outlook', mode: 'generate',
          source_type: 'AI-written', status: 'produced', included: true,
          // Already normalised: this suite mocks @/lib/api, so the mapping from
          // feeder.status is not in play here. It is covered against the real
          // module in earnings-analysis-survives-the-normaliser.test.ts.
          content: null, feeder_status: 'no_data', feeder_message: SENTENCE },
      ],
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Financial Highlights' });
    fireEvent.click(screen.getAllByRole('button', { name: /Guidance/ })[0]);

    expect(await screen.findByText(SENTENCE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run again' })).toBeInTheDocument();
    expect(screen.getByText(/left out of the finished report/)).toBeInTheDocument();
    expect(screen.getByText(/nothing to report/)).toBeInTheDocument();
  });

});
