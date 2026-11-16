import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import type {
  AnnualReportExtraction as Extraction,
  LiveRun,
  LiveStep,
  LiveStepState,
} from '@/types/company';

// The "Last report we read" strip on Upload Previous Reports (AnnualReportExtraction),
// the loading / polling it does for the page, and the detail blocks the chip popups
// reuse. The 11-row table is no longer on the page; it only appears inside the
// General info popup, so it is tested on its own here (LiveStepsTable).

const getExtraction = vi.fn();

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { company_id: 'co-1' } }),
}));

vi.mock('@/lib/api', () => ({
  companies: { getAnnualReportExtraction: getExtraction },
}));

const {
  default: AnnualReportExtraction,
  SummaryDetails,
  SummaryPopup,
} = await import('@/components/reports/AnnualReportExtraction');
const { LiveStepsTable } = await import('@/components/reports/ExtractionLiveTable');
const { chipSteps } = await import('@/components/reports/extractionLive');

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

/** The state of one step in the last result handed to the page through onData. */
function lastState(onData: ReturnType<typeof vi.fn>, key: string): LiveStepState | undefined {
  const data = onData.mock.lastCall?.[0] as Extraction | undefined;
  if (!data) return undefined;
  return chipSteps(data).find((step) => step.key === key)?.state;
}

describe('the "Last report we read" strip', () => {
  // Braces matter: a function returned from beforeEach is run as a cleanup step,
  // and mockReset() returns the mock — vitest would call the fake request again.
  beforeEach(() => {
    getExtraction.mockReset();
  });

  it('shows only the strip, with no table of steps on the page', async () => {
    getExtraction.mockResolvedValue(liveExtraction(false, liveSteps('done')));
    render(<AnnualReportExtraction />);
    expect(await screen.findByText('Last report we read')).toBeInTheDocument();
    expect(getExtraction).toHaveBeenCalledWith('co-1');
    expect(screen.queryByText('What we extracted from your annual report')).not.toBeInTheDocument();
    expect(screen.queryByText('What we read')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Writing tone: extracted')).not.toBeInTheDocument();
  });

  it('hands every loaded result to the page, for the chips on the file row', async () => {
    const onData = vi.fn();
    getExtraction.mockResolvedValue(liveExtraction(false, liveSteps('done')));
    render(<AnnualReportExtraction onData={onData} />);
    await waitFor(() => expect(onData).toHaveBeenCalled());
    expect(lastState(onData, 'tone')).toBe('done');
  });

  it('shows the file, the year and the newest-report line, with progress while reading', async () => {
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
  ] as const)('words the strip for %s', async (reason, overrules, sentence) => {
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

  it('says so when a run stopped half way, and ends its unfinished steps', async () => {
    // The backend stops calling a run "running" 15 minutes after its last save, or
    // after a restart, while the recorded steps still say running / pending.
    const onData = vi.fn();
    const steps = liveSteps('pending', {
      read: { state: 'done', value: '168 pages' },
      tone: { state: 'running' },
    });
    getExtraction.mockResolvedValue(liveExtraction(false, steps));
    render(<AnnualReportExtraction onData={onData} />);
    expect(await screen.findByText(/This run stopped before it finished/)).toBeInTheDocument();
    expect(lastState(onData, 'read')).toBe('done');
    expect(lastState(onData, 'tone')).toBe('skipped');
    expect(lastState(onData, 'themes')).toBe('skipped');
  });

  it('shows no strip for a company with no recorded run', async () => {
    const onData = vi.fn();
    getExtraction.mockResolvedValue(liveExtraction(false, liveSteps('done'), null));
    render(<AnnualReportExtraction onData={onData} />);
    await waitFor(() => expect(onData).toHaveBeenCalled());
    expect(screen.queryByText(/Last report we read|Reading your report now/)).not.toBeInTheDocument();
  });

  it('falls back to the status when "live" is missing mid-run', async () => {
    const onData = vi.fn();
    const data = emptyExtraction();
    data.status.report_extraction_status = 'processing';
    getExtraction.mockResolvedValue(data);
    const { unmount } = render(<AnnualReportExtraction onData={onData} />);
    expect(await screen.findByText('Reading your report now')).toBeInTheDocument();
    expect(lastState(onData, 'tone')).toBe('pending');
    unmount();
  });

  it('shows the parts the server could not read', async () => {
    const data = liveExtraction(false, liveSteps('done'));
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

  it('says the backend is too old on a 404', async () => {
    getExtraction.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));
    render(<AnnualReportExtraction />);
    expect(await screen.findByText(
      'This needs the latest backend version. Please try again after the next deploy.',
    )).toBeInTheDocument();
  });
});

describe('steps worked out from stored data (no "live" block)', () => {
  it('is a tick for every part of a full extraction', () => {
    const steps = chipSteps(fullExtraction());
    expect(steps).toHaveLength(10);
    for (const step of steps) expect(step.state).toBe('done');
  });

  it('is a cross for every part when nothing was extracted', () => {
    for (const step of chipSteps(emptyExtraction())) expect(step.state).toBe('failed');
  });
});

describe('the detail popups the chips open', () => {
  function renderDetails(summaryKey: 'tone' | 'dashboard' | 'outline' | 'departments', data = fullExtraction()) {
    const onClose = vi.fn();
    render(
      <SummaryPopup title="Details" onClose={onClose}>
        <SummaryDetails summaryKey={summaryKey} data={data} />
      </SummaryPopup>,
    );
    return { popup: screen.getByRole('dialog'), onClose };
  }

  it('shows the revenue and profit', () => {
    const { popup } = renderDetails('dashboard');
    expect(within(popup).getByText('398')).toBeInTheDocument();
    expect(within(popup).getByText('مليار')).toBeInTheDocument();
  });

  it('shows the departments', () => {
    const { popup } = renderDetails('departments');
    expect(within(popup).getByText('Matches an existing department')).toBeInTheDocument();
  });

  it('shows the tone and keeps an Arabic quote in its own direction', () => {
    const { popup } = renderDetails('tone');
    expect(within(popup).getByText('Use formal language.')).toBeInTheDocument();
    expect(within(popup).getByText('تتمثل رؤية أرامكو السعودية')).toHaveAttribute('dir', 'auto');
    expect(within(popup).queryByText('strategic growth')).not.toBeInTheDocument();
  });

  it('shows the outline sections and folds a long contents page', () => {
    const { popup } = renderDetails('outline');
    expect(within(popup).getByText('generate (confirmed)')).toBeInTheDocument();
    expect(within(popup).getByText('Entry 15')).toBeInTheDocument();
    expect(within(popup).queryByText('Entry 16')).not.toBeInTheDocument();
    fireEvent.click(within(popup).getByText('Show all 20'));
    expect(within(popup).getByText('Entry 20')).toBeInTheDocument();
  });

  it('says what is missing instead of hiding it', () => {
    const { popup } = renderDetails('outline', emptyExtraction());
    expect(within(popup).getByText('No sections were created from this report.')).toBeInTheDocument();
  });

  it('closes with the close button and with Escape', () => {
    const { popup, onClose } = renderDetails('tone');
    fireEvent.click(within(popup).getByLabelText('Close'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('the step list inside the General info popup', () => {
  it('draws every state with its own label, value and reason', () => {
    const steps = liveSteps('pending', {
      read: { state: 'done', value: '168 pages' },
      tone: { state: 'running' },
      outline: { state: 'failed', reason: 'no_contents_page_found', message: 'We could not find a contents page in the first 25 pages.' },
      departments: { state: 'skipped', reason: 'older_year', message: 'Older than your FY-2024 report, so this was not replaced.' },
    });
    render(<LiveStepsTable steps={steps} onOpen={vi.fn()} />);
    expect(within(screen.getByLabelText('Reading the report: extracted')).getByText('168 pages')).toBeInTheDocument();
    expect(screen.getByLabelText('Writing tone: in progress')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByLabelText('Themes: waiting')).toBeInTheDocument();
    const failed = screen.getByLabelText('Contents page (previous outline): not extracted');
    expect(within(failed).getByText('We could not find a contents page in the first 25 pages.')).toBeInTheDocument();
    const skipped = screen.getByLabelText('Suggested departments: skipped');
    expect(within(skipped).getByText('Older than your FY-2024 report, so this was not replaced.')).toBeInTheDocument();
    expect(screen.getByText('3 of 11 finished')).toBeInTheDocument();
  });

  it('opens a finished row with details, but not one still being worked on', () => {
    const onOpen = vi.fn();
    render(<LiveStepsTable steps={liveSteps('done', { tone: { state: 'running' } })} onOpen={onOpen} />);
    fireEvent.click(screen.getByLabelText('Writing tone: in progress'));
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Net profit: extracted'));
    expect(onOpen).toHaveBeenCalledWith('dashboard');
  });
});

describe('polling for the page', () => {
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

  it('polls every 2 s while running, passes each result on, then stops', async () => {
    const onRunningChange = vi.fn();
    const onData = vi.fn();
    getExtraction
      .mockResolvedValueOnce(liveExtraction(true, liveSteps('pending', { read: { state: 'running' } })))
      .mockResolvedValueOnce(liveExtraction(true, liveSteps('pending', { read: { state: 'done', value: '168 pages' }, tone: { state: 'running' } })))
      .mockResolvedValue(liveExtraction(false, liveSteps('done')));
    render(<AnnualReportExtraction onRunningChange={onRunningChange} onData={onData} />);

    await advance(0);
    expect(getExtraction).toHaveBeenCalledTimes(1);
    expect(lastState(onData, 'read')).toBe('running');
    expect(onRunningChange).toHaveBeenLastCalledWith(true);

    await advance(2000);
    expect(getExtraction).toHaveBeenCalledTimes(2);
    expect(lastState(onData, 'read')).toBe('done');
    expect(lastState(onData, 'tone')).toBe('running');

    await advance(2000);
    expect(getExtraction).toHaveBeenCalledTimes(3);
    expect(lastState(onData, 'tone')).toBe('done');
    expect(onRunningChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByText('Last report we read')).toBeInTheDocument();

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

  it('keeps the last result and slows down when a poll fails', async () => {
    const onData = vi.fn();
    getExtraction
      .mockResolvedValueOnce(liveExtraction(true, liveSteps('pending', { read: { state: 'done', value: '168 pages' } })))
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue(liveExtraction(false, liveSteps('done')));
    render(<AnnualReportExtraction onData={onData} />);
    await advance(0);
    await advance(2000);
    expect(getExtraction).toHaveBeenCalledTimes(2);
    // The failed poll changes nothing on screen.
    expect(screen.getByText('Reading your report now')).toBeInTheDocument();
    expect(screen.queryByText(/Could not load/)).not.toBeInTheDocument();
    // The next try waits 4 s, not 2 s.
    await advance(2000);
    expect(getExtraction).toHaveBeenCalledTimes(2);
    await advance(2000);
    expect(getExtraction).toHaveBeenCalledTimes(3);
    expect(lastState(onData, 'tone')).toBe('done');
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
    const onData = vi.fn();
    getExtraction.mockResolvedValue(liveExtraction(false, liveSteps('done')));
    const { rerender } = render(
      <AnnualReportExtraction refreshKey={0} onRunningChange={onRunningChange} onData={onData} />,
    );
    await advance(0);

    // Three failures (at 0 s, 4 s and 12 s) take the loop well past the 6 s start grace.
    getExtraction
      .mockRejectedValueOnce(new Error('down'))
      .mockRejectedValueOnce(new Error('down'))
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue(liveExtraction(true, liveSteps('pending', { read: { state: 'running' } })));
    onRunningChange.mockClear();
    rerender(<AnnualReportExtraction refreshKey={1} onRunningChange={onRunningChange} onData={onData} />);
    await advance(0);
    await advance(4000);
    await advance(8000);
    expect(getExtraction).toHaveBeenCalledTimes(4);
    // No answer yet, so nothing was concluded and the old result is still shown.
    expect(onRunningChange).not.toHaveBeenCalled();
    expect(screen.getByText('Last report we read')).toBeInTheDocument();
    await advance(10000);
    expect(getExtraction).toHaveBeenCalledTimes(5);
    expect(onRunningChange).toHaveBeenLastCalledWith(true);
    expect(lastState(onData, 'read')).toBe('running');
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
    expect(screen.getByText('Reading your report now')).toBeInTheDocument();
  });

  it('unlocks the form but keeps looking slowly when a recent run stalled', async () => {
    const onRunningChange = vi.fn();
    const onData = vi.fn();
    const stalled = liveExtraction(false, liveSteps('pending', { read: { state: 'done', value: '168 pages' }, tone: { state: 'running' } }));
    // Started 20 minutes ago: past the backend's 15-minute window, but maybe still alive.
    stalled.status.onboarding_progress = {
      ...stalled.status.onboarding_progress,
      started_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    };
    getExtraction
      .mockResolvedValueOnce(stalled)
      .mockResolvedValue(liveExtraction(false, liveSteps('done')));
    render(<AnnualReportExtraction onRunningChange={onRunningChange} onData={onData} />);
    await advance(0);
    expect(onRunningChange).toHaveBeenLastCalledWith(false);
    expect(lastState(onData, 'tone')).toBe('skipped');

    await advance(2000);
    expect(getExtraction).toHaveBeenCalledTimes(1);
    await advance(8000);
    expect(getExtraction).toHaveBeenCalledTimes(2);
    expect(lastState(onData, 'tone')).toBe('done');
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

  it('reloads without blanking the strip when the page starts a new run', async () => {
    getExtraction.mockResolvedValue(liveExtraction(false, liveSteps('done')));
    const { rerender } = render(<AnnualReportExtraction refreshKey={0} />);
    await advance(0);
    getExtraction.mockResolvedValue(liveExtraction(true, liveSteps('pending', { read: { state: 'running' } })));
    rerender(<AnnualReportExtraction refreshKey={1} />);
    // Still showing the old strip while the reload is in flight.
    expect(screen.getByText('Last report we read')).toBeInTheDocument();
    await advance(0);
    expect(screen.getByText('Reading your report now')).toBeInTheDocument();
  });
});
