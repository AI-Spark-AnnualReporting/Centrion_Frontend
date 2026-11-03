import { toast } from '@/hooks/use-toast';

// The backends add this header to every response while the OpenAI account is out of
// credit (see Centriton/ai_credits.py and AIAnnualReporting/app/core/ai_credits.py).
// It is detected at their HTTP client, so it shows up even when the AI call that hit
// the limit swallowed its own error — and on the next poll of a background job.
export const AI_CREDITS_HEADER = 'X-AI-Credits';
const EXHAUSTED_VALUE = 'exhausted';

// Many calls fail at once when the credit runs out; one toast is enough.
const REPEAT_AFTER_MS = 5 * 60 * 1000;
let lastShownAt: number | null = null;

export const AI_CREDITS_TITLE = 'AI features are paused';
export const AI_CREDITS_MESSAGE =
  'Your account has reached its AI usage limit. Please contact support to restore access.';

/** Show the "AI features are paused" toast, at most once every 5 minutes. */
export function showAiCreditsPausedToast(): void {
  const now = Date.now();
  if (lastShownAt !== null && now - lastShownAt < REPEAT_AFTER_MS) return;
  lastShownAt = now;
  toast({ variant: 'destructive', title: AI_CREDITS_TITLE, description: AI_CREDITS_MESSAGE });
}

/**
 * Show the toast when a backend response says the AI credits ran out.
 * Defensive on purpose: test doubles and some callers hand over Response-like
 * objects without real headers.
 */
export function checkAiCreditsHeader(response: Response | null | undefined): void {
  const value = response?.headers?.get?.(AI_CREDITS_HEADER);
  if (value === EXHAUSTED_VALUE) showAiCreditsPausedToast();
}

/** Test-only: forget when the toast was last shown. */
export function resetAiCreditsToastForTests(): void {
  lastShownAt = null;
}
