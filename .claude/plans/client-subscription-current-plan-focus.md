# Client Subscription page: your plan stands out, the others fade

**Date:** 2026-11-24
**Status:** Built and tested, not committed
**Mockup:** `.claude/mockups/client-subscription-grid-mockup.html` (option D)

## What changed (client page only: Admin Console → Subscription)
- **No sliding by itself.** The row of cards stays (arrows + dots, no page scroll), but it
  moves only when the client clicks an arrow or a dot (`<CardStrip paused>`).
- **Your plan stands out:** green outline (as before) + soft green glow + a
  "✓ YOUR CURRENT PLAN" label above the card.
- **The other cards fade** (still solid white so the blue band doesn't show through: a white wash over the content, a greyed name tab, a little smaller) until pointed at or
  reached with Tab. With no active plan, nothing fades.

## Files
- `src/pages/admin/SubscriptionPage.tsx`: `CardStrip paused`, wrapped in
  `sub-strip-holder` (+ `sub-fade-others` when there's an active plan).
- `src/components/subscriptions/subscriptions.css`: the holder, fade, glow and label styles
  (only under `.sub-fade-others`), and extra top room in the row for the label.
- `src/components/subscriptions/PlanCard.tsx`: the fit-to-height maths reads the row's
  real padding (so the extra room is counted). Same result on Spark's page.
- `src/test/subscriptions.test.tsx`: current plan marked + others faded; nothing faded without an active plan.

## Not changed
Spark → Subscriptions keeps its auto-sliding strip. Card design, order, Buy now, popups unchanged.
