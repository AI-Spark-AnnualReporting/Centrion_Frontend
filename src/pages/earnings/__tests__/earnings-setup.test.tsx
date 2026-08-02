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
    uploadEarningsSources: vi.fn(),
    patchSourceType: vi.fn(),
    listEarningsReports: vi.fn(),
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

// Annual is hidden from the live screen for now (see earnings-flags.ts), but the
// code path behind it is unchanged and we intend to bring it back — so this
// suite keeps exercising it rather than letting that coverage rot. That the
// option really is hidden by default is asserted in
// src/test/earnings-report-type-hidden.test.tsx, which does NOT override this.
vi.mock('@/components/earnings/earnings-flags', () => ({
  HIDDEN_EARNINGS_VARIANTS: [],
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
      uploadEarningsSources: (...a: unknown[]) => h.uploadEarningsSources(...a),
      patchSourceType: (...a: unknown[]) => h.patchSourceType(...a),
      listEarningsReports: (...a: unknown[]) => h.listEarningsReports(...a),
    },
    ApiError: h.MockApiError,
  };
});

const {
  navigateMock,
  getSelectableSources,
  createEarningsReport,
  uploadEarningsSources,
  patchSourceType,
  listEarningsReports,
  MockApiError,
} = h;

import { formatPeriodLabel, canContinue } from '../helpers';
import { normalizeEarningsSourceItem, normalizeEarningsSources } from '@/lib/api';
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
  listEarningsReports.mockResolvedValue({ reports: [] });
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

  it('reads the wire field `filing_type` for an uploaded document\'s type (D-29)', () => {
    const parsed = normalizeEarningsSourceItem({
      report_id: null,
      document_id: 'doc-1',
      label: 'Northwind Press Release',
      track: 'narrative',
      filing_type: 'release',
      coverage: 'partial',
    });
    expect(parsed?.type).toBe('release');
  });
});

// ── Unit: sources envelope — D-29 "Unified Sources" backend rework ──────────
describe('normalizeEarningsSources', () => {
  it('reads the new two-group {official, uploaded} envelope (no more flat sources[]/total)', () => {
    const { sources } = normalizeEarningsSources({
      official: [
        {
          report_id: 'rep-1',
          label: 'Acme — FY24 Annual Report',
          report_type: 'quarterly',
          period: 'Q4-2023',
          updated_at: '2026-01-01T00:00:00Z',
          coverage: 'full',
          track: 'official',
          filing_type: null,
          extraction_status: null,
        },
      ],
      uploaded: [
        {
          report_id: null,
          document_id: 'doc-1',
          label: 'Northwind Press Release',
          report_type: null,
          period: null,
          updated_at: '2026-01-01T00:00:00Z',
          coverage: 'partial',
          track: 'narrative', // D-29 renamed from 'narrative_adjusted'
          filing_type: 'release',
          extraction_status: 'completed',
        },
      ],
    });
    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({ report_id: 'rep-1', track: 'official' });
    expect(sources[1]).toMatchObject({ document_id: 'doc-1', track: 'narrative_adjusted', type: 'release' });
  });

  it('still reads the old flat {sources: [...]} shape as a fallback', () => {
    const { sources } = normalizeEarningsSources({
      sources: [{ report_id: 'rep-1', label: 'Acme', coverage: 'full' }],
      total: 1,
    });
    expect(sources).toHaveLength(1);
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

  it('a genuinely empty sources list shows both groups with their own empty hints', async () => {
    getSelectableSources.mockResolvedValueOnce({ sources: [] });
    renderSetup();
    fireEvent.click(screen.getByRole('button', { name: /Annual Earnings Report/i }));
    fireEvent.change(screen.getByDisplayValue('Select fiscal year…'), { target: { value: '2025' } });
    expect(await screen.findByText('From your system — official figures')).toBeInTheDocument();
    expect(screen.getByText('Uploaded — narrative')).toBeInTheDocument();
    expect(screen.getByText('No official filings found for this period.')).toBeInTheDocument();
    expect(screen.getByText('No uploads yet.')).toBeInTheDocument();
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

  it('has no tab control — both groups are labelled and visible with no prior click', async () => {
    renderSetup();
    fireEvent.click(screen.getByRole('button', { name: /Annual Earnings Report/i }));
    fireEvent.change(screen.getByDisplayValue('Select fiscal year…'), { target: { value: '2025' } });
    expect(await screen.findByText('From your system — official figures')).toBeInTheDocument();
    expect(screen.getByText('Uploaded — narrative')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upload new documents' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use existing reports' })).not.toBeInTheDocument();
  });

  it('the document-types guidance list is plain informational text, not a picker', async () => {
    renderSetup();
    fireEvent.click(screen.getByRole('button', { name: /Annual Earnings Report/i }));
    fireEvent.change(screen.getByDisplayValue('Select fiscal year…'), { target: { value: '2025' } });
    await screen.findByText('Document types');
    expect(screen.getByText('Press release')).toBeInTheDocument();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('a low-confidence detected type shows an editable dropdown + confirm hint; correcting it PATCHes and clears the hint', async () => {
    getSelectableSources.mockResolvedValueOnce({
      sources: [
        {
          report_id: null,
          document_id: 'doc-1',
          label: 'Northwind Q4 2024 Press Release',
          report_type: null,
          period: 'FY 2025',
          updated_at: '2026-01-01T00:00:00Z',
          coverage: 'partial',
          track: 'narrative_adjusted',
          type: 'release',
          detected_type: 'release',
          type_confidence: 0.4,
          extraction_status: 'ready',
          owning_report_id: 'rep-upload',
        },
      ],
    });
    // The API layer's patchSourceType resolves to the lean ack shape
    // ({report_id, document_id, type}) — it's a correction acknowledgement,
    // not a full source row (D-29: the wire response has no label/coverage).
    patchSourceType.mockResolvedValueOnce({
      report_id: 'rep-upload',
      document_id: 'doc-1',
      type: 'annual',
    });
    renderSetup();
    fireEvent.click(screen.getByRole('button', { name: /Annual Earnings Report/i }));
    fireEvent.change(screen.getByDisplayValue('Select fiscal year…'), { target: { value: '2025' } });

    const select = await screen.findByRole('combobox', {
      name: 'Type for Northwind Q4 2024 Press Release',
    });
    expect(select).toHaveValue('release');
    expect(screen.getByText('Please confirm type')).toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'annual' } });
    await waitFor(() => expect(patchSourceType).toHaveBeenCalledWith('rep-upload', 'doc-1', 'annual'));
    await waitFor(() => expect(select).toHaveValue('annual'));
    expect(screen.queryByText('Please confirm type')).not.toBeInTheDocument();
  });

  it('upload-only path: staging a file enables Continue, which creates the draft, uploads, and navigates', async () => {
    createEarningsReport.mockResolvedValueOnce({ report_id: 'rep-upload' });
    // Delayed on purpose — makes the 'uploading' progress state observable
    // instead of racing straight through to navigation within one microtask.
    uploadEarningsSources.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve([
                {
                  report_id: null,
                  document_id: 'doc-1',
                  label: 'Northwind Q4 2024 Press Release',
                  report_type: null,
                  period: 'FY 2025',
                  updated_at: '2026-01-01T00:00:00Z',
                  coverage: 'partial',
                  track: 'narrative_adjusted',
                  type: 'release',
                  detected_type: 'release',
                  type_confidence: 0.92,
                  extraction_status: 'extracting',
                  owning_report_id: 'rep-upload',
                },
              ]),
            10,
          );
        }),
    );
    renderSetup();
    fireEvent.click(screen.getByRole('button', { name: /Annual Earnings Report/i }));
    fireEvent.change(screen.getByDisplayValue('Select fiscal year…'), { target: { value: '2025' } });
    await screen.findByText('Acme — FY24 Annual Report');

    const continueBtn = () => screen.getByRole('button', { name: /Continue|Creating|Uploading/ });
    expect(continueBtn()).toBeDisabled();

    const file = new File(['press release text'], 'northwind_q4_2024_press_release.pdf', { type: 'application/pdf' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(continueBtn()).not.toBeDisabled());

    fireEvent.click(continueBtn());

    // 1) The draft is created FIRST, with empty id arrays (upload-only path).
    await waitFor(() =>
      expect(createEarningsReport).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'annual',
          fiscal_year: 2025,
          source_report_ids: [],
          source_document_ids: [],
        }),
      ),
    );
    // 2) Then upload fires with (reportId, files) — no manual type argument.
    await waitFor(() => expect(uploadEarningsSources).toHaveBeenCalledWith('rep-upload', [file]));

    expect(await screen.findByText('Uploading and reading your documents…')).toBeInTheDocument();

    // 3) Navigates on success; exactly one draft was ever created.
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/earnings/rep-upload/extract'));
    expect(createEarningsReport).toHaveBeenCalledTimes(1);
  });

  it('an upload failure during Continue resets the button and a retry does not create a second draft', async () => {
    createEarningsReport.mockResolvedValueOnce({ report_id: 'rep-retry' });
    uploadEarningsSources.mockRejectedValueOnce(new Error('network blip'));
    uploadEarningsSources.mockResolvedValueOnce([]);
    renderSetup();
    fireEvent.click(screen.getByRole('button', { name: /Annual Earnings Report/i }));
    fireEvent.change(screen.getByDisplayValue('Select fiscal year…'), { target: { value: '2025' } });
    await screen.findByText('Acme — FY24 Annual Report');

    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    const continueBtn = () => screen.getByRole('button', { name: /Continue|Creating|Uploading/ });
    fireEvent.click(continueBtn());

    await waitFor(() => expect(screen.getByText('network blip')).toBeInTheDocument());
    expect(continueBtn()).toHaveTextContent('Continue');

    // Retry — ensureDraft reuses sessionReportId, staged file is still there.
    fireEvent.click(continueBtn());
    await waitFor(() => expect(uploadEarningsSources).toHaveBeenCalledTimes(2));
    expect(createEarningsReport).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/earnings/rep-retry/extract'));
  });

  it('an extracting/failed narrative source cannot be selected', async () => {
    getSelectableSources.mockResolvedValueOnce({
      sources: [
        {
          report_id: null,
          document_id: 'doc-1',
          label: 'Investor Presentation Q4',
          report_type: null,
          period: 'FY 2025',
          updated_at: '2026-01-01T00:00:00Z',
          coverage: 'partial',
          track: 'narrative_adjusted',
          type: 'presentation',
          extraction_status: 'extracting',
        },
      ],
    });
    renderSetup();
    fireEvent.click(screen.getByRole('button', { name: /Annual Earnings Report/i }));
    fireEvent.change(screen.getByDisplayValue('Select fiscal year…'), { target: { value: '2025' } });
    const chip = await screen.findByText('Investor Presentation Q4');
    const checkbox = chip.closest('button[role="checkbox"]') as HTMLButtonElement;
    expect(checkbox).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(checkbox);
    expect(checkbox).toHaveAttribute('aria-checked', 'false');
  });

  it('Continue sends both source_report_ids and source_document_ids', async () => {
    getSelectableSources.mockResolvedValueOnce({
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
          report_id: null,
          document_id: 'doc-1',
          label: 'Investor Presentation Q4',
          report_type: null,
          period: 'FY 2025',
          updated_at: '2026-01-01T00:00:00Z',
          coverage: 'partial',
          track: 'narrative_adjusted',
          type: 'presentation',
          extraction_status: 'ready',
        },
      ],
    });
    renderSetup();
    fireEvent.click(screen.getByRole('button', { name: /Annual Earnings Report/i }));
    fireEvent.change(screen.getByDisplayValue('Select fiscal year…'), { target: { value: '2025' } });
    fireEvent.click(await screen.findByText('Acme — FY24 Annual Report'));
    fireEvent.click(await screen.findByText('Investor Presentation Q4'));
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    await waitFor(() =>
      expect(createEarningsReport).toHaveBeenCalledWith(
        expect.objectContaining({
          source_report_ids: ['rep-1'],
          source_document_ids: ['doc-1'],
        }),
      ),
    );
  });
});

// ── Dashboard: existing earnings report tiles ────────────────────────────────
describe('EarningsSetupPage — earnings reports dashboard', () => {
  const summary = (over: Record<string, unknown>) => ({
    report_id: 'e-1',
    title: 'Earnings Report',
    variant: 'quarterly',
    tone: 'formal_corporate',
    period: 'Q4-2023',
    period_display: 'Q4 2023',
    status: 'draft',
    action: 'Continue',
    version: 'v1.0',
    generated_at: '2026-07-16T10:00:00Z',
    updated_at: '2026-07-16T10:00:00Z',
    approved_at: null,
    locked_at: null,
    ...over,
  });

  it('loads and renders the report tiles from listEarningsReports', async () => {
    listEarningsReports.mockResolvedValue({
      reports: [
        summary({ report_id: 'e-1', period_display: 'Q4 2023' }),
        summary({ report_id: 'e-2', period_display: 'FY 2025', variant: 'annual', status: 'approved', action: 'View' }),
      ],
    });
    renderSetup();
    await waitFor(() => expect(listEarningsReports).toHaveBeenCalledWith('co-1'));
    expect(await screen.findByText('Q4 2023')).toBeInTheDocument();
    expect(screen.getByText('FY 2025')).toBeInTheDocument();
    expect(screen.getByText('View →')).toBeInTheDocument();
    expect(screen.getAllByText('Generated Jul 16, 2026').length).toBe(2);
  });

  it('clicking a tile navigates to that report\'s preview', async () => {
    listEarningsReports.mockResolvedValue({ reports: [summary({ report_id: 'e-42' })] });
    renderSetup();
    fireEvent.click(await screen.findByText('Q4 2023'));
    expect(navigateMock).toHaveBeenCalledWith('/earnings/e-42/preview');
  });

  it('shows an empty state when there are no reports', async () => {
    listEarningsReports.mockResolvedValue({ reports: [] });
    renderSetup();
    expect(await screen.findByText(/No earnings reports yet/)).toBeInTheDocument();
  });
});
