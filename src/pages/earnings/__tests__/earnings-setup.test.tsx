import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ── Mocks ────────────────────────────────────────────────────────────────────
// vi.mock factories are hoisted above module scope, so anything they reference
// must be created inside vi.hoisted().
const h = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number;
    statusText: string;
    body: unknown;
    url: string;
    constructor(status: number, statusText: string, body: unknown, url: string) {
      super(`API ${status}`);
      this.status = status;
      this.statusText = statusText;
      this.body = body;
      this.url = url;
    }
  }
  return {
    navigateMock: vi.fn(),
    getSelectableSources: vi.fn(),
    createEarningsReport: vi.fn(),
    uploadDocs: vi.fn(),
    MockApiError,
  };
});

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => h.navigateMock };
});

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { company_id: 'co-1', company_name: 'Acme' } }),
}));

vi.mock('@/lib/api', async () => {
  // Spread the real module so normalizeEarningsSourceItem stays the actual
  // implementation under test — only earnings/documents are mocked out.
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    earnings: {
      getSelectableSources: (...a: unknown[]) => h.getSelectableSources(...a),
      createEarningsReport: (...a: unknown[]) => h.createEarningsReport(...a),
    },
    documents: { upload: (...a: unknown[]) => h.uploadDocs(...a) },
    ApiError: h.MockApiError,
  };
});

const { navigateMock, getSelectableSources, createEarningsReport, MockApiError } = h;

import { formatPeriodLabel, canContinue } from '../helpers';
import { normalizeEarningsSourceItem } from '@/lib/api';
import EarningsSetupPage from '../EarningsSetupPage';
import { ToneSelector } from '@/components/earnings/ToneSelector';
import { DEFAULT_EARNINGS_TONE } from '@/components/earnings/tones';

const renderSetup = () =>
  render(
    <MemoryRouter>
      <EarningsSetupPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  getSelectableSources.mockResolvedValue({
    sources: [
      {
        report_id: 'rep-1',
        label: 'Acme — FY24 Annual Report',
        report_type: 'annual',
        period: 'FY 2024',
        updated_at: '2026-01-01T00:00:00Z',
        coverage: 'full',
      },
      {
        report_id: 'rep-2',
        label: 'Acme — Q3 2024 Quarterly Report',
        report_type: 'quarterly',
        period: 'Q3 2024',
        updated_at: '2026-01-01T00:00:00Z',
        coverage: 'partial',
      },
    ],
  });
  createEarningsReport.mockResolvedValue({ report_id: 'rep-99' });
});

// ── Unit: pure helpers ──────────────────────────────────────────────────────
describe('formatPeriodLabel', () => {
  it('annual → FY <year>', () => {
    expect(formatPeriodLabel('annual', 2025)).toBe('FY 2025');
  });
  it('quarterly → Q<q> <year>', () => {
    expect(formatPeriodLabel('quarterly', 2025, 3)).toBe('Q3 2025');
  });
});

describe('canContinue', () => {
  const base = {
    variant: 'annual' as const,
    fiscalYear: 2025,
    quarter: null,
    tone: 'investor_focused' as const,
    sourceIds: ['doc-1'],
  };
  it('true when type + period + tone + ≥1 source', () => {
    expect(canContinue(base)).toBe(true);
  });
  it('false when no source selected', () => {
    expect(canContinue({ ...base, sourceIds: [] })).toBe(false);
  });
  it('false when no tone selected', () => {
    expect(canContinue({ ...base, tone: null })).toBe(false);
  });
  it('quarterly false without a quarter', () => {
    expect(canContinue({ ...base, variant: 'quarterly', quarter: null })).toBe(false);
  });
});

// ── Unit: sources normalizer — regression for the report/document skew ──────
describe('normalizeEarningsSourceItem', () => {
  it('parses the confirmed live payload (report_id/label, not document_id/filename)', () => {
    const parsed = normalizeEarningsSourceItem({
      report_id: 'c0c38900-348f-4752-b68f-af9246aa1b97',
      label: 'Shell — Quarterly Report Q4-2023',
      report_type: 'quarterly',
      period: 'Q4-2023',
      updated_at: '2026-07-16T09:32:07.098811+00:00',
      coverage: 'full',
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.report_id).toBe('c0c38900-348f-4752-b68f-af9246aa1b97');
    expect(parsed?.label).toBe('Shell — Quarterly Report Q4-2023');
  });

  it('drops an item with no report_id (defensive, not fabricated)', () => {
    expect(normalizeEarningsSourceItem({ label: 'Orphan', coverage: 'full' })).toBeNull();
  });
});

// ── Component: ToneSelector default ─────────────────────────────────────────
describe('ToneSelector', () => {
  it('renders Investor-focused as the pre-selected default', () => {
    render(<ToneSelector value={DEFAULT_EARNINGS_TONE} onChange={() => {}} />);
    expect(DEFAULT_EARNINGS_TONE).toBe('investor_focused');
    const btn = screen.getByRole('button', { name: 'Investor-focused' });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });
});

// ── Route/behaviour ─────────────────────────────────────────────────────────
describe('EarningsSetupPage', () => {
  it('Annual shows the fiscal-year field only (no quarter control)', () => {
    renderSetup();
    fireEvent.click(screen.getByRole('button', { name: /Annual Earnings Report/i }));
    expect(screen.getByText('Fiscal Year')).toBeInTheDocument();
    expect(screen.queryByText('Quarter')).not.toBeInTheDocument();
  });

  it('Quarterly shows fiscal-year + quarter', () => {
    renderSetup();
    fireEvent.click(screen.getByRole('button', { name: /Quarterly Earnings Report/i }));
    expect(screen.getByText('Fiscal Year')).toBeInTheDocument();
    expect(screen.getByText('Quarter')).toBeInTheDocument();
  });

  it('existing-reports mode loads sources with Full/Partial badges once a period is set', async () => {
    renderSetup();
    fireEvent.click(screen.getByRole('button', { name: /Annual Earnings Report/i }));
    fireEvent.change(screen.getByDisplayValue('Select fiscal year…'), { target: { value: '2025' } });
    await waitFor(() => expect(getSelectableSources).toHaveBeenCalledWith('co-1', 'FY-2025'));
    expect(await screen.findByText('Acme — FY24 Annual Report')).toBeInTheDocument();
    expect(screen.getByText('Full')).toBeInTheDocument();
    expect(screen.getByText('Partial')).toBeInTheDocument();
  });

  // Regression for the bug this spec fixes: the backend's confirmed live
  // payload uses report_id/label, not document_id/filename. Before the fix
  // this rendered the empty state against a response with a valid source.
  it('renders the confirmed live report-shaped payload as one selectable row — not the empty state', async () => {
    getSelectableSources.mockResolvedValueOnce({
      sources: [
        {
          report_id: 'c0c38900-348f-4752-b68f-af9246aa1b97',
          label: 'Shell — Quarterly Report Q4-2023',
          report_type: 'quarterly',
          period: 'Q4-2023',
          updated_at: '2026-07-16T09:32:07.098811+00:00',
          coverage: 'full',
        },
      ],
      total: 1,
    });
    renderSetup();
    fireEvent.click(screen.getByRole('button', { name: /Quarterly Earnings Report/i }));
    fireEvent.change(screen.getByDisplayValue('Select fiscal year…'), { target: { value: '2023' } });
    fireEvent.change(screen.getByDisplayValue('Select quarter…'), { target: { value: '4' } });

    expect(await screen.findByText('Shell — Quarterly Report Q4-2023')).toBeInTheDocument();
    expect(screen.getByText('Full')).toBeInTheDocument();
    expect(screen.queryByText(/No sources found/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Shell — Quarterly Report Q4-2023'));
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    await waitFor(() =>
      expect(createEarningsReport).toHaveBeenCalledWith(
        expect.objectContaining({
          source_report_ids: ['c0c38900-348f-4752-b68f-af9246aa1b97'],
        }),
      ),
    );
  });

  it('a genuinely empty sources list shows the empty-state message', async () => {
    getSelectableSources.mockResolvedValueOnce({ sources: [] });
    renderSetup();
    fireEvent.click(screen.getByRole('button', { name: /Annual Earnings Report/i }));
    fireEvent.change(screen.getByDisplayValue('Select fiscal year…'), { target: { value: '2025' } });
    expect(await screen.findByText(/No sources found for this period/)).toBeInTheDocument();
  });

  it('Continue is disabled until type + period + tone + ≥1 source, then creates + navigates', async () => {
    renderSetup();
    const continueBtn = () => screen.getByRole('button', { name: /Continue|Creating/ });
    expect(continueBtn()).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Annual Earnings Report/i }));
    fireEvent.change(screen.getByDisplayValue('Select fiscal year…'), { target: { value: '2025' } });
    const sourceRow = await screen.findByText('Acme — FY24 Annual Report');
    expect(continueBtn()).toBeDisabled();

    fireEvent.click(sourceRow);
    await waitFor(() => expect(continueBtn()).not.toBeDisabled());

    fireEvent.click(continueBtn());
    await waitFor(() =>
      expect(createEarningsReport).toHaveBeenCalledWith(
        expect.objectContaining({
          company_id: 'co-1',
          variant: 'annual',
          fiscal_year: 2025,
          quarter: null,
          tone: 'investor_focused',
          source_report_ids: ['rep-1'],
        }),
      ),
    );
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/earnings/rep-99/extract'));
  });

  it('a 409 surfaces the "active report exists" message with an open-existing link', async () => {
    createEarningsReport.mockRejectedValueOnce(
      new MockApiError(409, 'Conflict', { detail: { message: 'Active report exists', report_id: 'rep-existing' } }, '/earnings/reports'),
    );
    renderSetup();
    fireEvent.click(screen.getByRole('button', { name: /Annual Earnings Report/i }));
    fireEvent.change(screen.getByDisplayValue('Select fiscal year…'), { target: { value: '2025' } });
    fireEvent.click(await screen.findByText('Acme — FY24 Annual Report'));
    await waitFor(() => expect(screen.getByRole('button', { name: /Continue/ })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));

    expect(await screen.findByText('Active report exists')).toBeInTheDocument();
    const link = screen.getByRole('button', { name: /Open existing draft/i });
    fireEvent.click(link);
    expect(navigateMock).toHaveBeenCalledWith('/earnings/rep-existing/extract');
  });
});
