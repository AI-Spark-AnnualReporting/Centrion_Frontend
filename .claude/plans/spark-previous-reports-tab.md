# Show "Upload Previous Reports" to the internal (Spark) user

**Date:** 2026-11-02 · **Repo:** Centrion_Frontend only · **Branch:** pre-staging (current)

## Goal
When the internal user (`spark_internal`) picks a company, the sidebar shows "Upload Previous Reports",
so they can see which previous annual reports were uploaded for that company.

## What already works (no change needed)
- The page `/upload-reports` (`src/pages/UploadReportsPage.tsx`) already lets `spark_internal` in
  (`src/App.tsx:285`, `requiredRole={["admin", "spark_internal"]}`).
- The list at the bottom of that page (`UploadedReportsList`) reads the company's documents through
  `src/lib/api.ts`, which already sends the chosen company as `X-Company-Id`. So it shows the chosen
  company's reports, not Spark's.
- The backend needs no change.

## Why it's hidden today
`src/components/layout/Sidebar.tsx:20`: Spark only sees sidebar items whose key is in
`SPARK_NAV_KEYS = ['ai', 'comms', 'docs']`. `uploadReports` is not in that list.

## Steps
1. `src/components/layout/Sidebar.tsx`: add `'uploadReports'` to `SPARK_NAV_KEYS` and update the comment
   above it. It is still hidden on the company directory, because the whole list is hidden until a
   company is picked (`!sparkAwaitingCompany`).
2. `src/test/spark-sidebar.test.tsx`: move "Upload Previous Reports" from the `HIDDEN` list to the shown
   items, and add a check that clicking it goes to `/upload-reports`.
3. Run the sidebar tests, `tsc -p tsconfig.app.json` and eslint on the 2 files.
4. Notes: feature note + Current Status.

## Ripple effect
- Only the Spark sidebar changes. Admins already see this item. Other roles are not affected
  (it is `adminOnly`).
- The same page also has the upload form, so Spark can upload reports for the company and
  rebuild its dashboard. That is the same thing an admin of that company can do.
- Example: Spark picks "Aramco", the sidebar shows "Upload Previous Reports", and the list
  shows Aramco's uploaded annual reports.
