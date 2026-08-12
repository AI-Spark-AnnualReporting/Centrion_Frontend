// The Analyse button — an on-screen read of one section's figures.
//
// Two things here are load-bearing and neither is the prose:
//
//   1. WHICH sections get the button. The naive predicate (count the rows) reads
//      a prose section {heading, content} as two rows, so a CEO Statement would
//      have grown an "analyse my figures" button. That is the bug these pin.
//   2. The figures do not leave without consent. The button opens a dialog; the
//      network call happens on confirm and NOT on cancel.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import SectionAnalysis from '@/components/quarterly/SectionAnalysis';
import { isFinancialTable } from '@/components/quarterly/sectionState';
import type { ProducedSection, SectionAnalysis as Analysis } from '@/types/quarterly';

const analyseSection = vi.fn();
vi.mock('@/lib/api', () => ({
  quarterlyReports: {
    analyseSection: (...a: unknown[]) => analyseSection(...a),
    saveSectionAnalysis: (...a: unknown[]) => saveSectionAnalysis(...a),
  },
}));

function section(over: Partial<ProducedSection> = {}): ProducedSection {
  return {
    section_code: 'sec_income',
    title: 'Income & Comprehensive Income',
    display_order: 3,
    source_type: 'Extraction',
    mode: 'table',
    status: 'produced',
    feeder_status: 'ready',
    content: JSON.stringify({
      title: 'Income & Comprehensive Income',
      rows: [
        { label: 'Revenue', role: 'line', current_display: 'SAR 424,095' },
        { label: 'Net income', role: 'total', current_display: 'SAR 122,188' },
      ],
    }),
    ...over,
  } as ProducedSection;
}

// The trigger and the dialog's confirm deliberately share the label "Analyse" —
// an action keeps its name through the flow — so dialog clicks are scoped.
const confirm = () =>
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Analyse' }));

const RESULT: Analysis = {
  text: 'Revenue was SAR 424,095 for the quarter.\n\nNet income was SAR 122,188.',
  generated_at: '2026-08-12T10:00:00Z',
  model: 'gpt-4.1',
  fingerprint: 'abc123',
};

const saveSectionAnalysis = vi.fn();

// ── 1. Which sections get the button ─────────────────────────────────────────

describe('which sections can be analysed', () => {
  it('a table of figures can', () => {
    expect(isFinancialTable(section())).toBe(true);
  });

  it('a section of stacked tables can', () => {
    expect(isFinancialTable(section({
      content: JSON.stringify({ title: 'N5', tables: [{ title: 'Movement', rows: [{ label: 'A', current_display: '1' }] }] }),
    }))).toBe(true);
  });

  it('a hybrid table+analysis section can, even though its mode says generate', () => {
    expect(isFinancialTable(section({
      mode: 'generate',
      content: JSON.stringify({ title: 'T', rows: [{ label: 'A', current_display: '1' }], analysis: ['a point'] }),
    }))).toBe(true);
  });

  it('an AI-written prose section CANNOT — its two keys are not two rows', () => {
    // The whole reason isFinancialTable exists: tableRowCount() counts an
    // object's keys when it finds no rows array, so this reads as 2 rows.
    expect(isFinancialTable(section({
      mode: 'generate',
      content: JSON.stringify({ heading: 'CEO Statement', content: 'Dear shareholders' }),
    }))).toBe(false);
  });

  it('an attached document cannot', () => {
    expect(isFinancialTable(section({ content: JSON.stringify({ document_id: 'abc' }) }))).toBe(false);
  });

  it('a table-mode section holding plain prose cannot', () => {
    // _no_data_outcome writes the user's own typed text onto a table section.
    expect(isFinancialTable(section({ content: 'We had a good quarter.' }))).toBe(false);
  });

  it('an empty table cannot', () => {
    expect(isFinancialTable(section({ content: JSON.stringify({ title: 'T', rows: [] }) }))).toBe(false);
  });

  it('a section still waiting to be produced cannot', () => {
    expect(isFinancialTable(section({ status: 'pending', content: null }))).toBe(false);
  });

  it('a needs-input section cannot', () => {
    expect(isFinancialTable(section({ content: 'Awaiting input: the MD&A' }))).toBe(false);
  });

  it('the cover cannot', () => {
    expect(isFinancialTable(section({
      section_code: 'cover',
      content: JSON.stringify({ rows: [{ label: 'A', current_display: '1' }] }),
    }))).toBe(false);
  });
});

// ── 2. Consent ───────────────────────────────────────────────────────────────

describe('sending the figures needs consent', () => {
  beforeEach(() => {
    analyseSection.mockReset();
    analyseSection.mockImplementation(() => Promise.resolve(RESULT));
  });

  const renderIt = (s = section()) =>
    render(<SectionAnalysis companyId="c1" reportId="r1" section={s} />);

  it('says where the figures go, and that the result lands in the report', () => {
    renderIt();
    expect(screen.getByText(/Sends this section’s figures to OpenAI/)).toBeInTheDocument();
    expect(screen.getByText(/go into your report/)).toBeInTheDocument();
  });

  it('clicking Analyse asks first and sends nothing', () => {
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Analyse' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(analyseSection).not.toHaveBeenCalled();
  });

  it('the dialog names what leaves and what does not', () => {
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Analyse' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('2 lines');
    expect(dialog).toHaveTextContent('Income & Comprehensive Income');
    expect(dialog).toHaveTextContent(/printed under this table in the report you export/);
  });

  it('cancelling sends nothing', () => {
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Analyse' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(analyseSection).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Escape cancels too', () => {
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Analyse' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(analyseSection).not.toHaveBeenCalled();
  });

  it('confirming sends the figures and shows the analysis', async () => {
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Analyse' }));
    confirm();
    await waitFor(() => expect(analyseSection).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Revenue was SAR 424,095/)).toBeInTheDocument();
    // Two paragraphs, not one blob.
    expect(screen.getByText(/Net income was SAR 122,188/)).toBeInTheDocument();
  });
});

// ── 3. Waiting, and what comes back ──────────────────────────────────────────

describe('waiting and the result', () => {
  // Braces matter: a concise arrow would RETURN the mock, and vitest treats a
  // returned function as a teardown callback — it would call the mock after
  // every test in this block.
  beforeEach(() => {
    analyseSection.mockReset();
  });

  // Awaiting the call before asserting mirrors what actually happens in the
  // browser and keeps the in-flight promise attached to this test.
  const start = async () => {
    const view = render(<SectionAnalysis companyId="c1" reportId="r1" section={section()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Analyse' }));
    confirm();
    await waitFor(() => expect(analyseSection).toHaveBeenCalled());
    return view;
  };

  it('states the real scope while waiting rather than a bare spinner', async () => {
    analyseSection.mockImplementation(() => new Promise<Analysis>(() => {})); // in flight
    const { unmount } = await start();
    expect(await screen.findByText(/Reading 2 lines from this table/)).toBeInTheDocument();
    // The component aborts on unmount; do it here so nothing outlives the test.
    unmount();
  });

  it('says plainly when it fails, and does not pretend to have an analysis', async () => {
    analyseSection.mockImplementation(async () => { throw new Error('Service unavailable'); });
    await start();
    expect(await screen.findByText('Service unavailable')).toBeInTheDocument();
    expect(screen.queryByText(/Revenue was SAR/)).not.toBeInTheDocument();
  });

  it('replays a stored analysis so it survives a reload', () => {
    render(<SectionAnalysis companyId="c1" reportId="r1" section={section({ analysis: RESULT })} />);
    expect(screen.getByText(/Revenue was SAR 424,095/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-analyse' })).toBeInTheDocument();
  });

  it('names the model that wrote it', () => {
    render(<SectionAnalysis companyId="c1" reportId="r1" section={section({ analysis: RESULT })} />);
    expect(screen.getByText(/gpt-4\.1/)).toBeInTheDocument();
  });

  it('credits you, not the model, once you have edited it', () => {
    render(<SectionAnalysis companyId="c1" reportId="r1" section={section({
      analysis: { ...RESULT, edited: true, edited_at: '2026-08-12T11:00:00Z' },
    })} />);
    expect(screen.getByText(/Edited by you/)).toBeInTheDocument();
    expect(screen.queryByText(/gpt-4\.1/)).not.toBeInTheDocument();
  });

  it('surfaces a figure the fact-check could not verify instead of hiding it', () => {
    render(<SectionAnalysis companyId="c1" reportId="r1"
      section={section({ analysis: { ...RESULT, warnings: ['unverified numbers: 999,777'] } })} />);
    expect(screen.getByText(/999,777/)).toBeInTheDocument();
  });

  it('warns when the table was edited after the analysis was written', () => {
    // Otherwise prose describing the old numbers sits under the new ones and
    // reads as current.
    const { rerender } = render(
      <SectionAnalysis companyId="c1" reportId="r1" section={section({ analysis: RESULT })} />);
    expect(screen.queryByText(/figures changed/)).not.toBeInTheDocument();

    rerender(<SectionAnalysis companyId="c1" reportId="r1" section={section({
      analysis: RESULT,
      content: JSON.stringify({ title: 'T', rows: [{ label: 'Revenue', current_display: 'SAR 1' }] }),
    })} />);
    expect(screen.getByText(/figures changed/)).toBeInTheDocument();
  });

  it('re-analysing asks for consent again, and warns it replaces what is there', () => {
    render(<SectionAnalysis companyId="c1" reportId="r1" section={section({ analysis: RESULT })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Re-analyse' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(/will be replaced, including any edits/);
    expect(analyseSection).not.toHaveBeenCalled();
  });
});

// ── 4. Editing, because it is going into a published report ──────────────────

describe('editing the paragraphs', () => {
  beforeEach(() => {
    analyseSection.mockReset();
    saveSectionAnalysis.mockReset();
    saveSectionAnalysis.mockImplementation((_c, _r, _s, text) =>
      Promise.resolve({ ...RESULT, text, edited: true, edited_at: '2026-08-12T11:00:00Z' }));
  });

  const openEditor = () => {
    render(<SectionAnalysis companyId="c1" reportId="r1" section={section({ analysis: RESULT })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  };

  it('opens with the current prose in the box', () => {
    openEditor();
    expect(screen.getByRole('textbox')).toHaveValue(RESULT.text);
  });

  it('saves a rewritten paragraph and shows it', async () => {
    openEditor();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My own wording.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveSectionAnalysis).toHaveBeenCalledWith('c1', 'r1', 'sec_income', 'My own wording.'));
    expect(await screen.findByText('My own wording.')).toBeInTheDocument();
  });

  it('cancelling changes nothing', () => {
    openEditor();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'discarded' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(saveSectionAnalysis).not.toHaveBeenCalled();
    expect(screen.getByText(/Revenue was SAR 424,095/)).toBeInTheDocument();
  });

  it('says what clearing the box does, since that removes it from the report', () => {
    openEditor();
    expect(screen.getByText(/removes these paragraphs from the report/)).toBeInTheDocument();
  });

  it('emptying the box drops the analysis entirely', async () => {
    openEditor();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveSectionAnalysis).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: 'Analyse' })).toBeInTheDocument();
  });
});

// ── 5. It is report content, so it renders in the report view ────────────────
// The whole point of moving it off `feeder`: these paragraphs print under the
// table, on the report page and in the exported document.

describe('the analysis as part of the section', () => {
  const withAnalysis = section({ analysis: RESULT });

  it('prints under the table on the report page', async () => {
    const { SectionContent } = await import('@/components/quarterly/SectionContent');
    const { container } = render(<SectionContent section={withAnalysis} showAnalysis />);
    const html = container.innerHTML;
    expect(html.indexOf('Revenue was SAR 424,095 for the quarter.')).toBeGreaterThan(html.indexOf('<table'));
    expect(screen.getByText(/Net income was SAR 122,188\./)).toBeInTheDocument();
  });

  it('splits on blank lines into real paragraphs, not one block', async () => {
    const { SectionContent } = await import('@/components/quarterly/SectionContent');
    const { container } = render(<SectionContent section={withAnalysis} showAnalysis />);
    expect(container.querySelectorAll('p').length).toBeGreaterThanOrEqual(2);
  });

  it('is left out where the controls render it instead', async () => {
    const { SectionContent } = await import('@/components/quarterly/SectionContent');
    render(<SectionContent section={withAnalysis} />);
    expect(screen.queryByText(/Revenue was SAR 424,095 for the quarter\./)).not.toBeInTheDocument();
  });

  it('changes nothing for a section that was never analysed', async () => {
    const { SectionContent } = await import('@/components/quarterly/SectionContent');
    const { container } = render(<SectionContent section={section()} showAnalysis />);
    expect(container.querySelector('table')).toBeInTheDocument();
    expect(container.querySelectorAll('p').length).toBe(0);
  });
});
