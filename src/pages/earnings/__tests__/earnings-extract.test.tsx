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
    getEarningsFigures: vi.fn(),
    patchEarningsFigure: vi.fn(),
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
    getEarningsFigures: (...a: unknown[]) => h.getEarningsFigures(...a),
    patchEarningsFigure: (...a: unknown[]) => h.patchEarningsFigure(...a),
  },
  ApiError: h.MockApiError,
}));

import { isFlagged, formatFigureValue } from '../helpers';
import EarningsExtractPage from '../EarningsExtractPage';

const fig = (over: Record<string, unknown>) => ({
  id: 'x',
  metric_key: 'metric',
  label: 'Metric',
  value: 100,
  unit: 'SAR M',
  period: 'Q3 2025',
  source_document_id: 'd1',
  source_label: 'Q3 Release',
  source_ref: 'p. 3',
  confidence: 95,
  is_derived: false,
  derivation: null,
  flag: null,
  edited: false,
  ...over,
});

const FIGS = {
  figures: [
    fig({ id: 'f-rev', metric_key: 'revenue', label: 'Revenue', value: 4182.6, confidence: 84 }),
    fig({ id: 'f-ni', metric_key: 'net_income', label: 'Net Income', value: 1200, confidence: 96 }),
    fig({
      id: 'f-fcf',
      metric_key: 'free_cash_flow',
      label: 'Free Cash Flow',
      value: 800,
      confidence: 92,
      is_derived: true,
      derivation: 'OCF - CapEx',
      source_document_id: null,
      source_label: null,
      source_ref: null,
    }),
  ],
  sources: [{ id: 'd1', title: 'Q3 Release.pdf', coverage: 'full', preview_url: null }],
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/earnings/rep-1/extract']}>
      <Routes>
        <Route path="/earnings/:reportId/extract" element={<EarningsExtractPage />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  h.userRef.current = { company_id: 'co-1', company_name: 'Acme' };
  h.getEarningsFigures.mockResolvedValue(FIGS);
  h.patchEarningsFigure.mockResolvedValue(
    fig({ id: 'f-rev', label: 'Revenue', value: 5000, confidence: null, edited: true }),
  );
});

// ── Unit ────────────────────────────────────────────────────────────────────
describe('isFlagged', () => {
  it('84 not-edited → true', () => expect(isFlagged(84, false)).toBe(true));
  it('99 not-edited → false', () => expect(isFlagged(99, false)).toBe(false));
  it('null + edited → false', () => expect(isFlagged(null, true)).toBe(false));
});

describe('formatFigureValue', () => {
  it('adds separators + unit', () => expect(formatFigureValue(4182.6, 'SAR M')).toBe('4,182.6 SAR M'));
  it('null → dash', () => expect(formatFigureValue(null, 'SAR M')).toBe('—'));
});

// ── Route/behaviour ─────────────────────────────────────────────────────────
describe('EarningsExtractPage', () => {
  it('renders the table incl. a Derived row and a <90 flagged row', async () => {
    renderPage();
    expect(await screen.findByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('Free Cash Flow')).toBeInTheDocument();
    expect(screen.getByText(/OCF - CapEx/)).toBeInTheDocument();
    // flagged row surfaces its confidence; a healthy row too
    expect(screen.getByText('84%')).toBeInTheDocument();
    expect(screen.getByText('96%')).toBeInTheDocument();
  });

  it('editing a value calls patchEarningsFigure and clears the flag', async () => {
    renderPage();
    const valueBtn = await screen.findByRole('button', { name: /4,182\.6/ });
    fireEvent.click(valueBtn);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '5000' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(h.patchEarningsFigure).toHaveBeenCalledWith('rep-1', 'f-rev', { value: 5000, unit: 'SAR M' }),
    );
    // 84% flag gone; the edited row now reads "Manual"
    await waitFor(() => expect(screen.queryByText('84%')).not.toBeInTheDocument());
    expect(screen.getByText('Manual')).toBeInTheDocument();
  });

  it('Continue with a remaining flag shows the confirm, then navigates on confirm', async () => {
    renderPage();
    await screen.findByText('Revenue');
    fireEvent.click(screen.getByRole('button', { name: /Continue →/ }));
    expect(await screen.findByText(/Continue with flagged figures\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Continue anyway/ }));
    expect(h.navigateMock).toHaveBeenCalledWith('/earnings/rep-1/outline');
  });

  it('Continue with no flags navigates directly', async () => {
    h.getEarningsFigures.mockResolvedValueOnce({
      figures: [fig({ id: 'f-ni', label: 'Net Income', confidence: 96 })],
      sources: [],
    });
    renderPage();
    await screen.findByText('Net Income');
    fireEvent.click(screen.getByRole('button', { name: /Continue →/ }));
    expect(screen.queryByText(/Continue with flagged figures\?/)).not.toBeInTheDocument();
    expect(h.navigateMock).toHaveBeenCalledWith('/earnings/rep-1/outline');
  });

  it('null companyId is guarded (no crash)', async () => {
    h.userRef.current = null;
    renderPage();
    expect(await screen.findByText('Extract earnings data')).toBeInTheDocument();
    expect(await screen.findByText('Revenue')).toBeInTheDocument();
  });
});
