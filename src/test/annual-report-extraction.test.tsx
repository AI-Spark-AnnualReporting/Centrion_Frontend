import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import type {
  AnnualReportExtraction as Extraction,
  LiveRun,
  LiveStep,
  LiveStepState,
} from '@/types/company';

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

// The rows drawn when the backend sends no `live` block (worked out from stored data).
const FALLBACK_LABELS = [
  'Reading the report', 'Writing tone', 'Themes', 'Key highlights', 'Company profile',
  'Contents page (previous outline)', 'Revenue', 'Net profit', 'Suggested departments',
  'Search index for the assistant',
];

const STEP_LABELS: [string, string][] = [
  ['read', 'Reading the report'], ['tone', 'Writing tone'], ['themes', 'Themes'],
  ['highlights', 'Key highlights'], ['profile', 'Company profile'],
  ['outline', 'Contents page (previous outline)'], ['revenue', 'Revenue'],
  ['net_profit', 'Net profit'], ['departments', 'Suggested departments'],
  ['index', 'Search index for the assistant'], ['frameworks', 'ESG frameworks'],
];

/** The full ordered step list, every step in `state` unless overridden by key. */
function liveSteps(state: LiveStepState, overrides: Record<string, Partial<LiveStep>> = {}): LiveStep[] {
  return STEP_LABELS.map(([key, label]) => ({
    key, label, state, reason: null, message: null, value: null, ...overrides[key],
  }));
}

function liveRun(over: Partial<LiveRun> = {}): LiveRun {
  return {
    files: [{ document_id: 'doc-1', filename: 'aramco.pdf', doc_type: 'annual', period: 'FY-2024' }],
    lead_period: 'FY-2024',
    latest_period_before: 'FY-2023',
    overrules: true,
    overrule_reason: 'newest_year',
    ...over,
  };
}

/** A stored extraction plus a `live` block, as the new backend returns it. */
function liveExtraction(running: boolean, steps: LiveStep[], run: LiveRun | null = liveRun()): Extraction {
  const data = fullExtraction();
  data.status = {
    report_extraction_status: running ? 'processing' : 'done',
    onboarding_progress: { stage: running ? 'learn' : 'done', detail: 'Learning your writing style', percent: running ? 55 : 100 },
  };
  data.live = { running, run, steps };
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
    await screen.findByLabelText('Writing tone: extracted');
    expect(getExtraction).toHaveBeenCalledWith('co-1');
    // The tone row prints the first words of the tone; the rest stays in the popups.
    expect(screen.getByText('Use formal language.')).toBeInTheDocument();
    expect(screen.queryByText('brief, then pivot')).not.toBeInTheDocument();
    expect(screen.queryByText('strategic growth')).not.toBeInTheDocument();
    expect(screen.queryByText('Revenue rose.')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the revenue and profit in the dashboard popup', async () => {
    getExtraction.mockResolvedValue(fullExtraction());
    render(<AnnualReportExtraction />);
    const popup = await openPopup('Revenue: extracted');
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
    const popup = await openPopup('Writing tone: extracted');
    expect(within(popup).getByText('تتمثل رؤية أرامكو السعودية')).toHaveAttribute('dir', 'auto');
  });

  it('folds a long contents page', async () => {
    getExtraction.mockResolvedValue(fullExtraction());
    render(<AnnualReportExtraction />);
    const popup = await openPopup('Contents page (previous outline): extracted');
    expect(within(popup).getByText('Entry 15')).toBeInTheDocument();
    expect(within(popup).queryByText('Entry 16')).not.toBeInTheDocument();
    fireEvent.click(within(popup).getByText('Show all 20'));
    expect(within(popup).getByText('Entry 20')).toBeInTheDocument();
  });

  it('says what is missing instead of hiding it', async () => {
    getExtraction.mockResolvedValue(emptyExtraction());
    render(<AnnualReportExtraction />);
    const popup = await openPopup('Contents page (previous outline): not extracted');
    expect(within(popup).getByText('No sections were created from this report.')).toBeInTheDocument();
  });

  it('closes the popup with the close button', async () => {
    getExtraction.mockResolvedValue(fullExtraction());
    render(<AnnualReportExtraction />);
    const popup = await openPopup('Writing tone: extracted');
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
    expect(await screen.findByLabelText('Writing tone: extracted')).toBeInTheDocument();
    for (const label of FALLBACK_LABELS) {
      expect(screen.getByLabelText(`${label}: extracted`)).toBeInTheDocument();
    }
  });

  it('shows a cross for every part when nothing was extracted', async () => {
    getExtraction.mockResolvedValue(emptyExtraction());
    render(<AnnualReportExtraction />);
    expect(await screen.findByLabelText('Writing tone: not extracted')).toBeInTheDocument();
    for (const label of FALLBACK_LABELS) {
      expect(screen.getByLabelText(`${label}: not extracted`)).toBeInTheDocument();
    }
  });

  it('opens the tone details in a popup', async () => {
    getExtraction.mockResolvedValue(fullExtraction());
    render(<AnnualReportExtraction />);
    fireEvent.click(await screen.findByLabelText('Writing tone: extracted'));
    const popup = await screen.findByRole('dialog');
    expect(within(popup).getByText('Use formal language.')).toBeInTheDocument();
    expect(within(popup).queryByText('strategic growth')).not.toBeInTheDocument();
  });

  it('opens the previous outline sections in a popup', async () => {
    getExtraction.mockResolvedValue(fullExtraction());
    render(<AnnualReportExtraction />);
    fireEvent.click(await screen.findByLabelText('Contents page (previous outline): extracted'));
    const popup = await screen.findByRole('dialog');
    expect(within(popup).getByText('generate (confirmed)')).toBeInTheDocument();
  });
});

describe('AnnualReportExtraction live table', () => {
  beforeEach(() => {
    getExtraction.mockReset();
  });

  it('draws every live state with its own label, value and reason', async () => {
    const steps = liveSteps('pending', {
      read: { state: 'done', value: '168 pages' },
      tone: { state: 'running' },
      outline: { state: 'failed', reason: 'no_contents_page_found', message: 'We could not find a contents page in the first 25 pages.' },
      departments: { state: 'skipped', reason: 'older_year', message: 'Older than your FY-2024 report, so this was not replaced.' },
    });
    getExtraction.mockResolvedValue(liveExtraction(true, steps));
    const { unmount } = render(<AnnualReportExtraction />);

    const done = await screen.findByLabelText('Reading the report: extracted');
    expect(within(done).getByText('168 pages')).toBeInTheDocument();
    expect(screen.getByLabelText('Writing tone: in progress')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByLabelText('Themes: waiting')).toBeInTheDocument();
    const failed = screen.getByLabelText('Contents page (previous outline): not extracted');
    expect(within(failed).getByText('We could not find a contents page in the first 25 pages.')).toBeInTheDocument();
    const skipped = screen.getByLabelText('Suggested departments: skipped');
    expect(within(skipped).getByText('Older than your FY-2024 report, so this was not replaced.')).toBeInTheDocument();
    expect(screen.getByLabelText('ESG frameworks: waiting')).toBeInTheDocument();
    expect(screen.getByText('3 of 11 finished')).toBeInTheDocument();
    unmount();
  });

  it('keeps a row closed while it is still being worked on', async () => {
    getExtraction.mockResolvedValue(liveExtraction(true, liveSteps('done', { tone: { state: 'running' } })));
    const { unmount } = render(<AnnualReportExtraction />);
    fireEvent.click(await screen.findByLabelText('Writing tone: in progress'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    unmount();
  });

  it('opens the details popup from a finished live row', async () => {
    getExtraction.mockResolvedValue(liveExtraction(false, liveSteps('done')));
    render(<AnnualReportExtraction />);
    fireEvent.click(await screen.findByLabelText('Net profit: extracted'));
    const popup = await screen.findByRole('dialog');
    expect(within(popup).getByText('398')).toBeInTheDocument();
  });

  it('shows the file, the year and the newest-report line in the banner', async () => {
    getExtraction.mockResolvedValue(liveExtraction(true, liveSteps('pending')));
    const { unmount } = render(<AnnualReportExtraction />);
    expect(await screen.findByText('Reading your report now')).toBeInTheDocument();
    expect(screen.getByText('aramco.pdf')).toBeInTheDocument();
    expect(screen.getByText('FY-2024')).toBeInTheDocument();
    expect(screen.getByText('Newest report: replaces your company-wide results')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '55');
    unmount();
  });

  it.each([
    ['first_report', true, 'First report: sets your company-wide results'],
    ['same_year_reupload', true, 'Same year uploaded again: replaces the earlier FY-2024 results'],
    ['older_year', false, 'Older than your FY-2024 report: kept for reference, company-wide results unchanged'],
    ['unknown_year', false, "We could not tell this report's year, so company-wide results were left unchanged"],
  ] as const)('words the banner for %s', async (reason, overrules, sentence) => {
    const run = liveRun({
      overrule_reason: reason,
      overrules,
      lead_period: reason === 'older_year' ? 'FY-2022' : reason === 'unknown_year' ? null : 'FY-2024',
      latest_period_before: reason === 'first_report' ? null : 'FY-2024',
    });
    getExtraction.mockResolvedValue(liveExtraction(false, liveSteps('done'), run));
    render(<AnnualReportExtraction />);
    expect(await screen.findByText(sentence)).toBeInTheDocument();
    expect(screen.getByText('Last report we read')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('does not blame the year when only a sustainability report was uploaded', async () => {
    // No annual file means no lead year, which the backend also sends as 'unknown_year'.
    const run = liveRun({
      files: [{ document_id: 'doc-9', filename: 'esg.pdf', doc_type: 'esg', period: 'FY-2024' }],
      lead_period: null,
      latest_period_before: 'FY-2024',
      overrules: false,
      overrule_reason: 'unknown_year',
    });
    getExtraction.mockResolvedValue(liveExtraction(false, liveSteps('done'), run));
    render(<AnnualReportExtraction />);
    expect(await screen.findByText('Sustainability report only: company-wide results unchanged')).toBeInTheDocument();
    expect(screen.queryByText(/We could not tell this report's year/)).not.toBeInTheDocument();
  });

  it('keeps the first-report line for a sustainability-only first upload', async () => {
    const run = liveRun({
      files: [{ document_id: 'doc-9', filename: 'esg.pdf', doc_type: 'esg', period: 'FY-2024' }],
      lead_period: null,
      latest_period_before: null,
      overrules: true,
      overrule_reason: 'first_report',
    });
    getExtraction.mockResolvedValue(liveExtraction(false, liveSteps('done'), run));
    render(<AnnualReportExtraction />);
    expect(await screen.findByText('First report: sets your company-wide results')).toBeInTheDocument();
  });

  it('ends the unfinished rows and says so when the run stopped half way', async () => {
    // The backend stops calling a run "running" 15 minutes after it started, or
    // after a restart, while the recorded steps still say running / pending.
    const steps = liveSteps('pending', {
      read: { state: 'done', value: '168 pages' },
      tone: { state: 'running' },
    });
    getExtraction.mockResolvedValue(liveExtraction(false, steps));
    render(<AnnualReportExtraction />);

    expect(await screen.findByText(/This run stopped before it finished/)).toBeInTheDocument();
    expect(screen.getByLabelText('Reading the report: extracted')).toBeInTheDocument();
    const tone = screen.getByLabelText('Writing tone: skipped');
    expect(within(tone).getByText('This step did not finish.')).toBeInTheDocument();
    expect(tone).not.toHaveAttribute('aria-busy');
    expect(screen.getByLabelText('Themes: skipped')).toBeInTheDocument();
    expect(screen.queryByText('Working on it…')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/: (in progress|waiting)$/)).not.toBeInTheDocument();
  });

  it('shows no banner for a company with no recorded run', async () => {
    getExtraction.mockResolvedValue(liveExtraction(false, liveSteps('done'), null));
    render(<AnnualReportExtraction />);
    await screen.findByLabelText('Writing tone: extracted');
    expect(screen.queryByText(/Last report we read|Reading your report now/)).not.toBeInTheDocument();
  });

  it('falls back to waiting bars from the status when "live" is missing mid-run', async () => {
    const data = emptyExtraction();
    data.status.report_extraction_status = 'processing';
    getExtraction.mockResolvedValue(data);
    const { unmount } = render(<AnnualReportExtraction />);
    expect(await screen.findByLabelText('Writing tone: waiting')).toBeInTheDocument();
    expect(screen.getByText('Reading your report now')).toBeInTheDocument();
    unmount();
  });

  it('says the backend is too old on a 404', async () => {
    getExtraction.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));
    render(<AnnualReportExtraction />);
    expect(await screen.findByText(
      'This needs the latest backend version. Please try again after the next deploy.',
    )).toBeInTheDocument();
  });
});

describe('AnnualReportExtraction polling', () => {
  beforeEach(() => {
    getExtraction.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Lets pending promises settle and moves the clock on by `ms`. */
  async function advance(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  it('polls every 2 s while running, updates the rows, then stops', async () => {
    const onRunningChange = vi.fn();
    getExtraction
      .mockResolvedValueOnce(liveExtraction(true, liveSteps('pending', { read: { state: 'running' } })))
      .mockResolvedValueOnce(liveExtraction(true, liveSteps('pending', { read: { state: 'done', value: '168 pages' }, tone: { state: 'running' } })))
      .mockResolvedValue(liveExtraction(false, liveSteps('done')));
    render(<AnnualReportExtraction onRunningChange={onRunningChange} />);

    await advance(0);
    expect(getExtraction).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Reading the report: in progress')).toBeInTheDocument();
    expect(onRunningChange).toHaveBeenLastCalledWith(true);

    await advance(2000);
    expect(getExtraction).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Reading the report: extracted')).toBeInTheDocument();
    expect(screen.getByLabelText('Writing tone: in progress')).toBeInTheDocument();

    await advance(2000);
    expect(getExtraction).toHaveBeenCalledTimes(3);
    expect(screen.getByLabelText('Writing tone: extracted')).toBeInTheDocument();
    expect(onRunningChange).toHaveBeenLastCalledWith(false);

    await advance(20000);
    expect(getExtraction).toHaveBeenCalledTimes(3);
  });

  it('does not poll at all when nothing is running', async () => {
    getExtraction.mockResolvedValue(liveExtraction(false, liveSteps('done')));
    render(<AnnualReportExtraction />);
    await advance(0);
    await advance(20000);
    expect(getExtraction).toHaveBeenCalledTimes(1);
  });

  it('stops polling when the panel is removed', async () => {
    getExtraction.mockResolvedValue(liveExtraction(true, liveSteps('pending')));
    const { unmount } = render(<AnnualReportExtraction />);
    await advance(0);
    await advance(2000);
    expect(getExtraction).toHaveBeenCalledTimes(2);
    unmount();
    await advance(20000);
    expect(getExtraction).toHaveBeenCalledTimes(2);
  });

  it('keeps the last rows and slows down when a poll fails', async () => {
    getExtraction
      .mockResolvedValueOnce(liveExtraction(true, liveSteps('pending', { read: { state: 'done', value: '168 pages' } })))
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue(liveExtraction(false, liveSteps('done')));
    render(<AnnualReportExtraction />);
    await advance(0);
    await advance(2000);
    expect(getExtraction).toHaveBeenCalledTimes(2);
    // The failed poll changes nothing on screen.
    expect(screen.getByText('168 pages')).toBeInTheDocument();
    expect(screen.queryByText(/Could not load/)).not.toBeInTheDocument();
    // The next try waits 4 s, not 2 s.
    await advance(2000);
    expect(getExtraction).toHaveBeenCalledTimes(2);
    await advance(2000);
    expect(getExtraction).toHaveBeenCalledTimes(3);
    expect(screen.getByLabelText('Writing tone: extracted')).toBeInTheDocument();
  });

  it('gives up calmly after 15 minutes', async () => {
    const onRunningChange = vi.fn();
    getExtraction.mockResolvedValue(liveExtraction(true, liveSteps('pending')));
    render(<AnnualReportExtraction onRunningChange={onRunningChange} />);
    await advance(0);
    await advance(15 * 60 * 1000 + 2000);
    const callsAtGiveUp = getExtraction.mock.calls.length;
    expect(screen.getByText(/This is taking longer than usual/)).toBeInTheDocument();
    expect(onRunningChange).toHaveBeenLastCalledWith(false);
    await advance(60000);
    expect(getExtraction).toHaveBeenCalledTimes(callsAtGiveUp);
  });

  it('keeps asking after Process when the first answer still says not running', async () => {
    const onRunningChange = vi.fn();
    getExtraction.mockResolvedValue(liveExtraction(false, liveSteps('done')));
    const { rerender } = render(<AnnualReportExtraction refreshKey={0} onRunningChange={onRunningChange} />);
    await advance(0);
    expect(getExtraction).toHaveBeenCalledTimes(1);

    getExtraction
      .mockResolvedValueOnce(liveExtraction(false, liveSteps('done')))
      .mockResolvedValue(liveExtraction(true, liveSteps('pending', { read: { state: 'running' } })));
    onRunningChange.mockClear();
    rerender(<AnnualReportExtraction refreshKey={1} onRunningChange={onRunningChange} />);
    await advance(0);
    expect(getExtraction).toHaveBeenCalledTimes(2);
    // Inside the start grace a "not running" answer is not believed yet.
    expect(onRunningChange).not.toHaveBeenCalled();
    await advance(2000);
    expect(getExtraction).toHaveBeenCalledTimes(3);
    expect(onRunningChange).toHaveBeenLastCalledWith(true);
  });

  it('believes "not running" once the start grace is over', async () => {
    const onRunningChange = vi.fn();
    getExtraction.mockResolvedValue(liveExtraction(false, liveSteps('done')));
    const { rerender } = render(<AnnualReportExtraction refreshKey={0} onRunningChange={onRunningChange} />);
    await advance(0);
    onRunningChange.mockClear();
    rerender(<AnnualReportExtraction refreshKey={1} onRunningChange={onRunningChange} />);
    await advance(0);
    await advance(6000);
    expect(onRunningChange).toHaveBeenLastCalledWith(false);
    const callsWhenStopped = getExtraction.mock.calls.length;
    await advance(30000);
    expect(getExtraction).toHaveBeenCalledTimes(callsWhenStopped);
  });

  it('does not unlock the form when the polls right after Process fail', async () => {
    const onRunningChange = vi.fn();
    getExtraction.mockResolvedValue(liveExtraction(false, liveSteps('done')));
    const { rerender } = render(<AnnualReportExtraction refreshKey={0} onRunningChange={onRunningChange} />);
    await advance(0);

    // Three failures (at 0 s, 4 s and 12 s) take the loop well past the 6 s start grace.
    getExtraction
      .mockRejectedValueOnce(new Error('down'))
      .mockRejectedValueOnce(new Error('down'))
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue(liveExtraction(true, liveSteps('pending', { read: { state: 'running' } })));
    onRunningChange.mockClear();
    rerender(<AnnualReportExtraction refreshKey={1} onRunningChange={onRunningChange} />);
    await advance(0);
    await advance(4000);
    await advance(8000);
    expect(getExtraction).toHaveBeenCalledTimes(4);
    // No answer yet, so nothing was concluded and the old rows are still there.
    expect(onRunningChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Writing tone: extracted')).toBeInTheDocument();
    await advance(10000);
    expect(getExtraction).toHaveBeenCalledTimes(5);
    expect(onRunningChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByLabelText('Reading the report: in progress')).toBeInTheDocument();
  });

  it('retries after Process even when the first page load had failed', async () => {
    const onRunningChange = vi.fn();
    getExtraction.mockRejectedValue(new Error('down'));
    const { rerender } = render(<AnnualReportExtraction refreshKey={0} onRunningChange={onRunningChange} />);
    await advance(0);
    expect(screen.getByText(/Could not load what was extracted/)).toBeInTheDocument();

    getExtraction.mockReset();
    getExtraction
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue(liveExtraction(true, liveSteps('pending', { read: { state: 'running' } })));
    onRunningChange.mockClear();
    rerender(<AnnualReportExtraction refreshKey={1} onRunningChange={onRunningChange} />);
    await advance(0);
    expect(onRunningChange).not.toHaveBeenCalled();
    expect(screen.queryByText(/Could not load what was extracted/)).not.toBeInTheDocument();
    await advance(4000);
    expect(onRunningChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByLabelText('Reading the report: in progress')).toBeInTheDocument();
  });

  it('unlocks the form but keeps looking slowly when a recent run stalled', async () => {
    const onRunningChange = vi.fn();
    const stalled = liveExtraction(false, liveSteps('pending', { read: { state: 'done', value: '168 pages' }, tone: { state: 'running' } }));
    // Started 20 minutes ago: past the backend's 15-minute window, but maybe still alive.
    stalled.status.onboarding_progress = {
      ...stalled.status.onboarding_progress,
      started_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    };
    getExtraction
      .mockResolvedValueOnce(stalled)
      .mockResolvedValue(liveExtraction(false, liveSteps('done')));
    render(<AnnualReportExtraction onRunningChange={onRunningChange} />);
    await advance(0);
    expect(onRunningChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByLabelText('Writing tone: skipped')).toBeInTheDocument();

    await advance(2000);
    expect(getExtraction).toHaveBeenCalledTimes(1);
    await advance(8000);
    expect(getExtraction).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Writing tone: extracted')).toBeInTheDocument();
    expect(screen.queryByText(/This run stopped before it finished/)).not.toBeInTheDocument();
    // The run finished, so there is nothing left to look for.
    await advance(30000);
    expect(getExtraction).toHaveBeenCalledTimes(2);
  });

  it('does not keep looking at a stalled run with no recent start time', async () => {
    getExtraction.mockResolvedValue(liveExtraction(false, liveSteps('pending', { tone: { state: 'running' } })));
    render(<AnnualReportExtraction />);
    await advance(0);
    await advance(30000);
    expect(getExtraction).toHaveBeenCalledTimes(1);
  });

  it('reloads without blanking the rows when the page starts a new run', async () => {
    getExtraction.mockResolvedValue(liveExtraction(false, liveSteps('done')));
    const { rerender } = render(<AnnualReportExtraction refreshKey={0} />);
    await advance(0);
    getExtraction.mockResolvedValue(liveExtraction(true, liveSteps('pending', { read: { state: 'running' } })));
    rerender(<AnnualReportExtraction refreshKey={1} />);
    // Still showing the old rows while the reload is in flight.
    expect(screen.getByLabelText('Writing tone: extracted')).toBeInTheDocument();
    await advance(0);
    expect(screen.getByLabelText('Reading the report: in progress')).toBeInTheDocument();
  });
});
