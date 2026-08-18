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
    getEarningsSourceLines: vi.fn(),
    selectEarningsLines: vi.fn(),
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
    getEarningsSourceLines: (...a: unknown[]) => h.getEarningsSourceLines(...a),
    selectEarningsLines: (...a: unknown[]) => h.selectEarningsLines(...a),
  },
  ApiError: h.MockApiError,
}));

import { isFlagged, formatFigureValue, confidenceTier, needsReviewCount, formatDelta, deltaTone } from '../helpers';
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
  prior_value: null,
  prior_period: null,
  change_pct: null,
  comparative_status: 'none',
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

describe('formatDelta', () => {
  it('(0.114, "yoy") → "+11.4%"', () => expect(formatDelta(0.114, 'yoy')).toBe('+11.4%'));
  it('(null, "none") → "—"', () => expect(formatDelta(null, 'none')).toBe('—'));
  it('(-0.05, "yoy") → "-5.0%" (single sign)', () => expect(formatDelta(-0.05, 'yoy')).toBe('-5.0%'));
  it('null comparative_status (absent) → "—", never fabricated', () => {
    expect(formatDelta(0.05, null)).toBe('—');
  });
});

describe('deltaTone', () => {
  it('up/down/flat/null cases', () => {
    expect(deltaTone(0.114, 'yoy')).toBe('up');
    expect(deltaTone(-0.05, 'yoy')).toBe('down');
    expect(deltaTone(0, 'yoy')).toBe('flat');
    expect(deltaTone(null, 'none')).toBe(null);
  });
});

// ── Route/behaviour ─────────────────────────────────────────────────────────
describe('EarningsExtractPage', () => {
  // Step 2 is now ONE thing: a checklist of the source quarterly report's own
  // lines, with a model's picks pre-ticked. No auto-matched figures table, no
  // typed values — ticking is the only way a figure gets into the report.
  const line = (over: Record<string, unknown>) => ({
    id: 'l1', label: 'Revenue', column: null, group: null, display_label: 'Revenue',
    value: 424095, unit: 'SAR_million', table: 'Income & Comprehensive Income',
    source_ref: 'p.1', source_report_id: 'rpt_q1', selected: false, suggested: false,
    ...over,
  });

  const renderPage = () =>
    render(
      <MemoryRouter initialEntries={['/earnings/rpt-1/extract']}>
        <Routes>
          <Route path="/earnings/:reportId/extract" element={<EarningsExtractPage />} />
        </Routes>
      </MemoryRouter>,
    );

  beforeEach(() => {
    h.navigateMock.mockReset();
    h.getEarningsSourceLines.mockReset().mockResolvedValue({
      report_id: 'rpt-1',
      lines: [
        line({ id: 'l1', selected: true, suggested: true }),
        line({ id: 'l2', label: 'Total assets', display_label: 'Total assets',
               value: 2515523, table: 'Balance Sheet' }),
      ],
      suggested_count: 1,
    });
    h.selectEarningsLines.mockReset().mockResolvedValue({});
  });

  it('renders the checklist with the model picks already ticked', async () => {
    renderPage();
    expect(await screen.findByLabelText('Revenue')).toBeChecked();
    expect(screen.getByLabelText('Total assets')).not.toBeChecked();
    expect(screen.getByText('1 of 2 selected')).toBeInTheDocument();
  });

  it('saves the ticked set in one call', async () => {
    renderPage();
    fireEvent.click(await screen.findByLabelText('Total assets'));
    fireEvent.click(screen.getByRole('button', { name: /save selection/i }));

    await waitFor(() => expect(h.selectEarningsLines).toHaveBeenCalledTimes(1));
    expect(new Set(h.selectEarningsLines.mock.calls[0][1])).toEqual(new Set(['l1', 'l2']));
  });

  it('Continue goes straight on — there is nothing left to review', async () => {
    renderPage();
    await screen.findByLabelText('Revenue');
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(h.navigateMock).toHaveBeenCalledWith('/earnings/rpt-1/outline');
  });

  it('a failed load is surfaced, with a retry', async () => {
    h.getEarningsSourceLines.mockRejectedValue(new h.MockApiError(500, null));
    renderPage();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
