import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import type { AnnualReportExtraction as Extraction, LiveStep } from '@/types/company';
import {
  EXTRACTION_CATEGORIES,
  categoryCount,
  categoryState,
  latestReadDocuments,
  stepsForCategory,
} from '@/components/reports/extractionLive';
import { ReportCard } from '@/components/docs/DocumentBankGroups';

// The 4 chips (Contents, Departments, ESG, General info) on the latest report's row
// in "Your Uploaded Reports" on Upload Previous Reports.

const h = vi.hoisted(() => ({
  getExtraction: vi.fn(),
  listDocuments: vi.fn(),
  listReports: vi.fn(),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { company_id: 'co-1' } }),
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

vi.mock('@/lib/api', () => ({
  companies: { ingestOnboarding: vi.fn(), getAnnualReportExtraction: h.getExtraction },
  documents: { list: h.listDocuments },
  reports: { list: h.listReports },
}));

vi.mock('@/pages/onboarding/UploadReportsStep', () => ({ default: () => <div>form</div> }));

import UploadReportsPage from '@/pages/UploadReportsPage';

const EMPTY_PROFILE = {
  description: null, sector_id: null, sector_name: null, employee_count: null, founded_year: null,
  headquarter_city: null, listed_exchange: null, reporting_currency: null, primary_language: null,
  fiscal_year_end_month: null, website_url: null,
};

function step(
  key: string,
  label: string,
  state: LiveStep['state'],
  extra: Partial<LiveStep> = {},
): LiveStep {
  return { key, label, state, reason: null, message: null, value: null, ...extra };
}

/** All 11 steps of a finished run: contents failed, ESG skipped, one General row failed. */
function finishedSteps(): LiveStep[] {
  return [
    step('read', 'Reading the report', 'done', { value: '85,768 characters' }),
    step('tone', 'Writing tone', 'done', { value: 'Maintain a formal tone' }),
    step('themes', 'Themes', 'done', { value: '3 themes' }),
    step('highlights', 'Key highlights', 'done', { value: '3 highlights' }),
    step('profile', 'Company profile', 'skipped', { message: 'We could not find any new company details in this report.' }),
    step('outline', 'Contents page (previous outline)', 'failed', {
      reason: 'docx_no_outline',
      message: 'We could not find a contents page or clear chapter headings in this Word file.',
    }),
    step('revenue', 'Revenue', 'failed', { message: 'We could not find total revenue in this report.' }),
    step('net_profit', 'Net profit', 'done', { value: 'SAR 120' }),
    step('departments', 'Suggested departments', 'done', { value: '6 departments' }),
    step('index', 'Search index for the assistant', 'done', { value: '120 chunks' }),
    step('frameworks', 'ESG frameworks', 'skipped', {
      message: 'Upload a sustainability report to detect reporting frameworks.',
    }),
  ];
}

function extraction(steps: LiveStep[], files = [{ document_id: 'doc-new', doc_type: 'annual' }]): Extraction {
  return {
    status: { report_extraction_status: 'done', onboarding_progress: null },
    company: {
      profile: EMPTY_PROFILE, tone: 'Maintain a formal tone throughout.', tone_dimensions: {},
      tone_exemplars: [], themes: [], highlights: [], outline: [], departments: null,
    },
    sections: [],
    reports: [],
    errors: [],
    live: {
      running: false,
      run: {
        files: files.map((file) => ({ ...file, filename: 'x', period: 'FY-2025' })),
        lead_period: 'FY-2025', latest_period_before: null, overrules: true, overrule_reason: 'first_report',
      },
      steps,
    },
  };
}

function uploadedDoc(id: string, filename: string, created: string) {
  return {
    id, filename, file_type: 'docx', file_size_bytes: 1000, report_id: 'rep-1',
    report_type: 'annual', extraction_status: 'completed', created_at: created,
    download_url: 'https://x/y', download_expires_at: null,
  };
}

describe('category helpers', () => {
  const general = EXTRACTION_CATEGORIES.find((category) => category.key === 'general')!;

  it('puts the 8 other steps into General info', () => {
    expect(stepsForCategory(finishedSteps(), general).map((s) => s.key)).toEqual(
      ['read', 'tone', 'themes', 'highlights', 'profile', 'revenue', 'net_profit', 'index'],
    );
  });

  it('is green when all were extracted, amber when some, red when none, grey when none tried', () => {
    expect(categoryState([step('a', 'A', 'done'), step('b', 'B', 'done')])).toBe('done');
    expect(categoryState([step('a', 'A', 'done'), step('b', 'B', 'failed')])).toBe('partial');
    expect(categoryState([step('a', 'A', 'done'), step('b', 'B', 'skipped')])).toBe('partial');
    expect(categoryState([step('a', 'A', 'failed'), step('b', 'B', 'skipped')])).toBe('failed');
    expect(categoryState([step('a', 'A', 'skipped')])).toBe('none');
    expect(categoryState([step('a', 'A', 'done'), step('b', 'B', 'running')])).toBe('running');
  });

  it('counts done steps only for a category of several', () => {
    expect(categoryCount(stepsForCategory(finishedSteps(), general))).toBe('6/8');
    expect(categoryCount([step('outline', 'Contents', 'done')])).toBeNull();
  });

  it('gives the annual file all four chips and an ESG file only ESG', () => {
    const data = extraction(finishedSteps(), [
      { document_id: 'doc-annual', doc_type: 'annual' },
      { document_id: 'doc-esg', doc_type: 'esg' },
    ]);
    const chips = latestReadDocuments(data);
    expect(chips.get('doc-annual')).toEqual(['contents', 'departments', 'esg', 'general']);
    expect(chips.get('doc-esg')).toEqual(['esg']);
  });

  it('falls back to the newest annual report when no run was recorded', () => {
    const data = extraction(finishedSteps());
    data.live = { running: false, run: null, steps: finishedSteps() };
    data.reports = ['2026-01-01', '2026-03-01'].map((created, index) => ({
      document: { id: `doc-${index}`, filename: 'f', file_size_bytes: null, created_at: created, report_id: 'r' },
      period: null, contents_page: null, chunks: null, financials: null,
    }));
    expect([...latestReadDocuments(data).keys()]).toEqual(['doc-1']);
  });
});

describe('chips on the uploaded reports list', () => {
  beforeEach(() => {
    for (const mock of Object.values(h)) mock.mockReset();
    h.listReports.mockResolvedValue({ reports: [{ id: 'rep-1', period: 'FY-2025' }] });
    h.listDocuments.mockResolvedValue({
      documents: [
        uploadedDoc('doc-old', 'CFG 5 May 2026.pdf', '2026-11-15T07:24:22Z'),
        uploadedDoc('doc-new', 'Draft 11 - CFG.docx', '2026-11-15T07:26:54Z'),
      ],
    });
    h.getExtraction.mockResolvedValue(extraction(finishedSteps()));
  });

  it('shows the 4 chips on the latest report only, with the card already open', async () => {
    render(<UploadReportsPage />);
    const chips = await screen.findAllByRole('group', { name: 'What we extracted from this file' });
    expect(chips).toHaveLength(1);
    const group = chips[0];
    expect(within(group).getByLabelText('Contents: not extracted. Show details')).toBeInTheDocument();
    expect(within(group).getByLabelText('Departments: extracted. Show details')).toBeInTheDocument();
    expect(within(group).getByLabelText('ESG: skipped. Show details')).toBeInTheDocument();
    expect(within(group).getByLabelText('General info: partly extracted, 6 of 8 done. Show details')).toBeInTheDocument();
    // The older file is listed, without chips.
    expect(screen.getByText('CFG 5 May 2026.pdf')).toBeInTheDocument();
  });

  it('opens a popup with the reason when a chip is clicked', async () => {
    render(<UploadReportsPage />);
    fireEvent.click(await screen.findByLabelText('Contents: not extracted. Show details'));
    const dialog = await screen.findByRole('dialog', { name: 'Contents' });
    expect(within(dialog).getByText('Not extracted')).toBeInTheDocument();
    expect(
      within(dialog).getByText('We could not find a contents page or clear chapter headings in this Word file.'),
    ).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('lists the 8 General info rows and opens the tone detail with a way back', async () => {
    render(<UploadReportsPage />);
    fireEvent.click(await screen.findByLabelText('General info: partly extracted, 6 of 8 done. Show details'));
    const dialog = await screen.findByRole('dialog', { name: 'General info' });
    // "Finished" counts every row that ended, including the failed and skipped ones.
    expect(within(dialog).getByText('8 of 8 finished')).toBeInTheDocument();
    expect(within(dialog).getByText('We could not find total revenue in this report.')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByLabelText('Writing tone: extracted'));
    expect(within(dialog).getByText('Maintain a formal tone throughout.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByText('Back to General info'));
    expect(within(dialog).getByText('8 of 8 finished')).toBeInTheDocument();
  });
});

describe('the Document Bank card without the new props', () => {
  it('starts closed and draws no chips, as before', () => {
    render(
      <ReportCard
        report={{
          report_id: 'rep-1', cycle_id: null, thread_id: null, report_name: 'Annual Report',
          report_type: 'annual', period: null, status: null, document_count: 1,
          documents: [{
            id: 'd', filename: 'a.pdf', file_type: 'pdf', file_size_bytes: 1,
            created_at: '2026-01-01T00:00:00Z', download_url: null,
          } as never],
        }}
      />,
    );
    expect(screen.queryByText('a.pdf')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'What we extracted from this file' })).not.toBeInTheDocument();
  });
});
