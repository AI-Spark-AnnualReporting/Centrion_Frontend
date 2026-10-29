# Plan: Annual Report Validator — Spark hand-off link, then a native Admin UI

**Status:** Spark link built 2026-10-07, not committed. Admin link + native page built 2026-10-08, not committed. Same day: tone field simplified to free text, running screen switched to Centriyon's own loader, and a "Previous validations" gallery added.
Sidebar tests pass (32), page tests pass (8), full suite 1090 passed / 10 failed (5 pre-existing/flaky, unrelated — confirmed by running each in isolation and by `git status` showing none of those files touched). `tsc --noEmit` clean, production build succeeds.
**Branch:** `feat/annual-report-validator` off `pre-staging`
**Main plan (the feature itself):** `D:\AnnualReporting\AIAnnualReporting\.claude\plans\validate-uploaded-report.md` — see its **2026-10-08: Tone as free text** section for the backend side of the change below.

## What and why
The Annual Report Validator lives in the AI Annual Reporting app (spark_studio, `VITE_SAR_APP_URL`). It validates an **external** annual report (one made outside the system) against the strategic brief, concept messages and tone that the user uploads with it. Spark staff need to reach it from Centriyon, so this repo only adds a **sidebar link**. All the work happens in the other app.

## Who sees it
- **Spark (`spark_internal`).** It sits in the Spark block, directly under **Companies**. Hands off to the SAR app's `/pm/annual-report-validator` page (unchanged).
- It shows **before a client is picked** (the Companies page) and after. An external report belongs to no client, so it never needs one, which is why the link doesn't take the acting company.
- **Admin (2026-10-08).** A second entry under **Reports Validator** (next to ESG Validator / Compliance Validation), the section Admins already see. Gated by role (`adminOnly`, checked with `isAdminLevel`), not a `visible_features` flag — a new feature key would need backend plumbing in `Centriton` too (see the `board_report` warning in `constants/features.ts`), which this skips entirely. `ir`/PM/HOD/department users still don't get it.
- **Admin's version is native**, not a hand-off (the user's explicit request): it renders inside Centriyon's own UI the whole time, calling our backend directly. Spark's link is untouched and still hands off.

## Files
1. `src/lib/appRouting.ts`: `sparkStudioUrl(path)` — Spark's hand-off only, untouched by the 2026-10-08 work.
2. `src/components/layout/Sidebar.tsx`:
   - An **Annual Report Validator** button in the Spark block, under Companies (unchanged, still hands off).
   - `REPORTS_VALIDATION_CHILDREN` gained an `adminOnly` entry pointing at the in-app route `/annual-report-validator`; `visibleValidationChildren`'s filter checks `isAdminLevel` for items without a `featureKey`. The child button's `onClick` is plain `handleNav` — same as ESG Validator/Compliance Validation, no hand-off branch.
3. **New, native to Centriyon (2026-10-08):**
   - `src/types/annual-report-validator.ts` — `ReportValidation`/`ToneRules`/`ExternalReportInput`/`ValidationJob`, ported from the SAR app's `lib/api/pm.ts`.
   - `src/lib/api.ts` — `sarValidator.start()`/`.poll()`, using the existing `sarRequest()` helper (same JWT passthrough `sarCycles`/`sarNotifications` already use — no new trust relationship, no backend change).
   - `src/components/validator/AnnualReportValidationPanel.tsx` — near-verbatim port of the SAR app's 1,283-line `ValidationPanel` (plain Tailwind + `lucide-react`, no Next.js-specific code, so the port was mechanical: swap the two import paths, nothing else).
   - `src/pages/AnnualReportValidatorPage.tsx` — one page, three states (form → running → results/failed), chosen over the SAR app's separate form/run pages or Compliance's 3-stage wizard because nothing here needs to be deep-linkable (explicit choice — see **What could break** below).
   - `src/App.tsx` — lazy route `/annual-report-validator`, `<ProtectedRoute requiredRole="admin" />` (no new guard code — the prop already existed).
4. `src/test/spark-sidebar.test.tsx`: Spark's two hand-off assertions unchanged. Admin's test updated 2026-10-08 — now asserts in-app navigation (`path` becomes `/annual-report-validator`, `sparkStudioUrl` NOT called) instead of a hand-off.
5. `src/test/annual-report-validator-page.test.tsx` (new, 2026-10-08): form-gating (all 4 inputs required), start call carries a `FormData`, running/results/failed rendering.

## What could break
- **Sidebar tests match labels by exact text.** "Annual Report Validator" doesn't collide with "Annual Report". The "shows only the directory before a company is chosen" test still passes, since that list doesn't name the new item.
- **No route, feature-key or backend change in `Centriton` or `AIAnnualReporting`.** The destination API already accepted Admin (`UserRole.admin_roles() = [ADMIN, SPARK_INTERNAL]`) — only the Centrion-side UI was missing.
- **Single page, not deep-linkable.** A refresh or a closed tab mid-run loses the job id — the admin has to start again (the SAR app's run page survives a refresh via the job id in the URL; this trades that away for simplicity, per explicit instruction).
- **Two copies of the validation-rendering logic now exist** (SAR app's `ValidationPanel.tsx`, Centriyon's `AnnualReportValidationPanel.tsx`). A change to what the backend returns, or to how a finding should read, needs updating both. Accepted because the alternative (shared package, or reusing via the hand-off) was ruled out when "native UI" was requested.
- 4 pre-existing test failures elsewhere in the suite (`reportRoutes.test.ts`, `meeting-minutes-panel.test.tsx`, `quarterly-metrics-popup.test.tsx`, `quarterly-required-source-docs.test.tsx`) — confirmed unrelated: none of those files were touched, and `quarterly-required-source-docs.test.tsx` fails identically in total isolation.

## 2026-10-08: Tone as free text, not 8 fields

Same change as the SAR app's form (see the main plan's own dated section) — the Tone card's 8 typed fields (Voice, Register, Sentence style, Tone adjectives, Banned words, Preferred words, Do's, Don'ts) replaced with one `Textarea` + a conditional file input, matching the Brief field's existing pattern.

- `AnnualReportValidatorPage.tsx`: `toneText`/`toneFile` state replaces `ToneForm`; dead helpers removed (`ToneForm`, `EMPTY_TONE`, `toList`, `toToneRules`, `hasToneRule`, `ToneInput`, `ToneList`). `run()` sends `tone_text`/`tone_file` instead of `tone` — matches the backend's new form fields.
- `types/annual-report-validator.ts`: `ExternalReportInput.tone: ToneRules` → `toneText: string; toneFile: File | null`.
- `src/test/annual-report-validator-page.test.tsx`: `fillMinimalForm` and the gating test now fill the one textarea instead of the "Voice" field.
- 36 sidebar+page tests pass, `tsc --noEmit` clean.
- Backend change this depends on (not in this repo): `AIAnnualReporting`'s `/validate-upload` now takes `tone_text`/`tone_file` instead of a `tone` JSON object — see the main plan.

## 2026-10-08: Running screen uses Centriyon's own loader

The plain spinner (built in the first pass above) was replaced with `AiLoadingScreen` — Centriyon's shared "AI processing" loader, already used by Compliance Validation's own long-running wait (`ComplianceRunningPage.tsx`). Same ring animation, progress bar and rotating tips; the server's live stage message is shown as the subtitle, updating on every poll, instead of a made-up fixed step list.

- `src/pages/onboarding/AiLoadingScreen.tsx` (shared, also used by onboarding and Compliance): the milestone checklist box is now skipped when `milestones` is empty, instead of always drawing an empty bordered box. No behavior change for existing callers — none of them ever pass an empty list.
- `AnnualReportValidatorPage.tsx`'s `RunningView`: rewritten around `AiLoadingScreen` — `milestones={[]}`, `indeterminate`, `subtitle` = the live server stage, a small set of validator-specific `tips`. The terminal result (success or failure) is now held in local state and only handed up to the page once `AiLoadingScreen`'s own finishing animation calls `onDone` — mirrors how Compliance's `goToResults` works, so the bar visibly reaches 100% instead of the screen cutting away the instant the last poll lands. `RunState`'s `"running"` case no longer carries `liveStage` — that's internal to `RunningView` now.
- Tests: two assertions in `annual-report-validator-page.test.tsx` needed a longer `waitFor` timeout (3000ms) to cover the loader's own ~1s finishing animation. 36 tests pass, `tsc --noEmit` clean, production build succeeds.

## 2026-10-08: "Previous validations" gallery

Until now, leaving the page lost the run — no way back to a report already validated. Added a card gallery above the form, adapted from Compliance's own `ResumeGallery`/`ResumeCard` (`src/pages/compliance/ResumeGallery.tsx`) — same gradient-by-status header, score badge, action pill and relative timestamp, just without Compliance's period field (we have none — filename sits in that spot instead) and without its "Uploaded" badge (redundant here, every row is one).

Needed a new backend endpoint — there was no way to list a user's past runs at all before this, only look one up by id. See the main plan's own dated section for that side.

- `src/components/validator/PreviousValidationsGallery.tsx` (new): fetches `sarValidator.list()` on mount, renders nothing while loading or empty (supporting content, not a blocking one), a 3-column grid otherwise.
- `src/lib/api.ts`: `sarValidator.list()`; `src/types/annual-report-validator.ts`: new `ValidationJobSummary` (`job_id, filename, status, created_at, score, error`) — deliberately lighter than the full `ReportValidation`, so the list doesn't pull every past run's full findings payload.
- `AnnualReportValidatorPage.tsx`: new `openPrevious(job)` — running resumes `RunningView` by job id; failed shows the stored `error` directly, no fetch; completed re-fetches that one job via the existing `sarValidator.poll(job_id)` (the same request a fresh run's last poll makes) and opens straight to results. The gallery lives inside `ValidatorForm`, so it naturally remounts (and refetches) whenever the page returns to the form stage — no extra refresh plumbing needed.
- Tests: 4 new cases (list rendering + the three open behaviors) in `annual-report-validator-page.test.tsx`, plus a `sarValidator.list` mock added to the existing suite (defaults to empty, so prior tests are unaffected) and a `renderPage()` helper that flushes the gallery's own fetch to avoid act() warnings. 36 → 40 tests, all pass. `tsc --noEmit` clean, production build succeeds. Full suite: 1090 passed / 10 failed across 5 files — one new file beyond the previously-confirmed 4 (`quarterly-extraction-review.test.tsx`), confirmed unrelated and pre-existing/flaky the same way: untouched by `git status`, fails identically in isolation.

Same feature built in parallel for the SAR app (`AIAnnualReporting-Frontend`), in its own plain style — see the main plan's dated section.

**Layout fix (same day, after review):** moved below the form instead of above it (the user wanted the form first). Switched the card row from a 3-column grid to `flex` + `flexWrap` with each card at `flex: '0 1 260px'` — the grid always reserved 3 equal tracks, so 1-2 cards sat beside a stretch of empty space; flex only takes the room its cards actually need. 40 tests still pass, `tsc --noEmit` clean, build succeeds.

## 2026-10-08: "Validate again" — a true retry, no re-upload

Same backend feature as the main plan's own dated section (`AIAnnualReporting/.claude/plans/validate-uploaded-report.md`) — a run's original report, brief, concepts and tone are now saved server-side (Storage + `agent_runs.input_summary`), so a new `POST /pm/validation-jobs/{id}/retry` can re-run it exactly, no re-upload.

- `src/lib/api.ts`: `sarValidator.retry(jobId)`.
- `AnnualReportValidatorPage.tsx`: `RunState`'s `results` and `failed` cases now carry `jobId` (both `RunningView`'s terminal states and `openPrevious` set it) — needed so either screen can retry itself. A page-level `retry(jobId)` calls the endpoint and switches straight to the running state with the new job id. A **"Validate again"** button sits next to "Validate another report" on results, and next to "Start again" on a failure — both disabled while a retry is starting ("Starting…").
- Deliberately *not* added to each gallery card — opening a card already lands on results/failed, where the button lives now, so a per-card copy would just be a second way to reach the same one click.
- Tests: 2 new (`retries a completed run...`, `retries a failed run...`) using a `retry` mock added alongside `start`/`poll`/`list`. Page file: 8 → 10 tests. Sidebar unchanged at 32. `tsc --noEmit` clean, production build succeeds.

**Bug fix (same day, after review):** a failed *retry attempt* (e.g. "this run didn't save enough to retry") was replacing the whole screen with a second "failed" view, baking the retry's own error into the page as if the validation itself had failed again — confusing, and it still offered "Validate again" on a run that had just proven it can't be retried. Fixed to match how the SAR app's retry already behaved: report the failure as a toast (`useToast`, same pattern used elsewhere in this codebase) and leave the screen exactly as it was. One new test (`reports a failed retry as a toast...`) with a `@/hooks/use-toast` mock matching the convention in `board-index-failure-notification.test.tsx`. Page file: 10 → 11 tests, 43 total with sidebar. `tsc --noEmit` clean, build succeeds.

**Skeleton loading (same day):** the gallery showed nothing at all while its own fetch was in flight, so it either popped in abruptly or (for an admin with no past runs) never visibly existed — no way to tell "still loading" from "nothing here" on screen. Added `CardSkeleton` (same shape as the real card, using the existing `Skeleton` primitive) shown while `loading`; the "hide entirely" case now only fires once loading is *done* and the list is actually empty. One new test asserting the skeleton renders mid-fetch (a never-resolving `list()` mock). 11 → 12 tests, 44 total. `tsc --noEmit` clean, build succeeds.

**Loader scroll/alignment bug (same day):** `RunningView` rendered `AiLoadingScreen` directly, unlike Compliance's own running screen, which wraps it in `<div style={{position: 'fixed', inset: 0, zIndex: 1400, overflowY: 'auto'}}>`. Without that, the loader sat in normal page flow — inside the sidebar layout — and scrolled with the rest of the page instead of staying centered on the viewport. Added the same wrapper. (A second part of the same report — stage text stuck on "Starting…" — was a backend ordering bug; see the main plan's dated section.) 12 tests still pass, `tsc --noEmit` clean, build succeeds.

**Concept message titles are now optional (same day):** matches the main plan's own dated section — the form no longer asks for a title per concept, just the message. `ConceptRow` dropped `title` entirely; the "is this one filled in" check switched from title to message; no `title` key is sent at all (the backend derives one from the message when it's missing). `tsc --noEmit` clean, 12 tests still pass (two needed their title-field interaction swapped for the message field — `fillMinimalForm` and the gating test).

**"Back" button + full-width content (same day):** two more requests off the same screenshot.
- The results and failure screens' second button ("Validate another report" / "Start again", both just resetting to the in-page form) is now **Back** on both — `useNavigate()` + `navigate(-1)`, leaving the Validator entirely for whatever page linked into it. Chosen over keeping the in-page reset, confirmed with the user first since the two behave very differently.
- The form and results screens dropped their `max-w-3xl`/`max-w-4xl` + `mx-auto` wrappers (just `w-full` now) — they ran narrower than the page's own content area, same pattern Compliance's own full-width pages already use. The failure screen's small alert box stays narrow on purpose (an alert, not a form).
- Tests: the two button-label tests became `navigate` assertions instead of a state-reset check; a `useNavigate` mock was added (`vi.mock("react-router-dom", ...)`, preserving every other export via `importOriginal`) since the component now needs Router context. 12 tests still pass, sidebar's 32 unaffected (mocks are per-file), `tsc --noEmit` clean, build succeeds.

**Back as its own left-aligned arrow button (same day, after review):** moved out of the shared action row next to "Validate again" — now its own `<ArrowLeft /> Back` button, in its own row above the rest of the content on both results and failure, left-aligned rather than grouped on the right. "Validate again" stays as the header's own action (results) or its own button (failure). Accessible name is still just "Back" (lucide icons carry no text), so the existing tests needed no changes. `tsc --noEmit` clean, 12 tests pass, build succeeds.

**Bug: "Back" didn't actually leave the page (same day).** `navigate(-1)` relies on browser history, and this whole flow (form → running → results/failed) lives on one route with no URL change between states — so a direct load or a refresh leaves nothing real to go back to, and "Back" just stayed on the same page, looking like it silently reset to the empty form. Same class of mistake Compliance's own back button already avoids, by using a fixed destination instead of history. Switched `goBack` to `navigate("/dashboard")`. Test assertions updated from `toHaveBeenCalledWith(-1)` to `toHaveBeenCalledWith("/dashboard")`. 12 tests pass, `tsc --noEmit` clean, build succeeds.

**Same fix + treatment ported to the SAR app (same day):** the user confirmed this should apply to both apps. `runs/[jobId]/page.tsx` — "Validate another report"/"Start again" replaced with the same `← Back` button (own row, left-aligned) on both the results and failure screens, pointed at a fixed `/pm` (that app's own PM landing page) via `router.push`, not `router.back()` — same reasoning as Centriyon's fix: Spark's hand-off into this app is a full `window.location.href` redirect, not an in-app navigation, so this page can easily be the first thing loaded in the tab. The form page and the results view both dropped their `max-w-3xl`/`max-w-4xl` + `mx-auto` wrappers, matching Centriyon's width change; the failure screen's alert box stays narrow on purpose. `tsc --noEmit` clean, `npm run build` succeeds (no test suite in this repo).

**Form restyled to match Compliance Validation's look (same day):** the form screen (report/brief/concept messages/tone/Validate) used shadcn `<Input>`/`<Textarea>`/`<Button>` + Tailwind, visually inconsistent with the rest of the app's "Reports Validator" group. Restyled to Compliance's own visual language from `ComplianceSetupPage.tsx` and the shared `.card`/`.btn`/`.tabs`/`.inp` classes in `src/index.css`:
- Compact header (small bold title + muted one-line description) instead of the big Tailwind `h1`.
- All five fields (Annual report, Strategic brief, Concept messages, Tone, Validate) now live in one `.card` as numbered `Section`s ("1" through "5"), instead of four separate bordered boxes plus a stray button.
- File inputs restyled as a dashed-border dropzone (filename + size + a "Remove" link once chosen) matching Compliance's own upload box, instead of the browser's bare "Choose file" input.
- Brief/tone textareas and the concept-message rows now use the shared `.inp` look; the "Type them / Upload a file" toggle switched from two outline/filled buttons to Compliance's pill `.tabs`/`.tab`; the submit button switched to the `.btn.bp` indigo style ("▶ Validate report").
- Deliberately NOT a shared module: `Section`/`FileDropzone` are rebuilt locally in this file rather than extracted out of `ComplianceSetupPage.tsx` (user's call, to avoid touching Compliance's own file for this ask) - only the shared color/font tokens (`PRIMARY`, `MUTED`, `DARK`, `MONO`) are imported from `compliance-ui.tsx`. Two copies of similar presentational code now exist; worth knowing if either page's look changes again later.
- Scope: the form screen only - results/failed screens and the loader are untouched (not what the screenshot was about), still shadcn-styled.
- Zero behavior change: same state, same gating (`canRun` etc.), same submit logic. `tsc --noEmit` clean, all 12 tests pass unchanged (tests query by role/placeholder text, which survived the markup swap), production build succeeds. Not visually verified in a browser this session (no browser tool available) - pending the user's own look in the already-running dev server.

**Missed piece, caught on review (same day): the collapsible `SetupCard` wrapper.** The first pass copied `Section` but not the header Compliance wraps the whole thing in - a clickable row with a gradient icon tile, the bold title "Set up validation", a caption and a chevron that collapses the entire form. User sent three screenshots of the real Compliance page to point at the exact gap. Added a local `SetupCard` (same structure as Compliance's own, `ShieldCheck` from lucide-react standing in for its inline SVG), wrapping the existing `.card` + Sections, with its own `setupExpanded` state (defaults to expanded, same as Compliance). `tsc --noEmit` clean, 12 tests still pass, build succeeds.

**"Validate again" now shows the loader instantly, not "Starting…" on the button first (same day):** user asked why clicking it showed a disabled "Starting…" button for a moment before the loader appeared, instead of going straight to the loader. Cause: `retry()` only switched `run` to the running state *after* `POST /validation-jobs/{id}/retry` resolved with a new `job_id` - until then there was nothing to poll, so the old screen's button just sat there disabled.

Fixed by switching to the running state the instant the button is clicked, with `jobId: null` (new: `RunState`'s `"running"` case now allows `jobId: string | null`), and filling in the real id once the retry call resolves. `RunningView`'s polling `useEffect` guards on `if (!jobId) return` - with no id it just renders the loader (subtitle already falls back to "Starting…", so that text still shows, now inside the loader itself rather than on a button) and does nothing, then starts polling the moment a real id arrives via the effect's own `[jobId]` dependency. A failed retry now restores whatever screen (`results`/`failed`) was showing before the click, rather than needing a separate "leave the screen as it was" branch - the optimistic `running` state is simply reverted on error, same toast as before. The `retrying` boolean and its "Starting…"/disabled button state are gone entirely - the button now unmounts the instant it's clicked, so there was nothing left for it to guard. 12 tests unchanged (the `screen.getByText("Starting…")` assertions still pass - same text, now from the loader). `tsc --noEmit` clean, full suite 1095 passed (same pre-existing/flaky unrelated failures as before).

Not yet committed anywhere.

## Pending SQL
None.
