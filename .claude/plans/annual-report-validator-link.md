# Plan: Annual Report Validator link in the Spark sidebar

**Status:** Built 2026-10-07, not committed. Sidebar tests pass.
**Branch:** `feat/annual-report-validator` off `pre-staging`
**Main plan (the feature itself):** `D:\AnnualReporting\AIAnnualReporting\.claude\plans\validate-uploaded-report.md`

## What and why
The Annual Report Validator lives in the AI Annual Reporting app (spark_studio, `VITE_SAR_APP_URL`). It validates an **external** annual report (one made outside the system) against the strategic brief, concept messages and tone that the user uploads with it. Spark staff need to reach it from Centriyon, so this repo only adds a **sidebar link**. All the work happens in the other app.

## Who sees it
- **Spark (`spark_internal`) only.** It sits in the Spark block, directly under **Companies**.
- It shows **before a client is picked** (the Companies page) and after. An external report belongs to no client, so it never needs one, which is why the link doesn't take the acting company.
- Admins don't get it. If they should later, it's one entry in `REPORTS_VALIDATION_CHILDREN`.

## Files
1. `src/lib/appRouting.ts`: new `sparkStudioUrl(path)`. It builds the existing token handoff, `${VITE_SAR_APP_URL}/auth/token?token=…&next=<path>&back=<this page>`, and returns `null` without a token. It's the same handoff `ReportTeamCard.workspaceUrl` builds, minus `company`. That file is left alone.
2. `src/components/layout/Sidebar.tsx`: an **Annual Report Validator** button in the Spark block, under Companies. A click goes to `sparkStudioUrl("/pm/annual-report-validator")` in the same tab. The other app's back button returns here through `back`.
3. `src/test/spark-sidebar.test.tsx`: Spark sees the item with and without a company; admin doesn't; the click goes to the handoff URL with `next=/pm/annual-report-validator` and no `company`.

## What could break
- **Sidebar tests match labels by exact text.** "Annual Report Validator" doesn't collide with "Annual Report". The "shows only the directory before a company is chosen" test still passes, since that list doesn't name the new item.
- **No route, feature-key or backend change in this repo.**

## Pending SQL
None.
