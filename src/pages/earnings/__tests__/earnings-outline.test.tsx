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

  it('toggling an optional on, reordering, then Continue saves the new order + inclusion and navigates to preview', async () => {
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
    await waitFor(() => expect(h.navigateMock).toHaveBeenCalledWith('/earnings/rep-1/preview'));
  });

  it('a 422 on Continue surfaces the message and does not navigate', async () => {
    h.saveEarningsOutline.mockRejectedValueOnce(new h.MockApiError(422, { detail: 'segment_deep_dive has no data' }));
    renderPage();
    await screen.findByText('Report sections');
    fireEvent.click(screen.getByRole('button', { name: /Continue →/ }));
    expect(await screen.findByText('segment_deep_dive has no data')).toBeInTheDocument();
    expect(h.navigateMock).not.toHaveBeenCalled();
  });

  it('guards a null companyId (no crash)', async () => {
    h.userRef.current = null;
    renderPage();
    expect(await screen.findByText('Arrange your report outline')).toBeInTheDocument();
    expect(screen.getByText('Report sections')).toBeInTheDocument();
  });
});
