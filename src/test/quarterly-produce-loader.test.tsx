// The loader between the quarterly Outline and Preview screens, which had no tests.
//
// It used to arm one blind 45-second timer at mount over a four-call chain
// (getOutline → saveOutline → lockOutline → produceAll) with no liveness input, so it
// could not tell "still working" from "never started". On a real outline that chain
// costs one Supabase round-trip per section — the lock→produce window alone measures
// 22-39s across real reports — so the timer fired on healthy runs and painted "Report
// generation failed" over them. Worse, the error was sticky and rendered above the
// poll, so a run that succeeded seconds later stayed hidden behind the card forever.
//
// These pin the rule that replaced it: a clock never decides. Only the server saying
// no is a failure, and a run we can watch always outranks an earlier complaint.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

import ProcessingPage, { type ProcessingPageState } from '@/pages/ProcessingPage';
import { quarterlyReports, agentRuns, ApiError } from '@/lib/api';

// Spread the real module so `ApiError` stays the REAL class: the bootstrap catch does
// `err instanceof ApiError`, and a hand-rolled stub with a different constructor
// signature puts the body where statusText goes — err.message silently becomes
// "API 409 undefined — undefined" and assertions pass or fail for the wrong reason.
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    quarterlyReports: {
      getOutline: vi.fn(),
      saveOutline: vi.fn(),
      lockOutline: vi.fn(),
      produceAll: vi.fn(),
    },
    agentRuns: { getByPollUrl: vi.fn(), getNodes: vi.fn() },
    reports: { getCoverage: vi.fn() },
  };
});

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { company_name: 'ACME' } }),
}));

const getOutline = quarterlyReports.getOutline as unknown as ReturnType<typeof vi.fn>;
const saveOutline = quarterlyReports.saveOutline as unknown as ReturnType<typeof vi.fn>;
const lockOutline = quarterlyReports.lockOutline as unknown as ReturnType<typeof vi.fn>;
const produceAll = quarterlyReports.produceAll as unknown as ReturnType<typeof vi.fn>;
const getByPollUrl = agentRuns.getByPollUrl as unknown as ReturnType<typeof vi.fn>;
const getNodes = agentRuns.getNodes as unknown as ReturnType<typeof vi.fn>;

const bootState: ProcessingPageState = {
  runId: '',
  pollUrl: '',
  reportId: 'rpt_1',
  companyId: 'co_1',
  estimatedDurationSeconds: null,
  fileName: null,
  isExisting: false,
  reportType: 'quarterly',
  quarterlyNext: 'preview',
  bootstrap: { kind: 'quarterly-produce', outlinePayload: { sections: [] } },
};

// Renders the catch-all so a navigate() away from the loader is assertable.
function Elsewhere() {
  const loc = useLocation();
  return <div data-testid="went-to">{loc.pathname}</div>;
}

function renderLoader(state: ProcessingPageState = bootState) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/reports/processing', state }]}>
      <Routes>
        <Route path="/reports/processing" element={<ProcessingPage />} />
        <Route path="*" element={<Elsewhere />} />
      </Routes>
    </MemoryRouter>,
  );
}

const unlocked = { report_id: 'rpt_1', company_id: 'co_1', locked: false, sections: [] };
const locked = {
  report_id: 'rpt_1',
  company_id: 'co_1',
  locked: true,
  sections: [{ section_code: 'cover', locked: true }],
};

const tick = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  getOutline.mockResolvedValue(unlocked);
  saveOutline.mockResolvedValue({});
  lockOutline.mockResolvedValue({});
  produceAll.mockResolvedValue({ run_id: 'run_1', poll_url: '/api/v1/agent_runs/run_1' });
  getByPollUrl.mockResolvedValue({ run_id: 'run_1', status: 'running', output_summary: null });
  getNodes.mockResolvedValue({ nodes: [] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('a slow chain is never called a failure', () => {
  it('says nothing about failure while a call is still in flight, however long it takes', async () => {
    // The bug, reproduced: the chain is healthy, just slow. It used to be declared
    // failed at exactly 45s.
    let releaseLock: () => void = () => {};
    lockOutline.mockImplementation(
      () => new Promise<void>((resolve) => { releaseLock = () => resolve(); }),
    );

    renderLoader();
    await tick(5 * 60_000); // five minutes, more than six times the old deadline

    expect(screen.queryByText(/Report generation failed/i)).toBeNull();
    expect(screen.queryByText(/Generation did not start/i)).toBeNull();
    expect(produceAll).not.toHaveBeenCalled();

    // …and it still finishes normally when the slow call finally lands.
    await act(async () => { releaseLock(); });
    await waitFor(() => expect(produceAll).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/Report generation failed/i)).toBeNull();
  });

  it('names the step it is on instead of guessing a percentage', async () => {
    lockOutline.mockImplementation(() => new Promise<void>(() => {}));
    renderLoader();
    await tick(1_000);
    expect(await screen.findByText(/Locking the outline/i)).toBeInTheDocument();
  });
});

describe('a live run outranks an earlier complaint', () => {
  it('a chain that finishes late still ends up watching its run, not stuck on a card', async () => {
    // The exact shape of the reported bug. produceAll is held past the old 45s
    // deadline and then succeeds. Before the fix the timer fired at 45s, nothing ever
    // cleared bootError, and its early return sat above every poll-driven render — so
    // the page held a live, healthy run handle AND showed "Report generation failed"
    // for ever, right through the report completing.
    let releaseProduce: (v: unknown) => void = () => {};
    produceAll.mockImplementation(
      () => new Promise((resolve) => { releaseProduce = resolve; }),
    );

    renderLoader();
    await waitFor(() => expect(lockOutline).toHaveBeenCalled());
    await tick(60_000); // well past the old deadline, with produce still in flight

    await act(async () => {
      releaseProduce({ run_id: 'run_1', poll_url: '/api/v1/agent_runs/run_1' });
    });
    await tick(3_500);

    expect(screen.queryByText(/Report generation failed/i)).toBeNull();
    expect(screen.queryByText(/Generation did not start/i)).toBeNull();
    expect(await screen.findByText(/Composing your report/i)).toBeInTheDocument();
  });
});

describe('the failure card only appears when the server actually refused', () => {
  it('surfaces a real rejection from the save', async () => {
    // The anti-swallow guard. This 409 leaves the outline UNLOCKED and no section
    // rows created, so handing off to Preview would show "0 of 27" for ever.
    saveOutline.mockRejectedValue(
      new ApiError(
        409,
        'Conflict',
        { detail: 'Section cash_flows is mandatory and cannot be removed' },
        '/api/v1/reports/co_1/quarterly/rpt_1/outline',
      ),
    );

    renderLoader();

    expect(
      await screen.findByText(/Section cash_flows is mandatory and cannot be removed/i),
    ).toBeInTheDocument();
    expect(produceAll).not.toHaveBeenCalled();
  });

  it('hands off to Preview when a save 409 turns out to be an already-locked outline', async () => {
    // The second route to the identical card. The outline save always carries its
    // unticked rows, and the post-lock reorder path rejects those — so a locked
    // outline 409s here, before any lock was attempted. Ask the server rather than
    // inferring it from which call threw.
    getOutline.mockResolvedValueOnce(unlocked).mockResolvedValueOnce(locked);
    saveOutline.mockRejectedValue(
      new ApiError(
        409,
        'Conflict',
        { detail: 'Outline is locked — macro_context cannot be removed, only reordered' },
        '/api/v1/reports/co_1/quarterly/rpt_1/outline',
      ),
    );

    renderLoader();

    await waitFor(() =>
      expect(screen.getByTestId('went-to')).toHaveTextContent('/quarterly-report/rpt_1/preview'),
    );
    expect(screen.queryByText(/Report generation failed/i)).toBeNull();
  });

  it('sends Try Again back to the outline instead of doing nothing', async () => {
    // The old handler reset three flags and issued zero requests, because the
    // bootstrap effect's deps never changed.
    saveOutline.mockRejectedValue(
      new ApiError(
        422,
        'Unprocessable Entity',
        { detail: 'That outline could not be saved' },
        '/api/v1/reports/co_1/quarterly/rpt_1/outline',
      ),
    );

    renderLoader();
    fireEvent.click(await screen.findByRole('button', { name: /Try Again/i }));

    await waitFor(() =>
      expect(screen.getByTestId('went-to')).toHaveTextContent('/quarterly-report/rpt_1/outline'),
    );
    expect(produceAll).not.toHaveBeenCalled();
  });

  it('reports a missing report id immediately rather than after a wait', async () => {
    renderLoader({ ...bootState, reportId: null });
    expect(await screen.findByText(/missing its report or company id/i)).toBeInTheDocument();
    expect(saveOutline).not.toHaveBeenCalled();
  });
});

describe('the progress it shows is real', () => {
  it('never asks for node rows on a batch produce run', async () => {
    // GET /agent_runs/{id}/nodes 404s for section_producer_batch. Asking anyway was a
    // throwaway request every three seconds AND the reason the bar froze at 6%.
    renderLoader();
    await waitFor(() => expect(getByPollUrl).toHaveBeenCalled());
    await tick(7_000);
    expect(getNodes).not.toHaveBeenCalled();
  });

  it('counts sections off the run heartbeat', async () => {
    getByPollUrl.mockResolvedValue({
      run_id: 'run_1',
      status: 'running',
      output_summary: { results: Array.from({ length: 12 }), total: 28 },
    });

    renderLoader();
    await waitFor(() => expect(getByPollUrl).toHaveBeenCalled());

    expect(await screen.findByText('Section 13 of 28')).toBeInTheDocument();
  });

  it('offers a way to watch the sections land', async () => {
    renderLoader();
    await waitFor(() => expect(produceAll).toHaveBeenCalled());

    fireEvent.click(
      await screen.findByRole('button', { name: /Watch sections being written/i }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('went-to')).toHaveTextContent('/quarterly-report/rpt_1/preview'),
    );
  });
});
