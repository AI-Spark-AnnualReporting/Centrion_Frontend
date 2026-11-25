# Onboarding: "please review" disclaimer + AI-mistake hints

## Context
Testers trusted AI-filled onboarding details that were wrong (F01: Armah's founding year, made-up claims). Everything entered during onboarding is used afterwards: departments and their AI prompts, the sector rules, the fiscal year, currency and language, brand colours and voice, and every AI-written report. Today nothing tells the user that these details matter, or that the AI can be wrong.

You asked for three things:
1. A **disclaimer in the blue left panel**, under the "Centriyon / Turn your source documents…" tagline, shown on **every onboarding step**: review everything, because the rest of the setup is built on these details.
2. **Every AI icon**, on hover, says AI can make mistakes, so check it.
3. A **small Claude-style line beside "Looks good, Continue →"**: AI can make mistakes.

Scope: **frontend only**, Centrion_Frontend, branch `pre-staging`. One page file plus CSS plus tests. No backend or DB changes.

## Design decisions (senior UI/UX call)
- **Colour: amber, not red.** Red on the indigo panel clashes and reads as "something broke". Amber is the standard "caution, read this" colour and stands out on blue.
  - Look: a soft amber-tinted card (`rgba(251,191,36,.12)` fill, `rgba(251,191,36,.35)` 1px border, 12px radius) with an amber-300 `ShieldAlert` icon.
  - Text: white title, 78%-white body. This matches the panel's existing glass cards (`.auth-stat`), so it looks like it belongs.
- **Copy (short and plain):**
  - Disclaimer title: **"Please review everything carefully"**
  - Disclaimer body: **"These details set up your workspace. Your departments, reports and AI-written content are all built from them."**
  - AI chip hover: **"Filled by AI. AI can make mistakes, so please check this."**
  - "AI extracted" badge hover: **"Some fields were filled by AI. AI can make mistakes, so please check them."**
  - Line beside Continue: **"AI can make mistakes. Please check the details before you continue."** Small (11px), muted grey, with a tiny sparkle icon, like claude.ai's footer note.
- **The Continue line only shows when at least one AI-filled field is on screen** (reuses `anyAiChipShown` from F06). If the user typed everything themselves, an AI warning would be noise. Same honesty rule as the AI chips.
- **The disclaimer shows on all 5 left-panel steps** (Company Intel, Review, Brand, Departments, Upload). It lives in the one shared left-panel markup, so it's a single change. The full-screen loading screens (Preparing, Analysing, Setting up) have no left panel and stay as they are.

## The change
**`src/pages/OnboardingPage.tsx`**
1. **Left panel:** under the tagline `<p>`, add `<OnboardingReviewNotice />`, a small component in the same file (icon + title + body). The tagline's bottom margin goes from 32px to about 18px so the panel keeps its rhythm.
2. **`AiChip` component:** replaces the bare `<span className="ai-chip">AI</span>` inside `FieldLabel`.
   - It wraps the chip in the existing Radix `Tooltip` (`src/components/ui/tooltip.tsx`) with its own `TooltipProvider`, since the app has no global provider.
   - The class stays `ai-chip`, so the F06 tests still find it.
   - It uses `z-[10002]` so it shows above the full-screen onboarding layer. This is the same bug and the same fix as the F06 popover.
   - It gets `cursor: help`.
3. **"AI extracted" badge:** same tooltip, with the badge copy.
4. **Footer row:** `← Back` · (spacer) · [sparkle] "AI can make mistakes…" · `Looks good, Continue →`. The row wraps cleanly on narrow widths, and the line sits right next to the button. It's only rendered when `anyAiChipShown`.

**`src/index.css`**: `.ob-notice` (+ title/body/icon), `.ob-ai-tip` (dark tooltip: `#1A1D2E` background, white 11.5px text, 8px radius, max-width 240px), `.ob-ai-note` (the footer line). The `.ai-chip` cursor becomes `help`.

**Tests: new `src/test/onboarding-ai-disclaimers.test.tsx`**
- The disclaimer shows on the Company Intel step (no data scraped) **and** on the Review step.
- Hovering or focusing an AI chip shows the "AI can make mistakes" tooltip.
- Hovering the "AI extracted" badge shows its tooltip.
- The line beside Continue shows when AI fields are present.
- It's hidden on the "fill in manually" path (no AI fields).
- It hides when the user empties every AI field.
- The existing F06 tests (`onboarding-ai-chip`, `onboarding-description-field`, `onboarding-reupload`) must still pass unchanged.

After approval: save this plan as `Centrion_Frontend/.claude/plans/onboarding-ai-disclaimers.md`.

## Ways it could go wrong, and the guard
| Risk | Guard |
|---|---|
| Tooltip hidden behind the onboarding layer (happened with the F06 popover) | `z-[10002]`, confirmed with a screenshot of the tooltip open |
| Left panel too short on small laptop screens, so the disclaimer collides with the bottom cards (the panel is `overflow: hidden`, card height `min(720px, 90vh)`) | Screenshot every step at 1280×800 **and** 1280×650. If it's tight, add a `@media (max-height: 700px)` rule that tightens spacing; nothing gets clipped |
| Tooltip over a chip inside a `<label>`: clicking the chip could act oddly | The trigger is a plain span. Clicking the label still focuses the field, which the F06 test covers |
| Touch screens have no hover, so the tooltip never shows | The disclaimer and the Continue line carry the same message for touch users |
| Warning fatigue (too many warnings) | One calm amber card, a tooltip only on hover, and a muted grey line that's only shown when the AI actually filled something |

**Not handled (on purpose):** the stale left-panel card "✅ Auto-filled for you" (found during F04). You said leave that for now.

## Verification
1. `npx vitest run` on the 4 onboarding test files, then the full suite (baseline: 148 files pass).
2. `npx tsc --noEmit -p tsconfig.app.json` (no new errors beyond the 35 that already exist) and eslint on the changed files.
3. Headless screenshots using the throwaway designlab harness, deleted afterwards:
   - Intel, Review, Brand and Upload steps at 1280×800 and 1280×650.
   - The Review step with the AI-chip tooltip open, and with the footer line.
   - Check the amber card's contrast, alignment with the tagline, and that nothing clips or overlaps.
4. Update the `notes/` vault (feature note + Current Status). Commit and push only when you say so.
