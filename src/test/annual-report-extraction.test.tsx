import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { AnnualReportExtraction as Extraction } from '@/types/company';

const getExtraction = vi.fn();

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { company_id: 'co-1' } }),
}));

vi.mock('@/lib/api', () => ({
  companies: { getAnnualReportExtraction: getExtraction },
}));

const { default: AnnualReportExtraction } = await import('@/components/reports/AnnualReportExtraction');

const EMPTY_PROFILE = {
  description: null, sector_id: null, sector_name: null, employee_count: null, founded_year: null,
  headquarter_city: null, listed_exchange: null, reporting_currency: null, primary_language: null,
  fiscal_year_end_month: null, website_url: null,
};

function emptyExtraction(): Extraction {
  return {
    status: { report_extraction_status: null, onboarding_progress: null },
    company: {
      profile: EMPTY_PROFILE, tone: null, tone_dimensions: {}, tone_exemplars: [], themes: [],
      highlights: [], outline: [], departments: null,
    },
    sections: [],
    reports: [],
    errors: [],
  };
}

function fullExtraction(): Extraction {
  const data = emptyExtraction();
  data.status = { report_extraction_status: 'done', onboarding_progress: { stage: 'done', percent: 100 } };
  data.company.profile = { ...EMPTY_PROFILE, headquarter_city: 'Dhahran', sector_name: 'Oil & Gas', fiscal_year_end_month: 12 };
  data.company.tone = 'Use formal language.';
  data.company.tone_dimensions = { bad_news_framing: 'brief, then pivot' };
  data.company.tone_exemplars = ['تتمثل رؤية أرامكو السعودية'];
  data.company.themes = [{ name: 'strategic growth', explanation: 'Growth plans.' }];
  data.company.highlights = [{ category: 'financial', text: 'Revenue rose.' }];
  data.company.outline = ['Introduction', 'Vision'];
  data.company.departments = {
    raw: [{ name: 'Finance', rank: 1, reason: 'Big numbers.', evidence: 'Group CFO' }],
    mapped: [{ name: 'Finance', department_id: 'd1' }],
  };
  data.sections = [{ section_code: 'intro', title: 'Introduction', section_number: 1000, mode: 'generate', mode_confirmed: true }];
  const entries = [];
  for (let i = 1; i <= 20; i++) entries.push({ title: `Entry ${i}`, page: i, level: 1 });
  data.reports = [{
    document: { id: 'doc-1', filename: 'aramco.pdf', file_size_bytes: 2 * 1024 * 1024, created_at: '2026-09-17T07:27:31Z', report_id: 'r1' },
    period: 'FY-2024',
    contents_page: { found: true, source: 'vision', confidence: 'high', entries },
    chunks: { count: 966, tokens: 210354 },
    financials: {
      period: 'FY-2024', version: 1, created_at: null,
      data: { periods: [{ period_label: 'FY-2023', line_items: { revenue: 398, net_profit: 121 } }], currency: 'SAR', denomination: 'مليار' },
    },
  }];
  return data;
}

describe('AnnualReportExtraction', () => {
  // Braces matter: a function returned from beforeEach is run as a cleanup step,
  // and mockReset() returns the mock — vitest would call the fake request again.
  beforeEach(() => {
    getExtraction.mockReset();
  });

  async function openPopup(label: string) {
    fireEvent.click(await screen.findByLabelText(label));
    return screen.findByRole('dialog');
  }

  it('shows only the table on the page, not the long list', async () => {
    getExtraction.mockResolvedValue(fullExtraction());
    render(<AnnualReportExtraction />);
    await screen.findByLabelText('Tone: extracted');
    expect(getExtraction).toHaveBeenCalledWith('co-1');
    expect(screen.queryByText('Use formal language.')).not.toBeInTheDocument();
    expect(screen.queryByText('strategic growth')).not.toBeInTheDocument();
    expect(screen.queryByText('Revenue rose.')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the revenue and profit in the dashboard popup', async () => {
    getExtraction.mockResolvedValue(fullExtraction());
    render(<AnnualReportExtraction />);
    const popup = await openPopup('Dashboard data: extracted');
    expect(within(popup).getByText('398')).toBeInTheDocument();
    expect(within(popup).getByText('مليار')).toBeInTheDocument();
  });

  it('shows the departments in their popup', async () => {
    getExtraction.mockResolvedValue(fullExtraction());
    render(<AnnualReportExtraction />);
    const popup = await openPopup('Suggested departments: extracted');
    expect(within(popup).getByText('Matches an existing department')).toBeInTheDocument();
  });

  it('keeps an Arabic quote in its own direction', async () => {
    getExtraction.mockResolvedValue(fullExtraction());
    render(<AnnualReportExtraction />);
    const popup = await openPopup('Tone: extracted');
    expect(within(popup).getByText('تتمثل رؤية أرامكو السعودية')).toHaveAttribute('dir', 'auto');
  });

  it('folds a long contents page', async () => {
    getExtraction.mockResolvedValue(fullExtraction());
    render(<AnnualReportExtraction />);
    const popup = await openPopup('Previous outline: extracted');
    expect(within(popup).getByText('Entry 15')).toBeInTheDocument();
    expect(within(popup).queryByText('Entry 16')).not.toBeInTheDocument();
    fireEvent.click(within(popup).getByText('Show all 20'));
    expect(within(popup).getByText('Entry 20')).toBeInTheDocument();
  });

  it('says what is missing instead of hiding it', async () => {
    getExtraction.mockResolvedValue(emptyExtraction());
    render(<AnnualReportExtraction />);
    const popup = await openPopup('Previous outline: not extracted');
    expect(within(popup).getByText('No sections were created from this report.')).toBeInTheDocument();
  });

  it('closes the popup with the close button', async () => {
    getExtraction.mockResolvedValue(fullExtraction());
    render(<AnnualReportExtraction />);
    const popup = await openPopup('Tone: extracted');
    fireEvent.click(within(popup).getByLabelText('Close'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the parts the server could not read', async () => {
    const data = fullExtraction();
    data.errors = ['Could not count a report\'s searchable chunks.'];
    getExtraction.mockResolvedValue(data);
    render(<AnnualReportExtraction />);
    expect(await screen.findByText('Could not count a report\'s searchable chunks.')).toBeInTheDocument();
  });

  it('shows one quiet line when the request fails', async () => {
    getExtraction.mockRejectedValue(new Error('down'));
    render(<AnnualReportExtraction />);
    expect(await screen.findByText(/Could not load what was extracted/)).toBeInTheDocument();
  });

  it('shows a tick for every part of a full extraction', async () => {
    getExtraction.mockResolvedValue(fullExtraction());
    render(<AnnualReportExtraction />);
    expect(await screen.findByLabelText('Tone: extracted')).toBeInTheDocument();
    expect(screen.getByLabelText('Dashboard data: extracted')).toBeInTheDocument();
    expect(screen.getByLabelText('Previous outline: extracted')).toBeInTheDocument();
    expect(screen.getByLabelText('Suggested departments: extracted')).toBeInTheDocument();
  });

  it('shows a cross for every part when nothing was extracted', async () => {
    getExtraction.mockResolvedValue(emptyExtraction());
    render(<AnnualReportExtraction />);
    expect(await screen.findByLabelText('Tone: not extracted')).toBeInTheDocument();
    expect(screen.getByLabelText('Dashboard data: not extracted')).toBeInTheDocument();
    expect(screen.getByLabelText('Previous outline: not extracted')).toBeInTheDocument();
    expect(screen.getByLabelText('Suggested departments: not extracted')).toBeInTheDocument();
  });

  it('opens the tone details in a popup', async () => {
    getExtraction.mockResolvedValue(fullExtraction());
    render(<AnnualReportExtraction />);
    fireEvent.click(await screen.findByLabelText('Tone: extracted'));
    const popup = await screen.findByRole('dialog');
    expect(within(popup).getByText('Use formal language.')).toBeInTheDocument();
    expect(within(popup).queryByText('strategic growth')).not.toBeInTheDocument();
  });

  it('opens the previous outline sections in a popup', async () => {
    getExtraction.mockResolvedValue(fullExtraction());
    render(<AnnualReportExtraction />);
    fireEvent.click(await screen.findByLabelText('Previous outline: extracted'));
    const popup = await screen.findByRole('dialog');
    expect(within(popup).getByText('generate (confirmed)')).toBeInTheDocument();
  });
});
