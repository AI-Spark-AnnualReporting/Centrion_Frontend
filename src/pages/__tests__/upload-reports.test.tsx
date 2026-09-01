import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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

  const doc = (over: Record<string, unknown> = {}) => ({
    file_type: 'pdf',
    file_size_bytes: 1048576,
    extraction_status: 'completed',
    download_url: null,
    download_expires_at: null,
    ...over,
  });

  it('groups documents into category tabs and skips docs with no report_id', async () => {
    h.listDocuments.mockResolvedValue({
      documents: [
        doc({ id: 'd1', filename: 'annual-2025.pdf', report_id: 'r1', report_type: 'annual', created_at: '2026-08-05T13:53:01Z' }),
        doc({ id: 'd2', filename: 'esg-2025.pdf', report_id: 'r2', report_type: 'esg', created_at: '2026-08-05T13:55:42Z' }),
        // Same report uploaded twice — one card holding both files, not two cards.
        doc({ id: 'd3', filename: 'esg-2025-again.pdf', report_id: 'r2', report_type: 'esg', created_at: '2026-08-05T13:56:00Z' }),
        // SAR department questionnaire: report_type says annual, but no report_id.
        doc({ id: 'd4', filename: 'Treasury Quest.docx', file_size_bytes: null, report_id: null, report_type: 'annual', created_at: '2026-08-09T09:02:02Z' }),
        // Not an uploaded report at all.
        doc({ id: 'd5', filename: 'q3.xlsx', report_id: 'r3', report_type: 'quarterly', created_at: '2026-08-13T07:45:31Z' }),
      ],
    });
    h.listReports.mockResolvedValue({
      reports: [{ id: 'r1', period: 'FY-2025' }, { id: 'r2', period: 'FY-unknown' }],
    });

    render(<UploadedReportsList />);

    // Both tabs render, each counting only its own documents.
    await waitFor(() => expect(screen.getByRole('button', { name: /^Annual Report \d+$/ })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^ESG Sustainability Report \d+$/ })).toBeInTheDocument();
    expect(screen.getByText('3 documents')).toBeInTheDocument();

    // Annual is the first tab, so its card shows; documents stay collapsed.
    expect(screen.getByText('Annual Report — FY-2025')).toBeInTheDocument();
    expect(screen.queryByText('annual-2025.pdf')).not.toBeInTheDocument();

    // Expanding the card reveals its document row.
    fireEvent.click(screen.getByText('Annual Report — FY-2025'));
    expect(screen.getByText('annual-2025.pdf')).toBeInTheDocument();

    // 'FY-unknown' is suppressed rather than shown, so the ESG card is untitled by period.
    fireEvent.click(screen.getByRole('button', { name: /^ESG Sustainability Report \d+$/ }));
    // The card header carries the name as a title attribute; the tab does not.
    expect(screen.getByTitle('ESG Sustainability Report')).toBeInTheDocument();
    expect(screen.queryByText(/FY-unknown/)).not.toBeInTheDocument();
    // One card carrying both files.
    expect(screen.getByText('2 documents')).toBeInTheDocument();

    expect(screen.queryByText('Treasury Quest.docx')).not.toBeInTheDocument();
    expect(screen.queryByText('q3.xlsx')).not.toBeInTheDocument();
  });

  it('renders a Download link pointing at the signed URL', async () => {
    h.listDocuments.mockResolvedValue({
      documents: [
        doc({ id: 'd1', filename: 'annual-2025.pdf', report_id: 'r1', report_type: 'annual', created_at: '2026-08-05T13:53:01Z', download_url: 'https://signed.example/annual-2025.pdf?download=annual-2025.pdf' }),
      ],
    });
    h.listReports.mockResolvedValue({ reports: [{ id: 'r1', period: 'FY-2025' }] });

    render(<UploadedReportsList />);

    await waitFor(() => expect(screen.getByText('Annual Report — FY-2025')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Annual Report — FY-2025'));

    const link = screen.getByRole('link', { name: /Download/ });
    expect(link).toHaveAttribute('href', 'https://signed.example/annual-2025.pdf?download=annual-2025.pdf');
    expect(link).toHaveAttribute('download', 'annual-2025.pdf');
  });

  it('shows Unavailable instead of a link when the file is missing from storage', async () => {
    h.listDocuments.mockResolvedValue({
      documents: [
        doc({ id: 'd1', filename: 'annual-2025.pdf', report_id: 'r1', report_type: 'annual', created_at: '2026-08-05T13:53:01Z', download_url: null }),
      ],
    });
    h.listReports.mockResolvedValue({ reports: [{ id: 'r1', period: 'FY-2025' }] });

    render(<UploadedReportsList />);

    await waitFor(() => expect(screen.getByText('Annual Report — FY-2025')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Annual Report — FY-2025'));

    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Download/ })).not.toBeInTheDocument();
  });

  it('shows the empty state when nothing has been uploaded', async () => {
    h.listDocuments.mockResolvedValue({ documents: [] });
    h.listReports.mockResolvedValue({ reports: [] });

    render(<UploadedReportsList />);

    await waitFor(() => expect(screen.getByText(/Nothing uploaded yet/)).toBeInTheDocument());
  });

  it('still renders cards when the reports lookup fails (period is optional)', async () => {
    h.listDocuments.mockResolvedValue({
      documents: [
        doc({ id: 'd1', filename: 'annual-2025.pdf', report_id: 'r1', report_type: 'annual', created_at: '2026-08-05T13:53:01Z' }),
      ],
    });
    h.listReports.mockRejectedValue(new Error('boom'));

    render(<UploadedReportsList />);

    // No period to append, so the card falls back to the bare title.
    await waitFor(() => expect(screen.getByTitle('Annual Report')).toBeInTheDocument());
  });

  it('renders nothing at all when the documents fetch fails', async () => {
    h.listDocuments.mockRejectedValue(new Error('boom'));
    h.listReports.mockResolvedValue({ reports: [] });

    const { container } = render(<UploadedReportsList />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
