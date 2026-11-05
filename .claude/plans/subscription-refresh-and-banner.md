# Logged-in users pick up a new plan + no "Open license" on the cloud's expired banner — PLAN (waiting for approval)

**Date:** 2026-11-05 · **Repo:** Centrion_Frontend only · **Branch:** `licensing`
**Found in:** `Centriyon Notes/Features/Cloud Subscriptions — Test Cases.md` (runs 7 and 8)
**No backend, database or endpoint change.** Uses the existing `POST /auth/refresh-token`.

---

## Fix 1 — people already logged in get a newly bought plan without reloading

**Today:** permissions sit in the login token. The app asks for fresh ones only when the page loads
(`AuthContext.tsx:150-157`); the admin's banner also re-checks on every page change. Example: Sara (PM) logged in at
10:00, the admin buys a plan with Board Report at 10:30 → Sara doesn't get Board Report (server: "Requires
permission") until she reloads.

**Fix — `src/context/AuthContext.tsx`:**
- Ask for fresh permissions (`refreshPermissions`, same call as today) also:
  - when the tab comes back into view (`visibilitychange` → visible) — at most once a minute;
  - every 5 minutes while the tab is open and visible.
- Only when someone is logged in. Best effort, as today: if the call fails, the saved permissions stay.
- `refreshPermissions` updates the saved **user** only when something actually changed (permissions, visible
  features, apps, default app) — so a check that finds nothing new doesn't make every page draw again. The token is
  still saved each time (it's a fresh one).
- New small function `samePermissions(a, b)` for that comparison.

**What could break:**
- One small `/auth/refresh-token` call per user every 5 minutes, and on tab focus (at most once a minute). A
  dashboard tab left open all day = ~100 calls a day per user.
- When a module **is** added, the sidebar and pages update by themselves within 5 minutes (or as soon as the user
  comes back to the tab) — that's the point, but it means the menu can change while someone is looking at it.
- When a module is **removed**, it disappears from the menu the same way (the server already refused using it).
- Spark staff: same refresh; their permissions don't depend on plans, so nothing changes for them.

## Fix 2 — the cloud's expired banner shows only "Renew subscription"

**Today:** `src/components/license/LicenseBanner.tsx:148` — expired on the **cloud** has
`['renew', 'open']`: "Renew subscription" **and** "Open license" (an older button from license keys; "license" isn't
a word cloud clients see any more, and Renew already leads where they need to go).

**Fix:** cloud expired → `['renew']` only. **On-premises unchanged** (`['open']` — there it opens the box to paste
a new key). The other banners are not touched.

**What could break:** a cloud admin on an expired subscription no longer has a one-click way from the banner to the
License card in Admin Console (the card is still there, one click away in the sidebar).

---

## Tests
- `src/test/licensing.test.tsx`: cloud expired → "Renew subscription" and **no** "Open license"; on-premises
  expired still has "Open license" (the existing test).
- New in `src/test/subscription-low-issues.test.tsx` (or the auth tests): `samePermissions`; the refresh runs on tab
  focus and on the 5-minute timer (fake timers), not more than once a minute on focus; a refresh that returns the
  same permissions doesn't replace the saved user.
- Full suite + lint on touched files.
- **Browser:** two windows — "QA No Plan" PM logged in; admin changes the plan (or Spark edits it with "Apply to
  everyone") → the PM's menu updates after the tab is focused, without a reload. And a red expired banner on the
  cloud with only Renew (needs the end date moved into the past and back again, as in run 8 — **will ask first**).

## Steps
1. `AuthContext.tsx` (fix 1) + tests.
2. `LicenseBanner.tsx` (fix 2) + test.
3. Full suite, lint, browser check.
4. Commit + push on `licensing`.
5. Notes: `Features/Cloud Subscriptions.md`, `Features/Cloud Subscriptions — Test Cases.md` (the 2 findings → fixed),
   `Features/Auth and Registration.md` (permissions refresh), `Current Status.md`.

## Progress
- Plan written 2026-11-05. **Approved 2026-11-05** (remove, not rename).
- **Built 2026-11-05:** new `src/lib/permissionsRefresh.ts` (`samePermissions`, `REFRESH_EVERY_MS`,
  `MIN_GAP_ON_FOCUS_MS` — in `lib/`, not in AuthContext, so it can be tested alone); `src/context/AuthContext.tsx`
  (5-minute timer + tab-back refresh; the user is only replaced when something changed);
  `src/components/license/LicenseBanner.tsx` (cloud expired → `['renew']`).
  Tests: new `src/test/permissions-refresh.test.tsx` (6), 2 new in `licensing.test.tsx`; full suite 1296 passed
  (7 skipped); lint 0 errors.
  Browser: QA No Plan admin on the dashboard; Spark added Quarterly to "QA Board 1" (apply to everyone) → still off
  right after; tab back after 61 s → **on, without a reload**, timeline row unlocked; plan put back afterwards.
  The cloud expired banner was checked by the tests only (a browser check needs the end date moved in the DB).
