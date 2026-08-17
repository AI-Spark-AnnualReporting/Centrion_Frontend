import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// The in-app Upload Reports page trims the slot list; onboarding must keep all four.
// These two things live in the same component, so both are asserted here.

const h = vi.hoisted(() => ({
  validateReport: vi.fn(),
  listDocuments: vi.fn(),
  listReports: vi.fn(),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { company_id: 'co-1' } }),
}));

vi.mock('@/lib/api', () => ({
  companies: { validateReport: h.validateReport },
  documents: { list: h.listDocuments },
  reports: { list: h.listReports },
}));

import UploadReportsStep from '@/pages/onboarding/UploadReportsStep';
import UploadedReportsList from '@/components/reports/UploadedReportsList';

const ANNUAL = 'Annual Report';
const ESG = 'Sustainability / ESG Report';
const FINANCIAL = 'Financial Statements';
const OTHER = 'Other Documents';

describe('UploadReportsStep — slot filtering', () => {
  it('renders all four slots when docTypes is omitted (the onboarding run)', () => {
    render(<UploadReportsStep onProcess={vi.fn()} />);
    for (const title of [ANNUAL, ESG, FINANCIAL, OTHER]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  it('renders only the requested slots when docTypes is passed', () => {
    render(<UploadReportsStep onProcess={vi.fn()} docTypes={['annual', 'esg']} />);
    expect(screen.getByText(ANNUAL)).toBeInTheDocument();
    expect(screen.getByText(ESG)).toBeInTheDocument();
    expect(screen.queryByText(FINANCIAL)).not.toBeInTheDocument();
    expect(screen.queryByText(OTHER)).not.toBeInTheDocument();
  });
});

describe('UploadedReportsList', () => {
  beforeEach(() => {
    h.listDocuments.mockReset();
    h.listReports.mockReset();
  });

  it('groups documents by report and skips docs with no report_id', async () => {
    h.listDocuments.mockResolvedValue({
      documents: [
        { id: 'd1', filename: 'annual-2025.pdf', file_size_bytes: 1048576, report_id: 'r1', report_type: 'annual', created_at: '2026-08-05T13:53:01Z' },
        { id: 'd2', filename: 'esg-2025.pdf', file_size_bytes: 2097152, report_id: 'r2', report_type: 'esg', created_at: '2026-08-05T13:55:42Z' },
        // Same report uploaded twice — one row, not two.
        { id: 'd3', filename: 'esg-2025-again.pdf', file_size_bytes: 2097152, report_id: 'r2', report_type: 'esg', created_at: '2026-08-05T13:56:00Z' },
        // SAR department questionnaire: report_type says annual, but no report_id.
        { id: 'd4', filename: 'Treasury Quest.docx', file_size_bytes: null, report_id: null, report_type: 'annual', created_at: '2026-08-09T09:02:02Z' },
        // Not an uploaded report at all.
        { id: 'd5', filename: 'q3.xlsx', file_size_bytes: 100, report_id: 'r3', report_type: 'quarterly', created_at: '2026-08-13T07:45:31Z' },
      ],
    });
    h.listReports.mockResolvedValue({
      reports: [{ id: 'r1', period: 'FY-2025' }, { id: 'r2', period: 'FY-unknown' }],
    });

    render(<UploadedReportsList />);

    await waitFor(() => expect(screen.getByText('annual-2025.pdf')).toBeInTheDocument());
    expect(screen.getByText(ESG)).toBeInTheDocument();
    expect(screen.getByText(/\+1 more file$/)).toBeInTheDocument();
    expect(screen.getByText('2 reports')).toBeInTheDocument();

    expect(screen.queryByText('Treasury Quest.docx')).not.toBeInTheDocument();
    expect(screen.queryByText('q3.xlsx')).not.toBeInTheDocument();

    // FY-2025 shows; 'FY-unknown' is suppressed rather than shown as a pill.
    expect(screen.getByText('FY-2025')).toBeInTheDocument();
    expect(screen.queryByText('FY-unknown')).not.toBeInTheDocument();
  });

  it('shows the empty state when nothing has been uploaded', async () => {
    h.listDocuments.mockResolvedValue({ documents: [] });
    h.listReports.mockResolvedValue({ reports: [] });

    render(<UploadedReportsList />);

    await waitFor(() => expect(screen.getByText(/Nothing uploaded yet/)).toBeInTheDocument());
  });

  it('still renders rows when the reports lookup fails (period is optional)', async () => {
    h.listDocuments.mockResolvedValue({
      documents: [
        { id: 'd1', filename: 'annual-2025.pdf', file_size_bytes: 1048576, report_id: 'r1', report_type: 'annual', created_at: '2026-08-05T13:53:01Z' },
      ],
    });
    h.listReports.mockRejectedValue(new Error('boom'));

    render(<UploadedReportsList />);

    await waitFor(() => expect(screen.getByText('annual-2025.pdf')).toBeInTheDocument());
    expect(screen.getByText(ANNUAL)).toBeInTheDocument();
  });

  it('renders nothing at all when the documents fetch fails', async () => {
    h.listDocuments.mockRejectedValue(new Error('boom'));
    h.listReports.mockResolvedValue({ reports: [] });

    const { container } = render(<UploadedReportsList />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
