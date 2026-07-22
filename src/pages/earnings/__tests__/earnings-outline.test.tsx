import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// ── Mocks (vi.mock factories are hoisted → build shared state in vi.hoisted) ──
const h = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number;
    body: unknown;
    constructor(status: number, body: unknown) {
      super(`API ${status}`);
      this.status = status;
      this.body = body;
    }
  }
  return {
    navigateMock: vi.fn(),
    getEarningsOutline: vi.fn(),
    saveEarningsOutline: vi.fn(),
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
    sec({ section_code: 'segment_deep_dive', title: 'Segment Deep Dive', included: false, available: false, display_order: 3 }),
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
});

describe('EarningsOutlinePage', () => {
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

  it('renders an unavailable optional greyed, toggle disabled, with a reason — and cannot be added', async () => {
    renderPage();
    const cb = await screen.findByRole('checkbox', { name: 'Include Segment Deep Dive' });
    expect(cb).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('No data for this section')).toBeInTheDocument();
    fireEvent.click(cb); // disabled → no-op
    expect(screen.getByRole('checkbox', { name: 'Include Segment Deep Dive' })).toHaveAttribute('aria-checked', 'false');
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
        sec({ section_code: 'market_context', title: 'Market Context', requirement: 'recommended', included: false, available: true, display_order: 2 }),
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
