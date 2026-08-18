import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    saveEarningsOutline: vi.fn(),
    getEarningsSourceLines: vi.fn(),
    selectEarningsLines: vi.fn(),
    produceEarningsReport: vi.fn(),
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
  h.getEarningsOutline.mockResolvedValue(OUTLINE);
  h.saveEarningsOutline.mockResolvedValue(OUTLINE);
  h.produceEarningsReport.mockResolvedValue({ run_id: 'run-1', poll_url: '/api/v1/agent_runs/run-1' });
  h.getByPollUrl.mockResolvedValue({ run_id: 'run-1', status: 'completed', error_message: null });
  h.getNodes.mockResolvedValue({ nodes: [] });
  h.getEarningsSourceLines.mockResolvedValue({
    report_id: 'rep-1',
    section_code: 'financial_highlights',
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

  it('toggling an optional on, reordering, then Continue saves the new order + inclusion, produces every section, and only then navigates to preview', async () => {
    renderPage();
    await screen.findByText('Report sections');
    // Reorder: move Financial Highlights down → [CEO, FH].
    fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder Financial Highlights' }), { key: 'ArrowDown' });
    // Add Outlook → appended: [CEO, FH, Outlook].
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include Outlook' }));
    // Continue.
    fireEvent.click(screen.getByRole('button', { name: /Continue →/ }));
    await waitFor(() =>
      expect(h.saveEarningsOutline).toHaveBeenCalledWith('rep-1', {
        sections: [
          { section_code: 'ceo_commentary', included: true, display_order: 0 },
          { section_code: 'financial_highlights', included: true, display_order: 1 },
          { section_code: 'outlook', included: true, display_order: 2 },
          { section_code: 'segment_deep_dive', included: false, display_order: 0 },
        ],
      }),
    );
    // Section production starts — the AI loader takes over, never navigating early.
    await waitFor(() => expect(h.produceEarningsReport).toHaveBeenCalledWith('rep-1'));
    expect(await screen.findByText('Composing your report')).toBeInTheDocument();
    expect(h.navigateMock).not.toHaveBeenCalled();
    // Only once the run genuinely completes does it redirect to Preview.
    await waitFor(() => expect(h.navigateMock).toHaveBeenCalledWith('/earnings/rep-1/preview'), { timeout: 3000 });
  });

  it('skips production and navigates straight to Preview when every included section is already produced', async () => {
    // The decision reads the outline AS LOADED (before this save) — PUT's own
    // response resets status to 'pending' on every save (even a no-op), so it
    // can't be the signal; saveEarningsOutline's resolved value is irrelevant here.
    h.getEarningsOutline.mockResolvedValueOnce({
      sections: [
        sec({ section_code: 'financial_highlights', title: 'Financial Highlights', requirement: 'required', included: true, status: 'produced' }),
        sec({ section_code: 'ceo_commentary', title: 'CEO Commentary', included: true, status: 'needs_input' }),
        sec({ section_code: 'outlook', title: 'Outlook', included: false, available: true, status: 'pending' }),
      ],
    });
    renderPage();
    await screen.findByText('Report sections');
    fireEvent.click(screen.getByRole('button', { name: /Continue →/ }));
    await waitFor(() => expect(h.saveEarningsOutline).toHaveBeenCalled());
    // needs_input counts as already-attempted — never re-produced by Continue.
    expect(h.produceEarningsReport).not.toHaveBeenCalled();
    await waitFor(() => expect(h.navigateMock).toHaveBeenCalledWith('/earnings/rep-1/preview'));
  });

  it('still produces when a newly-included section has never been attempted (status: pending)', async () => {
    h.getEarningsOutline.mockResolvedValueOnce({
      sections: [
        sec({ section_code: 'financial_highlights', title: 'Financial Highlights', requirement: 'required', included: true, status: 'produced' }),
        sec({ section_code: 'outlook', title: 'Outlook', included: true, available: true, status: 'pending' }),
      ],
    });
    renderPage();
    await screen.findByText('Report sections');
    fireEvent.click(screen.getByRole('button', { name: /Continue →/ }));
    await waitFor(() => expect(h.produceEarningsReport).toHaveBeenCalledWith('rep-1'));
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

  it('a failed production run shows the failure screen with a working retry, never navigating to preview', async () => {
    h.getByPollUrl.mockResolvedValue({ run_id: 'run-1', status: 'failed', error_message: 'The pipeline crashed' });
    renderPage();
    await screen.findByText('Report sections');
    fireEvent.click(screen.getByRole('button', { name: /Continue →/ }));
    expect(await screen.findByText('Report generation failed')).toBeInTheDocument();
    expect(screen.getByText('The pipeline crashed')).toBeInTheDocument();
    expect(h.navigateMock).not.toHaveBeenCalled();

    // Retry drops back to the outline, ready for another Continue click.
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(await screen.findByText('Report sections')).toBeInTheDocument();
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
});


// ── The figure checklist lives here now, not on a screen of its own ──────────

describe('EarningsOutlinePage figure checklist', () => {
  const TABLE_OUTLINE = {
    sections: [
      sec({ section_code: 'financial_highlights', title: 'Financial Highlights',
            requirement: 'required', included: true, display_order: 0, mode: 'table' }),
      sec({ section_code: 'ceo_commentary', title: 'CEO Commentary',
            included: true, display_order: 1, mode: 'quote' }),
    ],
  };

  it('offers figures on a table section and not on a prose one', async () => {
    h.getEarningsOutline.mockResolvedValue(TABLE_OUTLINE);
    renderPage();
    await screen.findByText('Financial Highlights');

    // one Figures button, and it belongs to the table section
    const buttons = screen.getAllByRole('button', { name: 'Figures' });
    expect(buttons).toHaveLength(1);
  });

  it('opening a section loads that section\'s lines, scoped to it', async () => {
    h.getEarningsOutline.mockResolvedValue(TABLE_OUTLINE);
    renderPage();
    await screen.findByText('Financial Highlights');

    fireEvent.click(screen.getByRole('button', { name: 'Figures' }));
    await waitFor(() =>
      expect(h.getEarningsSourceLines).toHaveBeenCalledWith('rep-1', 'financial_highlights'),
    );
    expect(await screen.findByLabelText('Revenue')).toBeChecked();
    expect(screen.getByLabelText('Total assets')).not.toBeChecked();
  });

  it('saving sends the ticked ids AND the section, so other sections survive', async () => {
    h.getEarningsOutline.mockResolvedValue(TABLE_OUTLINE);
    renderPage();
    await screen.findByText('Financial Highlights');
    fireEvent.click(screen.getByRole('button', { name: 'Figures' }));

    fireEvent.click(await screen.findByLabelText('Total assets'));
    fireEvent.click(screen.getByRole('button', { name: 'Save selection' }));

    await waitFor(() =>
      expect(h.selectEarningsLines).toHaveBeenCalledWith(
        'rep-1', ['qf_1', 'qf_2'], 'financial_highlights',
      ),
    );
  });

  it('the panel closes again without re-fetching', async () => {
    h.getEarningsOutline.mockResolvedValue(TABLE_OUTLINE);
    renderPage();
    await screen.findByText('Financial Highlights');

    fireEvent.click(screen.getByRole('button', { name: 'Figures' }));
    await screen.findByLabelText('Revenue');
    fireEvent.click(screen.getByRole('button', { name: 'Hide figures' }));

    await waitFor(() => expect(screen.queryByLabelText('Revenue')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Figures' }));
    await screen.findByLabelText('Revenue');
    expect(h.getEarningsSourceLines).toHaveBeenCalledTimes(1);
  });
});
