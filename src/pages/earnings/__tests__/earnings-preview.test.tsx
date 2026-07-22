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

// ── 6C fixtures — new section content shapes ────────────────────────────────
const COMMENTARY_QUOTE = sec({
  section_code: 'management_commentary',
  title: 'Management Commentary',
  mode: 'quote',
  display_order: 3,
  content: JSON.stringify({
    quote: 'We delivered strong results despite a challenging macro backdrop.',
    attribution: { name: 'Jane Doe', title: 'CEO' },
  }),
});
const COMMENTARY_OMITTED = sec({
  section_code: 'management_commentary',
  title: 'Management Commentary',
  mode: 'quote',
  display_order: 3,
  content: null,
});
const RECONCILIATION = sec({
  section_code: 'non_ifrs_reconciliation',
  title: 'Non-IFRS Reconciliation',
  mode: 'reconciliation',
  display_order: 4,
  content: JSON.stringify({
    rows: [
      {
        label: 'Adjusted EBITDA',
        reported_display: 'SAR 900M',
        adjustments_display: 'SAR 50M',
        adjusted_display: 'SAR 950M',
        source_ref: 'p. 12',
      },
      {
        label: 'One-off restructuring charge',
        gap_reason: 'Not broken out in the filing',
      },
    ],
  }),
});
const MDNA_NOT_DISCLOSED = sec({
  section_code: 'mdna',
  title: "MD&A",
  mode: 'generate',
  display_order: 5,
  content: 'Not disclosed for this period.',
});
const TREND_DEFERRED = sec({
  section_code: 'trend_series',
  title: 'Trend',
  mode: 'trend',
  display_order: 6,
  content: null,
});
const KPI_TABLE = sec({
  section_code: 'operational_kpis',
  title: 'Operational KPIs',
  mode: 'kpi',
  display_order: 7,
  content: JSON.stringify({
    rows: [
      { label: 'Same-store sales growth', current_display: '4.2%' },
      { label: 'Store count', row_status: 'pending' },
      { label: 'Utilization rate', gap_reason: 'Not tracked for this sector' },
      { label: 'Discontinued metric', row_status: 'omitted' },
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

  it('a pending section shows "awaiting generation" copy, not the generic empty-state text', () => {
    const pending = sec({ content: null, status: 'pending' });
    render(<SectionRenderer section={pending} />);
    expect(screen.getByText('This section is awaiting generation.')).toBeInTheDocument();
    expect(screen.queryByText('No data available for this section.')).not.toBeInTheDocument();
  });

  it('a genuinely empty section still shows the generic empty-state text', () => {
    const empty = sec({ content: null, status: 'produced' });
    render(<SectionRenderer section={empty} />);
    expect(screen.getByText('No data available for this section.')).toBeInTheDocument();
  });

  it('a commentary quote renders the quote + attribution', () => {
    render(<SectionRenderer section={COMMENTARY_QUOTE} />);
    expect(screen.getByText(/We delivered strong results/)).toBeInTheDocument();
    expect(screen.getByText(/Jane Doe, CEO/)).toBeInTheDocument();
  });

  it('an omitted commentary quote renders nothing — no placeholder', () => {
    const { container } = render(<SectionRenderer section={COMMENTARY_OMITTED} />);
    expect(screen.queryByText(/No data available/)).not.toBeInTheDocument();
    expect(screen.queryByText(/quote/i)).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('a reconciliation section renders reported → adjusted with citations, and a gap row shows its reason', () => {
    render(<SectionRenderer section={RECONCILIATION} />);
    expect(screen.getByText('Adjusted EBITDA')).toBeInTheDocument();
    expect(screen.getByText('SAR 900M')).toBeInTheDocument();
    expect(screen.getByText('SAR 50M')).toBeInTheDocument();
    expect(screen.getByText('SAR 950M')).toBeInTheDocument();
    expect(screen.getByText('p. 12')).toBeInTheDocument();
    expect(screen.getByText('One-off restructuring charge')).toBeInTheDocument();
    expect(screen.getByText('Not broken out in the filing')).toBeInTheDocument();
  });

  it('MD&A renders the "not disclosed" line verbatim, unembellished', () => {
    render(<SectionRenderer section={MDNA_NOT_DISCLOSED} />);
    expect(screen.getByText('Not disclosed for this period.')).toBeInTheDocument();
  });

  it('a deferred trend section renders no table at the leaf level (page-level filtering hides the whole section, tested at the route level)', () => {
    render(<SectionRenderer section={TREND_DEFERRED} />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('pending / gap / omitted KPI rows render as three distinct states, not one dash', () => {
    render(<SectionRenderer section={KPI_TABLE} />);
    expect(screen.getByText('Same-store sales growth')).toBeInTheDocument();
    expect(screen.getByText('4.2%')).toBeInTheDocument();
    expect(screen.getByText('Store count')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Utilization rate')).toBeInTheDocument();
    expect(screen.getByText('Not tracked for this sector')).toBeInTheDocument();
    // The omitted row never renders at all.
    expect(screen.queryByText('Discontinued metric')).not.toBeInTheDocument();
  });
});

describe('earningsSectionState', () => {
  it('a needs_input section is reported as needing input, not produced', () => {
    const s = sec({ status: 'needs_input', content: null });
    expect(earningsSectionState(s)).toBe('needs_input');
  });
  it('an empty produced section reports omitted', () => {
    expect(earningsSectionState(sec({ content: null, status: 'produced' }))).toBe('omitted');
  });
  it('a pending section (awaiting a producer) reports pending, distinct from empty', () => {
    expect(earningsSectionState(sec({ content: null, status: 'pending' }))).toBe('pending');
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

  it('a report that has real content anywhere (excluding cover) never shows "Generate report" again, even with a genuine needs_input gap elsewhere', async () => {
    h.getEarningsSections.mockResolvedValueOnce({
      sections: [
        COVER,
        OVERVIEW,
        // A section with no content and a status the outline-save bug could
        // have reset to 'pending' — still must not resurrect the banner once
        // OVERVIEW proves the report has genuinely been generated.
        sec({ section_code: 'capital_allocation', title: 'Capital Allocation', status: 'pending', content: null }),
      ],
      cover_template_key: 'classic',
      locked: false,
    });
    renderPage();
    await screen.findByText(/resilient full-year performance/);
    expect(screen.queryByRole('button', { name: 'Generate report' })).not.toBeInTheDocument();
    expect(h.produceEarningsReport).not.toHaveBeenCalled();
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

  it('Export is hidden until the report is approved & locked', async () => {
    renderPage(); // default fixture is locked: false
    await screen.findByText(/resilient full-year performance/);
    expect(screen.queryByText('Export')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /PDF/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Word/ })).not.toBeInTheDocument();
  });

  it('Export PDF calls downloadEarningsExport with a blob download (once approved & locked)', async () => {
    h.getEarningsSections.mockResolvedValueOnce({ ...PRODUCED, locked: true });
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

  it('an omitted-by-design quote section is absent from the rail, the card list, and Included sections, and never gates Generate', async () => {
    h.getEarningsSections.mockResolvedValueOnce({
      sections: [COVER, OVERVIEW, { ...COMMENTARY_OMITTED, included: true }],
      cover_template_key: 'classic',
      locked: false,
    });
    renderPage();
    await screen.findByText(/resilient full-year performance/);
    // No card heading, no rail entry for the omitted commentary section.
    expect(screen.queryByText('Management Commentary')).not.toBeInTheDocument();
    // Not stuck showing "Generate report" because of a section that can never produce.
    expect(screen.queryByRole('button', { name: 'Generate report' })).not.toBeInTheDocument();
  });

  it('a deferred trend section is absent from the rail and card list — no empty table, no chart placeholder', async () => {
    h.getEarningsSections.mockResolvedValueOnce({
      sections: [COVER, OVERVIEW, { ...TREND_DEFERRED, included: true }],
      cover_template_key: 'classic',
      locked: false,
    });
    renderPage();
    await screen.findByText(/resilient full-year performance/);
    expect(screen.queryByText('Trend')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Generate report' })).not.toBeInTheDocument();
  });
});
