# Save errors as an animated popup

**Date:** 2026-11-11
**Status:** Built 2026-11-11 (approved the same day). Frontend 1,330 passed. Not committed.
**Changed while building:** the key page's and the "Get a quote" form's errors already show
inside an open popup (the Review popup, the Contact us popup), so they stay there — a popup on top
of a popup would be awkward (the plan's own "inside popups stay" rule). The error popup is used on
the **plan editor** (save, publish, save offer, approve) and **Checkout** (pay).
**Repo:** frontend only
**Mockup:** "Save errors" screen, option B, on https://claude.ai/artifact/V3u25ja5sWEn8n22tyNxjN

## What changes

Today a save that the server refuses shows a small red line of text (e.g. "There's already a plan
called Standard v1. Choose another name." under the plan editor's top bar). It's easy to miss.

New: the same message opens in a **popup in the middle of the screen**:
- the page behind dims (fade), the popup rises in with a small bounce, a red warning icon pops in
  and sends out two pulsing rings;
- a **title** (what failed) and the **server's message** under it;
- only an **×** to close. No other buttons, no suggestions. Esc or a click outside closes it too;
- after closing, the cursor goes back where it was (for a name clash: into the Plan name box);
- people who turn animations off (the "reduce motion" setting) see it appear without movement.

## Where (save / send actions in the subscription and license screens)

| Screen | Action | Popup title |
| --- | --- | --- |
| Spark → Subscriptions → plan editor | Save draft / Publish / Save | "This name is already taken" when it's a name clash, else "Couldn't save the plan" |
| Plan editor (quote offer) | Approve for the company | "Couldn't approve the offer" |
| Spark → Licenses → key page | Generate key / Upgrade / Renew | "Couldn't make the key" |
| Client → Get a quote | Send request | "Couldn't send your request" |
| Client → Checkout | Pay | "The payment didn't go through" |

**Not changed:** errors while a page *loads* (they replace the page, nothing to close), small
hints under a field (e.g. "Looks like SRV-XXXX-XXXX-XXXX"), and errors inside popups that are
already open (Send offer, Change plan) — they stay inside that popup.

## Files

1. **`src/components/shared/ErrorPopup.tsx` (new, small):** `ErrorPopup({ open, title, message,
   onClose })`. Built on the existing `@/components/ui/dialog` (Radix: Esc, click outside, focus
   trap and screen-reader `alertdialog` come with it). The × is a real button with
   `aria-label="Close"`.
2. **`src/index.css`:** the four animations (dim, rise-with-bounce, icon pop, ring pulse) and the
   reduce-motion rule. CSS only, no new library.
3. **`SparkPlanEditorPage.tsx`, `SparkLicenseKeyPage.tsx`, `QuoteForm.tsx`, `CheckoutPage.tsx`:**
   the red error line is replaced by `<ErrorPopup … />`; the plan editor focuses the name box after
   a name-clash popup closes.
4. **Tests:** update the tests that look for the red line (`role="alert"`) to look for the popup
   (`alertdialog`); new tests: the popup shows title + message, × closes it, a name clash puts the
   cursor in the name box.

## What could break

- Nothing on the backend; the messages stay the same.
- A test or two that expected the red line, updated in the same change.

## Notes to update when done

- `Centriyon Notes/Features/Cloud Subscriptions.md`, `Current Status.md`.
