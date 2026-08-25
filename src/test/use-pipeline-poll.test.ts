// The hook every long-running screen in the app waits on, which had no tests.
//
// It is a 139-line state machine with three safety valves — a 30-minute cap, a
// "the run is 404 and is not coming back" bail-out, and a transient-error retry —
// and every one of them lives inside the interval callback. So none of them exist
// when the hook is given nothing to poll, and `idle` was an absorbing state with
// no clock. Screens papered over that by rendering `idle` as `running`, which is
// how pressing Continue on a finished report put up a loading screen that nothing
// could ever end.
//
// These pin the contract that lets the screens stop guessing: `idle` means
// watching nothing, `running` means watching something, and there is no third
// reading of either.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

import { usePipelinePoll } from '@/hooks/use-pipeline-poll';
import { agentRuns, ApiError } from '@/lib/api';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    agentRuns: { getByPollUrl: vi.fn(), getNodes: vi.fn() },
  };
});

const getByPollUrl = agentRuns.getByPollUrl as unknown as ReturnType<typeof vi.fn>;
const getNodes = agentRuns.getNodes as unknown as ReturnType<typeof vi.fn>;

const URL = '/api/v1/agent_runs/run-1';
const run = (status: string) => ({ id: 'run-1', status, output_summary: null });

beforeEach(() => {
  vi.clearAllMocks();
  getNodes.mockResolvedValue({ nodes: [] });
  getByPollUrl.mockResolvedValue(run('running'));
});
afterEach(() => vi.useRealTimers());

describe('what idle means', () => {
  it('is idle when there is nothing to watch', () => {
    const { result } = renderHook(() => usePipelinePoll(null, null));
    expect(result.current.state.phase).toBe('idle');
  });

  it('never reports idle once there is a url — not even on the first render', async () => {
    // The frame the screens used to lie about. The effect that flips the state
    // runs a tick later, so callers rendered `idle` as `running` to hide it, and
    // that mapping is what turned "watching nothing" into "working".
    const { result } = renderHook(() => usePipelinePoll('run-1', URL));
    expect(result.current.state.phase).toBe('running');
  });

  it('reports timeout, not idle, when a run id has nothing to poll it at', async () => {
    // The contradiction: the caller believes a run is live, the hook has no url.
    // Left as idle this is a loader with no clock behind it; timeout is a phase
    // every screen already handles, with Retry and Keep waiting on it.
    const { result } = renderHook(() => usePipelinePoll('run-1', null));
    await waitFor(() => expect(result.current.state.phase).toBe('timeout'));
  });

  it('does not poll anything while idle', () => {
    renderHook(() => usePipelinePoll(null, null));
    expect(getByPollUrl).not.toHaveBeenCalled();
  });
});

describe('finishing', () => {
  it('completes and stops polling', async () => {
    getByPollUrl.mockResolvedValue(run('completed'));
    const { result } = renderHook(() => usePipelinePoll('run-1', URL));

    await waitFor(() => expect(result.current.state.phase).toBe('completed'));
    const calls = getByPollUrl.mock.calls.length;
    await new Promise((r) => setTimeout(r, 50));
    expect(getByPollUrl.mock.calls.length).toBe(calls);
  });

  it('fails and stops polling', async () => {
    getByPollUrl.mockResolvedValue(run('failed'));
    const { result } = renderHook(() => usePipelinePoll('run-1', URL));

    await waitFor(() => expect(result.current.state.phase).toBe('failed'));
  });
});

describe('the valves that only exist while polling', () => {
  it('gives up on a run that is 404 and has been for a while', async () => {
    // "A run that isn't there any more is never coming back" — the server sweeps
    // unfinished runs on restart.
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    getByPollUrl.mockRejectedValue(new ApiError(404, 'Not Found', null, URL));
    const { result } = renderHook(() => usePipelinePoll('run-1', URL));
    await waitFor(() => expect(result.current.state.phase).toBe('running'));

    // ...past the grace window that exists for the race right after a 202.
    (Date.now as unknown as ReturnType<typeof vi.fn>).mockReturnValue(1_000_000 + 11_000);
    await waitFor(() => expect(result.current.state.phase).toBe('timeout'), { timeout: 5000 });
  });

  it('keeps waiting through a 404 inside the grace window', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    getByPollUrl.mockRejectedValue(new ApiError(404, 'Not Found', null, URL));
    const { result } = renderHook(() => usePipelinePoll('run-1', URL));

    await new Promise((r) => setTimeout(r, 60));
    expect(result.current.state.phase).toBe('running');
  });

  it('treats an ordinary network error as transient', async () => {
    getByPollUrl.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => usePipelinePoll('run-1', URL));

    await new Promise((r) => setTimeout(r, 60));
    expect(result.current.state.phase).toBe('running');
  });

  it('times out past the cap, and restart() puts the user back on the clock', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const { result } = renderHook(() => usePipelinePoll('run-1', URL));
    await waitFor(() => expect(result.current.state.phase).toBe('running'));

    (Date.now as unknown as ReturnType<typeof vi.fn>).mockReturnValue(1_000_000 + 31 * 60 * 1000);
    await waitFor(() => expect(result.current.state.phase).toBe('timeout'), { timeout: 5000 });

    // "Keep waiting" — the escape from a genuinely long run, which must survive
    // all of this.
    (Date.now as unknown as ReturnType<typeof vi.fn>).mockReturnValue(2_000_000);
    act(() => result.current.restart());
    await waitFor(() => expect(result.current.state.phase).toBe('running'));
  });
});
