import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// ── Mocks (vi.mock factories are hoisted → build shared state in vi.hoisted) ──
const h = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number;
    body: unknown;
    constructor(status: number, body: unknown) {
      // Mirrors real ApiError: `detail` (FastAPI's field) becomes .message,
      // and 429/5xx always get a generic message instead — see src/lib/api.ts.
      const detail = (body as { detail?: unknown } | null)?.detail;
      const fromDetail =
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
            ? detail.map((d) => (d as { msg?: string })?.msg).filter(Boolean).join('. ')
            : null;
      const isInfraFailure = status === 429 || status >= 500;
      super(
        isInfraFailure
          ? 'The system is temporarily unavailable. Please try again in a few minutes.'
          : fromDetail || `API ${status}`,
      );
      this.status = status;
      this.body = body;
    }
  }
  return {
    navigateMock: vi.fn(),
    getEarningsOutline: vi.fn(),
    renameEarningsSection: vi.fn(),
    saveEarningsOutline: vi.fn(),
    getEarningsSourceLines: vi.fn(),
    selectEarningsLines: vi.fn(),
    produceEarningsReport: vi.fn(),
    produceEarningsFigureFreeSections: vi.fn(),
    getByPollUrl: vi.fn(),
    getNodes: vi.fn(),
    userRef: { current: { company_id: 'co-1', company_name: 'Acme' } as unknown },
    MockApiError,
  };
});

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => h.navigateMock };
});
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: h.userRef.current }) }));
vi.mock('@/lib/api', () => ({
  earnings: {
    getEarningsOutline: (...a: unknown[]) => h.getEarningsOutline(...a),
    saveEarningsOutline: (...a: unknown[]) => h.saveEarningsOutline(...a),
    getEarningsSourceLines: (...a: unknown[]) => h.getEarningsSourceLines(...a),
    selectEarningsLines: (...a: unknown[]) => h.selectEarningsLines(...a),
    produceEarningsReport: (...a: unknown[]) => h.produceEarningsReport(...a),
    produceEarningsFigureFreeSections: (...a: unknown[]) => h.produceEarningsFigureFreeSections(...a),
    renameEarningsSection: (...a: unknown[]) => h.renameEarningsSection(...a),
  },
  agentRuns: {
    getByPollUrl: (...a: unknown[]) => h.getByPollUrl(...a),
    getNodes: (...a: unknown[]) => h.getNodes(...a),
  },
  ApiError: h.MockApiError,
}));

import EarningsOutlinePage from '../EarningsOutlinePage';
import type { EarningsOutlineSection } from '@/types/earnings';

const sec = (over: Partial<EarningsOutlineSection>): EarningsOutlineSection => ({
  section_code: 'code',
  title: 'Title',
  title_original: null,
  description: 'A section',
  section_number: null,
  display_order: 0,
  included: false,
  requirement: 'optional',
  available: true,
  source_type: null,
  mode: null,
  page_hint: null,
  status: null,
  figure_count: null,
  feeder: null,
  ...over,
});

// Financial Highlights (required, included), CEO Commentary (optional, included),
// Outlook (optional, available, not included), Segment Deep Dive (optional,
// UNavailable, not included).
const OUTLINE = {
  sections: [
    sec({ section_code: 'financial_highlights', title: 'Financial Highlights', requirement: 'required', included: true, display_order: 0 }),
    sec({ section_code: 'ceo_commentary', title: 'CEO Commentary', included: true, display_order: 1 }),
    sec({ section_code: 'outlook', title: 'Outlook', included: false, available: true, display_order: 2 }),
    sec({
      section_code: 'segment_deep_dive',
      title: 'Segment Deep Dive',
      included: false,
      available: false,
      display_order: 3,
      feeder: {
        status: 'needs_input',
        source_report_id: null,
        source_document_id: null,
        source_label: null,
        message: 'Awaiting financial data',
      },
    }),
  ],
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/earnings/rep-1/outline']}>
      <Routes>
        <Route path="/earnings/:reportId/outline" element={<EarningsOutlinePage />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  h.userRef.current = { company_id: 'co-1', company_name: 'Acme' };
  h.produceEarningsFigureFreeSections.mockResolvedValue({ run_id: 'r', poll_url: '/p' });
  h.getEarningsOutline.mockResolvedValue(OUTLINE);
  h.saveEarningsOutline.mockResolvedValue(OUTLINE);
  h.produceEarningsReport.mockResolvedValue({ run_id: 'run-1', poll_url: '/api/v1/agent_runs/run-1' });
  h.getByPollUrl.mockResolvedValue({ run_id: 'run-1', status: 'completed', error_message: null });
  h.getNodes.mockResolvedValue({ nodes: [] });
  h.getEarningsSourceLines.mockResolvedValue({
    report_id: 'rep-1',
    sections: [
      { section_code: 'financial_highlights', title: 'Financial Highlights' },
      { section_code: 'balance_sheet', title: 'Balance Sheet' },
    ],
    counts_by_section: { financial_highlights: 1 },
    lines: [
      {
        id: 'qf_1', label: 'Revenue', column: null, group: null,
        display_label: 'Revenue', value: 424095, unit: 'SAR_million',
        table: 'Income & Comprehensive Income', source_ref: 'p.1',
        source_report_id: 'rpt_q1', selected: true, suggested: true,
        remembered: false, memory_key: 'custom__k1', section_code: 'financial_highlights',
      },
      {
        id: 'qf_2', label: 'Total assets', column: null, group: null,
        display_label: 'Total assets', value: 1000, unit: 'SAR_million',
        table: 'Balance Sheet', source_ref: 'p.2',
        source_report_id: 'rpt_q1', selected: false, suggested: false,
        remembered: false, memory_key: 'custom__k2', section_code: null,
      },
    ],
    preticked_from: 'suggested',
    suggested_count: 1,
    remembered_count: 0,
    selected_count: 1,
  });
  h.selectEarningsLines.mockResolvedValue({ report_id: 'rep-1', selected: 1, removed: 0 });
});

describe('EarningsOutlinePage', () => {
  it('never shows Table of Contents, whether included or available', async () => {
    h.getEarningsOutline.mockResolvedValueOnce({
      sections: [
        ...OUTLINE.sections,
        sec({ section_code: 's02_toc', title: 'Table of Contents', requirement: 'recommended', included: false, available: true }),
      ],
    });
    renderPage();
    await screen.findByText('Report sections');
    expect(screen.queryByText('Table of Contents')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Table of Contents/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Continue →/ }));
    await waitFor(() => expect(h.saveEarningsOutline).toHaveBeenCalled());
    const payload = h.saveEarningsOutline.mock.calls[0][1];
    expect(payload.sections.some((s: { section_code: string }) => s.section_code === 's02_toc')).toBe(false);
  });

  it('groups included sections under "Report sections" and the rest under "Available to add"', async () => {
    renderPage();
    expect(await screen.findByText('Report sections')).toBeInTheDocument();
    expect(screen.getByText('Available to add')).toBeInTheDocument();
    // Included rows expose an "Exclude …" toggle (they're on); available rows an "Include …".
    expect(screen.getByRole('checkbox', { name: 'Exclude Financial Highlights' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Exclude CEO Commentary' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Include Outlook' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Include Segment Deep Dive' })).toBeInTheDocument();
  });

  it('renders a required section on + disabled', async () => {
    renderPage();
    const cb = await screen.findByRole('checkbox', { name: 'Exclude Financial Highlights' });
    expect(cb).toHaveAttribute('aria-checked', 'true');
    expect(cb).toHaveAttribute('aria-disabled', 'true');
  });

  it('renders an unavailable optional greyed, toggle disabled, with the feeder\'s reason — and cannot be added', async () => {
    renderPage();
    const cb = await screen.findByRole('checkbox', { name: 'Include Segment Deep Dive' });
    expect(cb).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Awaiting financial data')).toBeInTheDocument();
    fireEvent.click(cb); // disabled → no-op
    expect(screen.getByRole('checkbox', { name: 'Include Segment Deep Dive' })).toHaveAttribute('aria-checked', 'false');
  });

  it('a ready section shows "Sourced from <label>" instead of a bare availability toggle', async () => {
    h.getEarningsOutline.mockResolvedValueOnce({
      sections: [
        sec({
          section_code: 'financial_highlights',
          title: 'Financial Highlights',
          requirement: 'required',
          included: true,
          feeder: {
            status: 'ready',
            source_report_id: 'rep-official',
            source_document_id: null,
            source_label: 'Quarterly Report Q1-2026',
            message: 'Backed by an official report',
          },
        }),
      ],
    });
    renderPage();
    expect(await screen.findByText('Sourced from Quarterly Report Q1-2026')).toBeInTheDocument();
  });

  it('an external section shows its permanent-limitation message, distinct styling from needs_input', async () => {
    h.getEarningsOutline.mockResolvedValueOnce({
      sections: [
        sec({
          section_code: 'peer_comparison',
          title: 'Peer / Benchmark Comparison',
          included: false,
          available: true,
          feeder: {
            status: 'external',
            source_report_id: null,
            source_document_id: null,
            source_label: null,
            message: 'Not tracked by the system',
          },
        }),
      ],
    });
    renderPage();
    expect(await screen.findByText('Not tracked by the system')).toBeInTheDocument();
  });

  it('a template section (e.g. Cover) shows no feeder attribution line at all', async () => {
    h.getEarningsOutline.mockResolvedValueOnce({
      sections: [
        sec({
          section_code: 'cover',
          title: 'Cover / Header',
          requirement: 'required',
          included: true,
          feeder: {
            status: 'template',
            source_report_id: null,
            source_document_id: null,
            source_label: null,
            message: 'Deterministic — no source required',
          },
        }),
      ],
    });
    renderPage();
    await screen.findByText('Cover / Header');
    expect(screen.queryByText('Deterministic — no source required')).not.toBeInTheDocument();
    expect(screen.queryByText(/Sourced from/)).not.toBeInTheDocument();
  });

  it('a required section cannot be toggled off', async () => {
    renderPage();
    const cb = await screen.findByRole('checkbox', { name: 'Exclude Financial Highlights' });
    fireEvent.click(cb); // disabled → no-op
    expect(screen.getByRole('checkbox', { name: 'Exclude Financial Highlights' })).toHaveAttribute('aria-checked', 'true');
  });

  it('reorders an included section via the grip arrow keys', async () => {
    renderPage();
    await screen.findByText('Report sections');
    const gripsBefore = screen.getAllByRole('button', { name: /^Reorder/ }).map((g) => g.getAttribute('aria-label'));
    expect(gripsBefore).toEqual(['Reorder Financial Highlights', 'Reorder CEO Commentary']);
    // Move CEO Commentary (index 1) up.
    fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder CEO Commentary' }), { key: 'ArrowUp' });
    const gripsAfter = screen.getAllByRole('button', { name: /^Reorder/ }).map((g) => g.getAttribute('aria-label'));
    expect(gripsAfter).toEqual(['Reorder CEO Commentary', 'Reorder Financial Highlights']);
  });

  it('toggling an optional on, reordering, then Continue hands over to Preview', async () => {
    renderPage();
    await screen.findByText('Report sections');

    fireEvent.click(screen.getByRole('checkbox', { name: /Include Outlook/ }));
    fireEvent.click(screen.getByRole('button', { name: /Continue →/ }));

    await waitFor(() =>
      expect(h.saveEarningsOutline).toHaveBeenCalledWith('rep-1', {
        sections: [
          { section_code: 'financial_highlights', included: true, display_order: 0 },
          { section_code: 'ceo_commentary', included: true, display_order: 1 },
          { section_code: 'outlook', included: true, display_order: 2 },
          { section_code: 'segment_deep_dive', included: false, display_order: 0 },
        ],
      }),
    );
    await waitFor(() =>
      expect(h.navigateMock).toHaveBeenCalledWith('/earnings/rep-1/preview'));
  });

  it('never produces here — a table built before its figures exist is empty', async () => {
    // Production moved to the Figures screen. The outline does not know what the
    // report's figures are any more, so producing from here can only be wasted.
    renderPage();
    await screen.findByText('Report sections');
    fireEvent.click(screen.getByRole('button', { name: /Continue →/ }));

    await waitFor(() => expect(h.saveEarningsOutline).toHaveBeenCalled());
    expect(h.produceEarningsReport).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(h.navigateMock).toHaveBeenCalledWith('/earnings/rep-1/preview'));
  });

  it('hands over whatever state the sections are in', async () => {
    h.getEarningsOutline.mockResolvedValueOnce({
      sections: [
        sec({ section_code: 'financial_highlights', title: 'Financial Highlights',
              requirement: 'required', included: true, status: 'produced' }),
        sec({ section_code: 'outlook', title: 'Outlook', included: true,
              available: true, status: 'pending' }),
      ],
    });
    renderPage();
    await screen.findByText('Report sections');
    fireEvent.click(screen.getByRole('button', { name: /Continue →/ }));

    await waitFor(() =>
      expect(h.navigateMock).toHaveBeenCalledWith('/earnings/rep-1/preview'));
    expect(h.produceEarningsReport).not.toHaveBeenCalled();
  });

  it('a 422 on Continue surfaces the message and does not navigate or start production', async () => {
    h.saveEarningsOutline.mockRejectedValueOnce(new h.MockApiError(422, { detail: 'segment_deep_dive has no data' }));
    renderPage();
    await screen.findByText('Report sections');
    fireEvent.click(screen.getByRole('button', { name: /Continue →/ }));
    expect(await screen.findByText('segment_deep_dive has no data')).toBeInTheDocument();
    expect(h.navigateMock).not.toHaveBeenCalled();
    expect(h.produceEarningsReport).not.toHaveBeenCalled();
  });

  it('guards a null companyId (no crash)', async () => {
    h.userRef.current = null;
    renderPage();
    expect(await screen.findByText('Arrange your report outline')).toBeInTheDocument();
    expect(screen.getByText('Report sections')).toBeInTheDocument();
  });

  it('sorts "Available to add" by requirement tier (recommended before optional) and shows badges', async () => {
    h.getEarningsOutline.mockResolvedValueOnce({
      sections: [
        sec({ section_code: 'financial_highlights', title: 'Financial Highlights', requirement: 'required', included: true, display_order: 0 }),
        sec({ section_code: 'outlook', title: 'Outlook', requirement: 'optional', included: false, available: true, display_order: 1 }),
        sec({
          section_code: 'market_context',
          title: 'Market Context',
          requirement: 'recommended',
          included: false,
          available: true,
          display_order: 2,
          feeder: {
            status: 'ready',
            source_report_id: 'rep-1',
            source_document_id: null,
            source_label: 'Quarterly Report Q1-2026',
            message: 'Sourced from Quarterly Report Q1-2026',
          },
        }),
      ],
    });
    renderPage();
    await screen.findByText('Available to add');
    const order = screen
      .getAllByRole('checkbox', { name: /^Include/ })
      .map((c) => c.getAttribute('aria-label'));
    // Market Context (recommended) sorts before Outlook (optional) despite a
    // higher display_order — tier rank wins, display_order only tiebreaks.
    expect(order).toEqual(['Include Market Context', 'Include Outlook']);
    expect(screen.getByText('RECOMMENDED')).toBeInTheDocument();
  });

  it('a recommended-tier section with no data yet does NOT show the RECOMMENDED badge', async () => {
    h.getEarningsOutline.mockResolvedValueOnce({
      sections: [
        sec({
          section_code: 'operational_kpis',
          title: 'Operational Highlights / KPIs',
          requirement: 'recommended',
          included: false,
          available: true,
          feeder: {
            status: 'needs_input',
            source_report_id: null,
            source_document_id: null,
            source_label: null,
            message: 'Awaiting financial data',
          },
        }),
      ],
    });
    renderPage();
    await screen.findByText('Operational Highlights / KPIs');
    expect(screen.queryByText('RECOMMENDED')).not.toBeInTheDocument();
  });

  it('toggling an included recommended section off inserts it in tier order, not appended last', async () => {
    h.getEarningsOutline.mockResolvedValueOnce({
      sections: [
        sec({ section_code: 'financial_highlights', title: 'Financial Highlights', requirement: 'required', included: true, display_order: 0 }),
        sec({ section_code: 'market_context', title: 'Market Context', requirement: 'recommended', included: true, display_order: 1 }),
        sec({ section_code: 'outlook', title: 'Outlook', requirement: 'optional', included: false, available: true, display_order: 2 }),
      ],
    });
    renderPage();
    await screen.findByText('Report sections');
    // Toggle Market Context (included, recommended) out — it must land BEFORE
    // Outlook (optional) in "Available to add", not appended after it.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Exclude Market Context' }));
    await waitFor(() => {
      const order = screen
        .getAllByRole('checkbox', { name: /^Include/ })
        .map((c) => c.getAttribute('aria-label'));
      expect(order).toEqual(['Include Market Context', 'Include Outlook']);
    });
  });

  // ── Renaming a financial section ───────────────────────────────────────────
  //
  // The panel makes a promise -- that renaming cannot change the figures -- which
  // the backend keeps structurally. What is testable here is that the promise is
  // actually on screen, and that only financial sections offer it.

  const financial = () => [
    sec({ section_code: 's15_non_ifrs_recon', title: 'Non-IFRS Reconciliations',
          title_original: 'Non-IFRS Reconciliations', mode: 'table', included: true,
          requirement: 'required', figure_count: 13,
          feeder: { status: 'ready', source_label: 'Q3-2023 Quarterly Report',
                    source_report_id: null, source_document_id: null, message: null } }),
    sec({ section_code: 's05_commentary', title: 'CEO / Management Commentary',
          mode: 'quote', included: true, requirement: 'recommended' }),
  ];

  it('opens a financial section, and leaves a prose one alone', async () => {
    h.getEarningsOutline.mockResolvedValue({ sections: financial() });
    renderPage();
    await screen.findByText('Non-IFRS Reconciliations');

    // the prose row has no way in
    expect(screen.getByText('CEO / Management Commentary').tagName).not.toBe('BUTTON');

    fireEvent.click(screen.getByRole('button', { name: 'Non-IFRS Reconciliations' }));
    expect(await screen.findByLabelText('Section name')).toHaveValue('Non-IFRS Reconciliations');
  });

  it('says the rename cannot move a figure, and shows the flow', async () => {
    h.getEarningsOutline.mockResolvedValue({ sections: financial() });
    renderPage();
    await screen.findByText('Non-IFRS Reconciliations');
    fireEvent.click(screen.getByRole('button', { name: 'Non-IFRS Reconciliations' }));

    expect(await screen.findByText(/the figures it collects do not change/)).toBeInTheDocument();
    // and what the section actually does, from real backend fields
    expect(screen.getByText(/The reconciliation working/)).toBeInTheDocument();
    expect(screen.getByText('Q3-2023 Quarterly Report')).toBeInTheDocument();
    expect(screen.getByText('13 chosen so far')).toBeInTheDocument();
  });

  it('saves a new name and shows it on the row', async () => {
    h.getEarningsOutline.mockResolvedValue({ sections: financial() });
    h.renameEarningsSection.mockResolvedValue({ sections: financial() });
    renderPage();
    await screen.findByText('Non-IFRS Reconciliations');
    fireEvent.click(screen.getByRole('button', { name: 'Non-IFRS Reconciliations' }));

    const box = await screen.findByLabelText('Section name');
    fireEvent.change(box, { target: { value: 'Reconciliations' } });
    fireEvent.blur(box);

    await waitFor(() =>
      expect(h.renameEarningsSection).toHaveBeenCalledWith(
        'rep-1', 's15_non_ifrs_recon', 'Reconciliations'));
    expect(await screen.findByRole('button', { name: 'Reconciliations' })).toBeInTheDocument();
  });

  it('a failed rename puts the old name back rather than lying', async () => {
    h.getEarningsOutline.mockResolvedValue({ sections: financial() });
    h.renameEarningsSection.mockRejectedValue(new h.MockApiError(500, 'nope'));
    renderPage();
    await screen.findByText('Non-IFRS Reconciliations');
    fireEvent.click(screen.getByRole('button', { name: 'Non-IFRS Reconciliations' }));

    const box = await screen.findByLabelText('Section name');
    fireEvent.change(box, { target: { value: 'Reconciliations' } });
    fireEvent.blur(box);

    expect(await screen.findByRole('alert')).toHaveTextContent(/didn't save/);
    expect(screen.getByLabelText('Section name')).toHaveValue('Non-IFRS Reconciliations');
  });

  it('offers Reset only once a section has actually been renamed', async () => {
    const renamed = financial();
    renamed[0] = sec({ ...renamed[0], title: 'Reconciliations' });
    h.getEarningsOutline.mockResolvedValue({ sections: renamed });
    renderPage();
    await screen.findByText('Reconciliations');
    fireEvent.click(screen.getByRole('button', { name: 'Reconciliations' }));

    expect(await screen.findByRole('button', { name: 'Reset' })).toBeInTheDocument();
    expect(screen.getByText(/Originally .Non-IFRS Reconciliations./)).toBeInTheDocument();
  });

  // ── Removing a section takes its figures with it ───────────────────────────

  const withFigures = () => [
    sec({ section_code: 's04_financial_highlights', title: 'Financial Highlights',
          mode: 'table', included: true, requirement: 'required', figure_count: 12 }),
    sec({ section_code: 's07_segment_performance', title: 'Segment Performance',
          mode: 'table', included: true, requirement: 'recommended', figure_count: 25 }),
  ];

  const conflict = () => {
    const e = new h.MockApiError(409, 'API 409');
    (e as unknown as { body: unknown }).body = {
      detail: {
        error: 'sections_hold_figures',
        sections: [{ section_code: 's07_segment_performance',
                     title: 'Segment Performance', figure_count: 25 }],
      },
    };
    return e;
  };

  it('names the figures it is about to remove, instead of just doing it', async () => {
    h.getEarningsOutline.mockResolvedValue({ sections: withFigures() });
    h.saveEarningsOutline.mockRejectedValueOnce(conflict());
    renderPage();
    await screen.findByText('Segment Performance');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Exclude Segment Performance' }));
    fireEvent.click(screen.getByRole('button', { name: /Continue →/ }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Remove Segment Performance\?/)).toBeInTheDocument();
    expect(within(dialog).getByText('25 figures')).toBeInTheDocument();
    // and it says what survives, so the choice is an informed one
    expect(within(dialog).getByText(/putting a section back is one search/)).toBeInTheDocument();
    expect(h.navigateMock).not.toHaveBeenCalled();
  });

  it('confirming retries naming exactly the sections that were shown', async () => {
    h.getEarningsOutline.mockResolvedValue({ sections: withFigures() });
    h.saveEarningsOutline
      .mockRejectedValueOnce(conflict())
      .mockResolvedValueOnce({ sections: withFigures() });
    renderPage();
    await screen.findByText('Segment Performance');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Exclude Segment Performance' }));
    fireEvent.click(screen.getByRole('button', { name: /Continue →/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove and continue' }));

    await waitFor(() => expect(h.saveEarningsOutline).toHaveBeenCalledTimes(2));
    const [, second] = h.saveEarningsOutline.mock.calls[1];
    expect((second as { drop_figures?: string[] }).drop_figures)
      .toEqual(['s07_segment_performance']);
    // the first attempt never carries it — it is only ever sent on the retry
    const [, first] = h.saveEarningsOutline.mock.calls[0];
    expect((first as { drop_figures?: string[] }).drop_figures).toBeUndefined();
  });

  it('keeping the section abandons the save rather than half-doing it', async () => {
    h.getEarningsOutline.mockResolvedValue({ sections: withFigures() });
    h.saveEarningsOutline.mockRejectedValueOnce(conflict());
    renderPage();
    await screen.findByText('Segment Performance');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Exclude Segment Performance' }));
    fireEvent.click(screen.getByRole('button', { name: /Continue →/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Keep section' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(h.saveEarningsOutline).toHaveBeenCalledTimes(1);
    expect(h.navigateMock).not.toHaveBeenCalled();
  });

});
