import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ toast }));

const {
  checkAiCreditsHeader,
  resetAiCreditsToastForTests,
  AI_CREDITS_TITLE,
  AI_CREDITS_MESSAGE,
} = await import('@/lib/aiCreditsToast');

function responseWith(headers: Record<string, string>): Response {
  return new Response('{}', { status: 200, headers });
}

describe('AI credits toast', () => {
  beforeEach(() => {
    toast.mockReset();
    resetAiCreditsToastForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the toast when the backend says the credits ran out', () => {
    checkAiCreditsHeader(responseWith({ 'X-AI-Credits': 'exhausted' }));
    expect(toast).toHaveBeenCalledWith({
      variant: 'destructive',
      title: AI_CREDITS_TITLE,
      description: AI_CREDITS_MESSAGE,
    });
  });

  it('stays quiet on a normal response', () => {
    checkAiCreditsHeader(responseWith({}));
    expect(toast).not.toHaveBeenCalled();
  });

  it('shows one toast for many failing calls, then again after 5 minutes', () => {
    vi.useFakeTimers();
    checkAiCreditsHeader(responseWith({ 'X-AI-Credits': 'exhausted' }));
    checkAiCreditsHeader(responseWith({ 'X-AI-Credits': 'exhausted' }));
    expect(toast).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    checkAiCreditsHeader(responseWith({ 'X-AI-Credits': 'exhausted' }));
    expect(toast).toHaveBeenCalledTimes(2);
  });

  it('does not break on a response-like object without headers', () => {
    expect(() => checkAiCreditsHeader({} as Response)).not.toThrow();
    expect(() => checkAiCreditsHeader(null)).not.toThrow();
  });
});
