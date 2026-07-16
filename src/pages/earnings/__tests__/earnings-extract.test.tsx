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

import { isFlagged, formatFigureValue, confidenceTier, needsReviewCount } from '../helpers';
import EarningsExtractPage from '../EarningsExtractPage';

const fig = (over: Record<string, unknown>) => ({
  id: 'x',
  metric_key: 'metric',
  label: 'Metric',
  value: 100,
  unit: 'SAR M',
  period: 'Q3 2025',
  source_document_id: 'd1',
  source_report_id: 'rep-d1',
  source_label: 'Q3 Release',
  source_ref: 'p. 3',
  confidence: 95,
  is_derived: false,
  derivation: null,
  flag: 'ok',
  edited: false,
  ...over,
});

// The report-shaped source object — GET /earnings/sources and the figures
// response's `sources` header return this same shape (report_id/label, not
// document_id/filename).
const source = (over: Record<string, unknown>) => ({
  report_id: 'rep-d1',
  label: 'Shell — Quarterly Report Q3-2025',
  report_type: 'quarterly',
  period: 'Q3-2025',
  updated_at: '2026-01-01T00:00:00Z',
  coverage: 'full',
  ...over,
});

const FIGS = {
  figures: [
    fig({ id: 'f-rev', metric_key: 'revenue', label: 'Revenue', value: 4182.6, confidence: 84, flag: 'flagged' }),
    fig({ id: 'f-ni', metric_key: 'net_income', label: 'Net Income', value: 1200, confidence: 96, flag: 'ok' }),
    fig({
      id: 'f-fcf',
      metric_key: 'free_cash_flow',
      label: 'Free Cash Flow',
      value: 800,
      confidence: 92,
      flag: 'ok',
      is_derived: true,
      derivation: 'OCF - CapEx',
      source_document_id: null,
      source_report_id: null,
      source_label: null,
      source_ref: null,
    }),
  ],
  sources: [source({})],
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
    fig({ id: 'f-rev', label: 'Revenue', value: 5000, confidence: null, flag: null, edited: true }),
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

describe('confidenceTier', () => {
  it('needs_input flag wins even with null confidence', () => {
    expect(confidenceTier(null, 'needs_input')).toBe('needs-input');
  });
  it('ok flag + null confidence → manual', () => {
    expect(confidenceTier(null, 'ok')).toBe('manual');
  });
  it('flagged + 84 confidence → amber or red, never manual/green', () => {
    const tier = confidenceTier(84, 'flagged');
    expect(['amber', 'red']).toContain(tier);
  });
  it('ok + 99 confidence → green', () => {
    expect(confidenceTier(99, 'ok')).toBe('green');
  });
});

describe('needsReviewCount', () => {
  it('counts flagged + needs_input, ignores ok', () => {
    const figs = [
      fig({ id: 'a', flag: 'flagged' }),
      fig({ id: 'b', flag: 'needs_input' }),
      fig({ id: 'c', flag: 'ok' }),
    ];
    expect(needsReviewCount(figs as never)).toBe(2);
  });
  it('all ok → 0', () => {
    const figs = [fig({ id: 'a', flag: 'ok' }), fig({ id: 'b', flag: 'ok' })];
    expect(needsReviewCount(figs as never)).toBe(0);
  });
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
    expect(await screen.findByText(/Continue with figures needing review\?/)).toBeInTheDocument();
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

  it('a needs_input row badges "Needs input", not "Manual", and drives the footer + confirm', async () => {
    h.getEarningsFigures.mockResolvedValueOnce({
      figures: [
        fig({ id: 'f-manual', label: 'Manual Metric', confidence: null, flag: 'ok', edited: true }),
        fig({ id: 'f-needs', label: 'Needs Input Metric', confidence: null, flag: 'needs_input' }),
      ],
      sources: [source({})],
    });
    renderPage();
    expect(await screen.findByText('Needs input')).toBeInTheDocument();
    expect(screen.getByText('Manual')).toBeInTheDocument();
    expect(screen.getByText('1 figure needs review')).toBeInTheDocument();
    expect(screen.queryByText('All figures reviewed')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Continue →/ }));
    expect(await screen.findByText(/Continue with figures needing review\?/)).toBeInTheDocument();
  });

  it('header shows the real source count even when every figure row is derived', async () => {
    h.getEarningsFigures.mockResolvedValueOnce({
      figures: [
        fig({
          id: 'f-d1',
          label: 'Derived A',
          is_derived: true,
          derivation: 'X + Y',
          source_document_id: null,
          source_report_id: null,
          source_label: null,
          source_ref: null,
        }),
        fig({
          id: 'f-d2',
          label: 'Derived B',
          is_derived: true,
          derivation: 'X - Y',
          source_document_id: null,
          source_report_id: null,
          source_label: null,
          source_ref: null,
        }),
      ],
      sources: [
        source({ report_id: 'rep-d1', label: 'Shell — Quarterly Report Q3-2025' }),
        source({ report_id: 'rep-d2', label: 'Shell — Prior Guidance', report_type: 'quarterly', coverage: 'partial' }),
      ],
    });
    renderPage();
    expect(await screen.findByText('Derived A')).toBeInTheDocument();
    expect(screen.getByText('2 sources')).toBeInTheDocument();
    expect(screen.queryByText('0 sources')).not.toBeInTheDocument();
    // SelectedSourcesHeader renders report labels, never a filename.
    expect(screen.getByText('Shell — Quarterly Report Q3-2025')).toBeInTheDocument();
    expect(screen.getByText('Shell — Prior Guidance')).toBeInTheDocument();
  });

  it('renders the empty-state message and no table when figures is empty', async () => {
    h.getEarningsFigures.mockResolvedValueOnce({ figures: [], sources: [] });
    renderPage();
    expect(
      await screen.findByText('No figures found for this period from the selected sources.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
