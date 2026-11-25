# F06: Company description box (onboarding step 2)

## Context
Feedback F06 (content team, Armah test): on **Onboarding → Review Company Details**, the "Company description" box is too small and gives no guidance on length.

What exists today (`Centrion_Frontend/src/pages/OnboardingPage.tsx:483-494`):
- A 3-row textarea that shows about 300 characters at a time.
- The AI fills it with a 4–8 sentence paragraph (`Centriton/company_profile_extractor.py:242`). Saved descriptions are typically about 910 characters and as long as about 3,700, so users see only a third of the text or less.
- There's no hint, no count and no target. The placeholder says "Brief description". The only rule is a hidden 20-character minimum, which shows up only as an error on Continue.
- This text feeds AI later: department prompts, annual/quarterly/board/earnings reports and the dashboard. **After setup it's read-only** (`CompanyDetailsCard.tsx:374` says "Contact support to update it"), and F08 says the step can't be reopened. So this box is the only chance to get it right.

Outcome: users can read the whole description, know what a good one looks like and why it matters, and get warned before they make common mistakes, without blocking anything that works today.

Scope: **frontend only, Centrion_Frontend, branch `pre-staging`.** No backend, DB or validation-rule changes.

## The change (all in `src/pages/OnboardingPage.tsx` + a few CSS lines in `src/index.css`)

1. **Bigger box.** `rows={3}` becomes `rows={9}`, which fits a typical (about 900 character) description without scrolling at the step's width. It stays resizable by dragging, and longer text scrolls. This is a plain fixed size, not a JS auto-grow, to keep the code simple.
2. **Visible hint line under the label** (reuses the existing `.ob-brand-hint` style):
   *"AI wrote this from your sources. Check the facts and fix anything wrong. Aim for 4–8 sentences (about 100–200 words)."*
3. **"i" info icon next to the label.** It opens on hover, on click or tap, and on keyboard focus. It closes on Escape, on an outside click, or when the mouse leaves. It's built with the existing `Popover` (`src/components/ui/popover.tsx`, already used in `DepartmentSelectionStep.tsx`) plus the lucide `Info` icon. Content:
   - **What it is:** one paragraph on what the company does.
   - **Where it's used:** AI uses it to write department questions and report sections (annual, quarterly, board, earnings), and it shows on the dashboard.
   - **A good one covers:** what you do, main activities, markets, size and founding year.
   - **Avoid:** facts that aren't true, marketing superlatives, and instructions to the AI.
   - **Important:** *after setup only Spark support can change it.*
   The icon sits **outside** the `<label>` element on purpose. A button inside a label gets "clicked" whenever the label text is clicked, which would pop the box open unexpectedly. `FieldLabel` gets an optional `info` prop that renders the icon beside the label.
4. **Live word count** on the right, under the box (reuses the existing `.ob-char-count` style), e.g. "142 words".
5. **Clearer placeholder:** *"What the company does, its main activities, markets and history"*.
6. **Clearer error message** (same rule, same moment): *"Add a description of at least 20 characters: what the company does and where it operates."*
7. `dir="auto"` on the textarea so Arabic text types and reads right-to-left correctly.

## Ways a user can mess up, and what the UI does about it
| Mistake | Mitigation |
|---|---|
| Accepts the AI text without reading it (F01/F02 Armah case) | The whole text is visible, and the hint plus info box say "check the facts" and that it can't be edited after setup |
| Deletes everything, or leaves only spaces | The trimmed 20-character rule still blocks Continue, with a clearer message beside the box. The word count shows 0 |
| Pastes a huge block (half a report) | **Amber warning above 400 words** (your choice: warn only, never blocks): *"This is long. A focused 100–200 word description gives better AI results."* |
| Doesn't know what to write when the AI found nothing | Placeholder, hint and info box all say what to include |
| Clicks the label text and gets a surprise popup | Icon kept outside the label |
| On a touch screen or keyboard (no hover) | The popover opens on tap, click and focus, and has an `aria-label` |
| Types in Arabic | `dir="auto"` displays it correctly. Not blocked |
| Small screen | Box has a fixed row count plus a drag handle; checked by screenshot at about 1280px and about 900px wide |

**Not handled (decided):**
- Edits are lost on a page refresh before onboarding finishes. You chose to leave this; it's true for every field on this step today.
- Arabic text is not blocked or warned about.

## Files
- `src/pages/OnboardingPage.tsx`: `FieldLabel` gets an optional `info` prop; there's a small `DescriptionInfo` popover component in the same file, and the description block is updated as above. The word count is a small, clearly named helper, `countWords(text)`.
- `src/index.css`: amber state for `.ob-char-count` (if not already present), plus info-icon button styling (small, `#9BA3C4`, focus ring).
- `src/test/onboarding-reupload.test.tsx`: update the placeholder text it looks the box up by.
- New `src/test/onboarding-description-field.test.tsx`:
  - The word count updates as the user types.
  - The amber warning appears above 400 words and not at 400, and Continue still works.
  - Spaces only, or under 20 characters, shows the new error.
  - The info box opens on click, on hover and on focus, and closes on Escape.
  - Clicking the label text does NOT open it.
  - An existing long AI description shows in full and isn't changed.
- After approval and before editing: save this plan as `Centrion_Frontend/.claude/plans/onboarding-description-box.md`.

## Ripple effects
- Only the Review step of onboarding changes. The saved value, the API payload and the backend's 20-character check are untouched, so old companies and data are unaffected.
- `FieldLabel` is local to this file; the new prop is optional, so the other fields look the same.
- The step panel already scrolls (`.auth-card-wide .auth-r { overflow-y: auto }`). A taller box pushes the grid down a little, but nothing is hidden.

## Verification
1. `npx vitest run src/test/onboarding-reupload.test.tsx src/test/onboarding-description-field.test.tsx`, then the full vitest run, comparing against the baseline (counts, not phantoms).
2. `npx tsc --noEmit -p tsconfig.app.json`: no new errors (35 already exist on pre-staging), plus eslint on the changed files.
3. Headless screenshots of the Review step (empty, typical about 900 characters, over 400 words, popover open) at about 1280px and about 900px wide. Check alignment, clipping and the popover staying on screen.
4. Last step: update the `notes/` Obsidian vault (Current Status + feature note). Commit and push only when you say so.
