import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type ToastBody = { onOpenChange?: (open: boolean) => void; [key: string]: unknown };
const toast = vi.fn<(body: ToastBody) => void>();
vi.mock('@/hooks/use-toast', () => ({ toast, AI_CREDITS_TOAST_ID: 'ai-credits-paused' }));

const {
  checkAiCreditsHeader,
  resetAiCreditsToastForTests,
  AI_CREDITS_TITLE,
  AI_CREDITS_MESSAGE,
} = await import('@/lib/aiCreditsToast');
const { chat, quarterlyReports } = await import('@/lib/api');

const FIVE_MINUTES_MS = 5 * 60 * 1000;

function responseWith(headers: Record<string, string>): Response {
  return new Response('{}', { status: 200, headers });
}

function exhaustedResponse(): Response {
  return responseWith({ 'X-AI-Credits': 'exhausted' });
}

/** Act as the user clicking the close button on the toast that was shown. */
function closeShownToast(): void {
  const body = toast.mock.calls[toast.mock.calls.length - 1][0];
  body.onOpenChange?.(false);
}

/** A chat stream response whose body is the given SSE text. */
function sseResponse(text: string): Response {
  return new Response(text, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

/** Read every event from the chat stream, so consumeSse runs to the end. */
async function readAllChatEvents(): Promise<unknown[]> {
  const events: unknown[] = [];
  for await (const event of chat.send({ message: 'hi' })) events.push(event);
  return events;
}

/** Read every event from the quarterly report chat stream (its own inline parser). */
async function readAllReportChatEvents(): Promise<unknown[]> {
  const events: unknown[] = [];
  await quarterlyReports.streamChatMessage('c1', 'r1', 'hi', (event) => events.push(event));
  return events;
}

describe('AI credits toast', () => {
  beforeEach(() => {
    toast.mockReset();
    resetAiCreditsToastForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows a fixed-id toast that stays until closed', () => {
    checkAiCreditsHeader(exhaustedResponse());
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'ai-credits-paused',
        variant: 'destructive',
        title: AI_CREDITS_TITLE,
        description: AI_CREDITS_MESSAGE,
        duration: Infinity,
      }),
    );
  });

  it('stays quiet on a normal response', () => {
    checkAiCreditsHeader(responseWith({}));
    expect(toast).not.toHaveBeenCalled();
  });

  it('skips repeats while the toast is still open, even after 5 minutes', () => {
    vi.useFakeTimers();
    checkAiCreditsHeader(exhaustedResponse());
    checkAiCreditsHeader(exhaustedResponse());
    vi.advanceTimersByTime(FIVE_MINUTES_MS + 1);
    checkAiCreditsHeader(exhaustedResponse());
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it('starts the 5-minute quiet period when the user closes the toast', () => {
    vi.useFakeTimers();
    checkAiCreditsHeader(exhaustedResponse());
    // Left open a long time: the quiet period has not started yet.
    vi.advanceTimersByTime(FIVE_MINUTES_MS * 3);
    closeShownToast();

    vi.advanceTimersByTime(FIVE_MINUTES_MS - 1000);
    checkAiCreditsHeader(exhaustedResponse());
    expect(toast).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1001);
    checkAiCreditsHeader(exhaustedResponse());
    expect(toast).toHaveBeenCalledTimes(2);
  });

  it('does not break on a response-like object without headers', () => {
    expect(() => checkAiCreditsHeader({} as Response)).not.toThrow();
    expect(() => checkAiCreditsHeader(null)).not.toThrow();
  });

  it('shows the toast when a chat stream frame says the credits ran out', async () => {
    const frame = { type: 'error', message: 'AI is unavailable', ai_credits: 'exhausted' };
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(`data: ${JSON.stringify(frame)}\n\n`)));
    const events = await readAllChatEvents();
    expect(events).toEqual([frame]);
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it('stays quiet on normal chat stream frames, including non-JSON and null ones', async () => {
    const text = 'data: {"type":"token","content":"x"}\n\ndata: ping\n\ndata: null\n\n';
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(text)));
    const events = await readAllChatEvents();
    expect(events).toEqual([{ type: 'token', content: 'x' }, { type: 'token', content: 'ping' }, null]);
    expect(toast).not.toHaveBeenCalled();
  });

  it('shows the toast when a quarterly report chat frame says the credits ran out', async () => {
    const frame = { type: 'error', message: 'AI is unavailable', ai_credits: 'exhausted' };
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(`data: ${JSON.stringify(frame)}\n\n`)));
    const events = await readAllReportChatEvents();
    expect(events).toEqual([frame]);
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it('stays quiet on normal quarterly report chat frames', async () => {
    const text = 'data: {"type":"token","content":"x"}\n\ndata: ping\n\ndata: {"type":"done"}';
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(text)));
    const events = await readAllReportChatEvents();
    expect(events).toEqual([{ type: 'token', content: 'x' }, { type: 'done' }]);
    expect(toast).not.toHaveBeenCalled();
  });
});
