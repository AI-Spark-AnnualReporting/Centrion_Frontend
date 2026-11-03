import { AI_CREDITS_TOAST_ID, toast } from '@/hooks/use-toast';

// The backends add this header to every response while the OpenAI account is out of
// credit (see Centriton/ai_credits.py and AIAnnualReporting/app/core/ai_credits.py).
// It is detected at their HTTP client, so it shows up even when the AI call that hit
// the limit swallowed its own error — and on the next poll of a background job.
export const AI_CREDITS_HEADER = 'X-AI-Credits';
const EXHAUSTED_VALUE = 'exhausted';

// Many calls fail at once when the credit runs out; one toast is enough. The quiet
// period starts when the user CLOSES the toast, not when it opens, so a toast that
// opened in a background tab is not hidden for 5 minutes before anyone saw it.
const REPEAT_AFTER_MS = 5 * 60 * 1000;
let isToastOpen = false;
let lastClosedAt: number | null = null;

export const AI_CREDITS_TITLE = 'AI features are unavailable';
export const AI_CREDITS_MESSAGE =
  "AI features can't be used at the moment. Please contact the support team for help.";

/** True while the toast is open, or within 5 minutes of the user closing it. */
function isToastBlocked(): boolean {
  if (isToastOpen) return true;
  if (lastClosedAt === null) return false;
  return Date.now() - lastClosedAt < REPEAT_AFTER_MS;
}

/** Remember that the user closed the toast, which starts the 5-minute quiet period. */
function handleToastOpenChange(open: boolean): void {
  if (open) return;
  isToastOpen = false;
  lastClosedAt = Date.now();
}

/**
 * Show the "AI features are unavailable" toast. It stays until the user closes it,
 * is not shown again while open, and not again for 5 minutes after it is closed.
 */
export function showAiCreditsPausedToast(): void {
  if (isToastBlocked()) return;
  isToastOpen = true;
  toast({
    id: AI_CREDITS_TOAST_ID,
    variant: 'destructive',
    title: AI_CREDITS_TITLE,
    description: AI_CREDITS_MESSAGE,
    duration: Infinity,
    onOpenChange: handleToastOpenChange,
  });
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

/** Test-only: forget whether the toast is open and when it was last closed. */
export function resetAiCreditsToastForTests(): void {
  isToastOpen = false;
  lastClosedAt = null;
}
