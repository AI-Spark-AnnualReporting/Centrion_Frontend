import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { AnnualReportExtraction as Extraction, LiveStep } from '@/types/company';

// The in-app Upload Reports page starts the ingest itself and stays on screen, so
// the user watches the live table instead of being sent to the dashboard.

const h = vi.hoisted(() => ({
  ingestOnboarding: vi.fn(),
  getExtraction: vi.fn(),
  listDocuments: vi.fn(),
  listReports: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { company_id: 'co-1' } }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => h.navigate,
}));

vi.mock('@/lib/api', () => ({
  companies: {
    ingestOnboarding: h.ingestOnboarding,
    getAnnualReportExtraction: h.getExtraction,
  },
  documents: { list: h.listDocuments },
  reports: { list: h.listReports },
}));

// The real form validates each file against the backend; here it is a stub that
// hands the page one validated annual report (or none) when its button is pressed.
vi.mock('@/pages/onboarding/UploadReportsStep', () => ({
  default: ({ onProcess, disabled }: {
    onProcess: (files: unknown[]) => void;
    disabled?: boolean;
  }) => (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onProcess([{ file: new File(['x'], 'aramco.pdf'), docType: 'annual', documentId: 'doc-1', period: 'FY-2024' }])}
      >
        Process
      </button>
      <button type="button" onClick={() => onProcess([])}>Process nothing</button>
    </div>
  ),
}));

import UploadReportsPage from '@/pages/UploadReportsPage';

const EMPTY_PROFILE = {
  description: null, sector_id: null, sector_name: null, employee_count: null, founded_year: null,
  headquarter_city: null, listed_exchange: null, reporting_currency: null, primary_language: null,
  fiscal_year_end_month: null, website_url: null,
};

function step(key: string, label: string, state: LiveStep['state']): LiveStep {
  return { key, label, state, reason: null, message: null, value: null };
}

/** An extraction answer whose `live` block says a run is, or is not, in progress. */
function extraction(running: boolean): Extraction {
  return {
    status: { report_extraction_status: running ? 'processing' : 'done', onboarding_progress: null },
    company: {
      profile: EMPTY_PROFILE, tone: null, tone_dimensions: {}, tone_exemplars: [], themes: [],
      highlights: [], outline: [], departments: null,
    },
    sections: [],
    reports: [],
    errors: [],
    live: {
      running,
      run: {
        files: [{ document_id: 'doc-1', filename: 'aramco.pdf', doc_type: 'annual', period: 'FY-2024' }],
        lead_period: 'FY-2024', latest_period_before: null, overrules: true, overrule_reason: 'first_report',
      },
      steps: [
        step('read', 'Reading the report', running ? 'running' : 'done'),
        step('tone', 'Writing tone', running ? 'pending' : 'done'),
      ],
    },
  };
}

describe('UploadReportsPage', () => {
  beforeEach(() => {
    for (const mock of Object.values(h)) mock.mockReset();
    h.listDocuments.mockResolvedValue({ documents: [] });
    h.listReports.mockResolvedValue({ reports: [] });
    sessionStorage.clear();
  });

  it('starts the ingest itself and stays on the page', async () => {
    h.getExtraction.mockResolvedValueOnce(extraction(false));
    render(<UploadReportsPage />);
    await screen.findByLabelText('Reading the report: extracted');

    h.ingestOnboarding.mockResolvedValue({ status: 'processing' });
    // Never-ending "running" answers would keep the poll alive; answer once as
    // running and then as finished so the test ends with nothing left ticking.
    h.getExtraction.mockResolvedValueOnce(extraction(true)).mockResolvedValue(extraction(false));
    fireEvent.click(screen.getByText('Process'));

    await waitFor(() =>
      expect(h.ingestOnboarding).toHaveBeenCalledWith(
        'co-1',
        [{ document_id: 'doc-1', doc_type: 'annual', period: 'FY-2024' }],
        true,
      ),
    );
    // The page is still here: heading, form and the live table, now mid-run.
    expect(await screen.findByLabelText('Reading the report: in progress')).toBeInTheDocument();
    expect(screen.getByText('Upload Reports')).toBeInTheDocument();
    expect(screen.getByText('Process')).toBeDisabled();
    expect(screen.queryByText('Building your intelligence dashboard')).not.toBeInTheDocument();
    expect(h.navigate).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('centriyon:freshUpload')).toBe('1');
  });

  it('unlocks the form and reloads the uploaded list when the run ends', async () => {
    h.getExtraction.mockResolvedValueOnce(extraction(false));
    render(<UploadReportsPage />);
    await screen.findByLabelText('Reading the report: extracted');
    expect(h.listDocuments).toHaveBeenCalledTimes(1);

    h.ingestOnboarding.mockResolvedValue({ status: 'processing' });
    h.getExtraction.mockResolvedValueOnce(extraction(true)).mockResolvedValue(extraction(false));
    fireEvent.click(screen.getByText('Process'));

    await screen.findByLabelText('Reading the report: in progress');
    // The next poll (2 s later) says the run has ended.
    await waitFor(() => expect(screen.getByText('Process')).not.toBeDisabled(), { timeout: 4000 });
    await waitFor(() => expect(h.listDocuments).toHaveBeenCalledTimes(2));
  });

  it('resumes a run that was already going when the page opened', async () => {
    h.getExtraction.mockResolvedValueOnce(extraction(true)).mockResolvedValue(extraction(false));
    render(<UploadReportsPage />);
    expect(await screen.findByLabelText('Reading the report: in progress')).toBeInTheDocument();
    expect(screen.getByText('Reading your report now')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Process')).toBeDisabled());
    expect(h.ingestOnboarding).not.toHaveBeenCalled();
  });

  it('shows a clear error and unlocks the form when the run cannot be started', async () => {
    h.getExtraction.mockResolvedValue(extraction(false));
    h.ingestOnboarding.mockRejectedValue(new Error('down'));
    render(<UploadReportsPage />);
    await screen.findByLabelText('Reading the report: extracted');

    fireEvent.click(screen.getByText('Process'));

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not start reading your reports');
    expect(screen.getByText('Process')).not.toBeDisabled();
    expect(sessionStorage.getItem('centriyon:freshUpload')).toBeNull();
  });

  it('asks for a report instead of starting an empty run', async () => {
    h.getExtraction.mockResolvedValue(extraction(false));
    render(<UploadReportsPage />);
    await screen.findByLabelText('Reading the report: extracted');

    fireEvent.click(screen.getByText('Process nothing'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Add at least one report before processing.');
    expect(h.ingestOnboarding).not.toHaveBeenCalled();
  });
});
