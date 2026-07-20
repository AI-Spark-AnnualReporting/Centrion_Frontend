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
    getEarningsSections: vi.fn(),
    produceEarningsReport: vi.fn(),
    produceEarningsSection: vi.fn(),
    patchEarningsSectionContent: vi.fn(),
    approveEarningsReport: vi.fn(),
    downloadEarningsExport: vi.fn(),
    getByPollUrl: vi.fn(),
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
    getEarningsSections: (...a: unknown[]) => h.getEarningsSections(...a),
    produceEarningsReport: (...a: unknown[]) => h.produceEarningsReport(...a),
    produceEarningsSection: (...a: unknown[]) => h.produceEarningsSection(...a),
    patchEarningsSectionContent: (...a: unknown[]) => h.patchEarningsSectionContent(...a),
    approveEarningsReport: (...a: unknown[]) => h.approveEarningsReport(...a),
    downloadEarningsExport: (...a: unknown[]) => h.downloadEarningsExport(...a),
  },
  agentRuns: { getByPollUrl: (...a: unknown[]) => h.getByPollUrl(...a) },
  ApiError: h.MockApiError,
}));

import EarningsPreviewPage from '../EarningsPreviewPage';
import { SectionRenderer } from '@/components/earnings/SectionRenderer';
import { earningsSectionState } from '../preview-helpers';
import type { EarningsProducedSection } from '@/types/earnings';

const sec = (over: Partial<EarningsProducedSection>): EarningsProducedSection => ({
  section_code: 'code',
  title: 'Title',
  display_order: 0,
  source_type: null,
  mode: 'generate',
  status: 'produced',
  content: 'Some prose content.',
  included: true,
  feeder_status: null,
  feeder_message: null,
  source_label: null,
  source_ref: null,
  confidence: null,
  flag: null,
  grounding_flag: null,
  grounding_acknowledged: false,
  edited: false,
  ...over,
});

const COVER = sec({
  section_code: 'cover',
  title: 'Cover',
  mode: 'cover',
  display_order: 0,
  content: JSON.stringify({
    template_key: 'classic',
    values: {
      company_name: 'Al Noor Capital',
      title: 'Full-Year Financial Results',
      period_label: 'FY 2025',
      prepared_on: '31 Dec 2025',
    },
  }),
});
const OVERVIEW = sec({
  section_code: 'overview_highlights',
  title: 'Overview',
  mode: 'generate',
  display_order: 1,
  content: 'Al Noor Capital delivered a resilient full-year performance in 2025.',
});
const PERFORMANCE = sec({
  section_code: 'earnings_performance',
  title: 'Earnings performance',
  mode: 'table',
  display_order: 2,
  content: JSON.stringify({
    rows: [
      { label: 'Revenue', current_display: 'SAR 4,182.6M', prior_display: null, change_pct: null },
      { label: 'Net Income', current_display: 'SAR 1,204.5M', prior_display: null, change_pct: null },
    ],
  }),
});

const PRODUCED = { sections: [COVER, OVERVIEW, PERFORMANCE], cover_template_key: 'classic', locked: false };

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/earnings/rep-1/preview']}>
      <Routes>
        <Route path="/earnings/:reportId/preview" element={<EarningsPreviewPage />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  h.userRef.current = { company_id: 'co-1', company_name: 'Acme' };
  h.getEarningsSections.mockResolvedValue(PRODUCED);
  h.produceEarningsReport.mockResolvedValue({ run_id: 'run-1', poll_url: '/api/v1/agent_runs/run-1' });
  h.produceEarningsSection.mockResolvedValue(OVERVIEW);
  h.patchEarningsSectionContent.mockResolvedValue(sec({ ...OVERVIEW, content: 'Edited overview.', edited: true }));
  h.approveEarningsReport.mockResolvedValue({});
  h.downloadEarningsExport.mockResolvedValue(undefined);
  h.getByPollUrl.mockResolvedValue({ status: 'running' });
});

// ── Unit: content dispatch (SectionRenderer / helpers) ────────────────────────
describe('SectionRenderer dispatch', () => {
  it('renders a table envelope as label + value, with NO delta column', () => {
    render(<SectionRenderer section={PERFORMANCE} />);
    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('SAR 4,182.6M')).toBeInTheDocument();
    expect(screen.getByText('Value')).toBeInTheDocument();
    // No delta columns ever, even though rows carry prior_display/change_pct = null.
    expect(screen.queryByText('Change')).not.toBeInTheDocument();
    expect(screen.queryByText('Prior')).not.toBeInTheDocument();
  });

  it('renders a prose string as prose', () => {
    render(<SectionRenderer section={OVERVIEW} />);
    expect(screen.getByText(/resilient full-year performance/)).toBeInTheDocument();
  });

  it('renders a cover envelope as the cover block', () => {
    render(<SectionRenderer section={COVER} coverTemplateKey="classic" />);
    // Classic cover renders the company name in both the title area and the footer.
    expect(screen.getAllByText('Al Noor Capital').length).toBeGreaterThan(0);
    expect(screen.getByText('Full-Year Financial Results')).toBeInTheDocument();
  });

  it('never renders a delta column when change_pct is null across rows', () => {
    const noDelta = sec({
      mode: 'table',
      content: JSON.stringify({ rows: [{ label: 'EPS', current_display: '2.41', change_pct: null }] }),
    });
    render(<SectionRenderer section={noDelta} />);
    expect(screen.getByText('EPS')).toBeInTheDocument();
    expect(screen.queryByText('Change')).not.toBeInTheDocument();
    expect(screen.queryByText('▲')).not.toBeInTheDocument();
    expect(screen.queryByText('▼')).not.toBeInTheDocument();
  });
});

describe('earningsSectionState', () => {
  it('a needs_input section is reported as needing input, not produced', () => {
    const s = sec({ status: 'needs_input', content: null });
    expect(earningsSectionState(s)).toBe('needs_input');
  });
  it('an empty produced section reports empty', () => {
    expect(earningsSectionState(sec({ content: null, status: 'produced' }))).toBe('empty');
  });
  it('real prose reports produced', () => {
    expect(earningsSectionState(OVERVIEW)).toBe('produced');
  });
});

// ── Route / behaviour ─────────────────────────────────────────────────────────
describe('EarningsPreviewPage', () => {
  it('unproduced report shows Generate; clicking it calls produceEarningsReport and shows progress', async () => {
    h.getEarningsSections.mockResolvedValueOnce({
      sections: [COVER, sec({ ...OVERVIEW, status: 'pending', content: null })],
      cover_template_key: 'classic',
      locked: false,
    });
    renderPage();
    const gen = await screen.findByRole('button', { name: 'Generate report' });
    fireEvent.click(gen);
    await waitFor(() => expect(h.produceEarningsReport).toHaveBeenCalledWith('rep-1'));
    expect(await screen.findByText('Generating your report…')).toBeInTheDocument();
  });

  it('produced report renders the section rail and bodies', async () => {
    renderPage();
    // Rail lists section titles; body renders prose + table.
    expect(await screen.findAllByText('Overview')).not.toHaveLength(0);
    expect(screen.getByText(/resilient full-year performance/)).toBeInTheDocument();
    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('SAR 4,182.6M')).toBeInTheDocument();
  });

  it('editing a section calls patchEarningsSectionContent and surfaces a returned grounding flag with acknowledge', async () => {
    h.patchEarningsSectionContent.mockResolvedValueOnce(
      sec({ ...OVERVIEW, content: 'Edited overview.', grounding_flag: 'Revenue not grounded in a source', edited: true }),
    );
    renderPage();
    await screen.findByText(/resilient full-year performance/);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const ta = screen.getByRole('textbox');
    fireEvent.change(ta, { target: { value: 'Edited overview.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(h.patchEarningsSectionContent).toHaveBeenCalledWith('rep-1', 'overview_highlights', {
        content: 'Edited overview.',
      }),
    );
    expect(await screen.findByText(/Grounding check:/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    await waitFor(() => expect(screen.queryByText(/Grounding check:/)).not.toBeInTheDocument());
  });

  it('Export PDF calls downloadEarningsExport with a blob download', async () => {
    renderPage();
    await screen.findByText(/resilient full-year performance/);
    fireEvent.click(screen.getByRole('button', { name: /PDF/ }));
    await waitFor(() => expect(h.downloadEarningsExport).toHaveBeenCalledWith('rep-1', 'pdf'));
  });

  it('Approve on a gate-failing report (409) renders the blocker list and does not lock', async () => {
    h.approveEarningsReport.mockRejectedValueOnce(
      new h.MockApiError(409, { detail: [{ message: 'Cash flow detail not produced' }] }),
    );
    renderPage();
    await screen.findByText(/resilient full-year performance/);
    fireEvent.click(screen.getByRole('button', { name: 'Approve & lock' }));
    expect(await screen.findByText('Cash flow detail not produced')).toBeInTheDocument();
    // Still draft/editable — the approve button remains.
    expect(screen.getByRole('button', { name: 'Approve & lock' })).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('Approve success reflects the locked, read-only state', async () => {
    renderPage();
    await screen.findByText(/resilient full-year performance/);
    fireEvent.click(screen.getByRole('button', { name: 'Approve & lock' }));
    await waitFor(() => expect(screen.getByText('Approved')).toBeInTheDocument());
    // Locked → approve + edit controls gone.
    expect(screen.queryByRole('button', { name: 'Approve & lock' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('an unacknowledged grounding flag blocks approve client-side', async () => {
    h.getEarningsSections.mockResolvedValueOnce({
      sections: [OVERVIEW, sec({ ...PERFORMANCE, grounding_flag: 'Figure flag', grounding_acknowledged: false })],
      cover_template_key: 'classic',
      locked: false,
    });
    renderPage();
    await screen.findByText(/resilient full-year performance/);
    fireEvent.click(screen.getByRole('button', { name: 'Approve & lock' }));
    expect(await screen.findByText(/unacknowledged figure flag/)).toBeInTheDocument();
    expect(h.approveEarningsReport).not.toHaveBeenCalled();
  });

  it('guards a null companyId (no crash)', async () => {
    h.userRef.current = null;
    renderPage();
    expect(await screen.findByText('Preview your earnings report')).toBeInTheDocument();
    expect(screen.getByText(/resilient full-year performance/)).toBeInTheDocument();
  });
});
