# Company Intel Extraction (Onboarding) — Frontend

Step 1 of the onboarding wizard (`OnboardingPage.tsx`, step `intel`). The user provides a company
profile **document** and/or their **website URL**; we call the backend to extract the
Review-Details fields, show a dynamic "Analysing" loader, and land on the Review step pre-filled.

## Company Intel step (`pages/onboarding/CompanyIntelStep.tsx`)
- Website URL input + file dropzone. File accepts **PDF/DOCX only** (≤ 50 MB); wrong type/size
  shows an inline error and the file isn't set.
- **At least one of {document, URL} is required** — "Analyse Company" is blocked with
  "Upload a document or enter your website URL." when both are empty, and the URL input + dropzone
  go **red** (`inp-error` / red border) until the user provides one.
- On Analyse → `onAnalyse(file, url)`. "Skip and fill manually" → blank Review.
- `serverError` prop renders backend errors (e.g. "File too large", "Couldn't read that website").

## Two-phase orchestration (`OnboardingPage.tsx`)
`handleAnalyse(file, url)` runs the document first, then the URL only if needed:
1. **Document present** → stage `doc`, `extractCompanyProfile(file)`; on success store `docFields`
   + apply to the Review form. On error → **auto-fallback**: if a URL was given, go to the URL
   stage; otherwise surface the error and return to step 1.
2. **Loader `onComplete` (after the doc pass)** → if a URL was given **and** the doc is missing any
   of the 5 important fields (`description, sector, reporting_currency, headquarter_city,
   fiscal_year_end_month` — `hasAllImportant`) → start the URL stage; else → Review.
3. **URL stage** (`startUrlStage`) → `scrapeWebsite(url)`, then **merge doc-wins**
   (`mergeFields(docFields, urlFields)` — document values kept, URL fills only the gaps) and apply.
   On scrape error: proceed to Review with whatever the doc gave, or (if nothing) surface the error.
4. **URL-only** (no document) → straight to the URL stage.

## Review step — required fields & validation
- Required (marked with a red `*` via `AiLabel required`): **Description, Employees, Fiscal year,
  Currency, Language**. Currency defaults to SAR, Language to English. Sector / Founded / HQ /
  Exchange are optional.
- On "Continue", `onReviewContinue` validates the fields that can actually be empty — Description
  (≥20 chars) and Employees (≥1) — into a `reviewErrors` map. Invalid fields get a **red border**
  (`inp-error`) + an inline `fl-err` message and advance is blocked; the error clears as the user
  edits that field. (The three selects always hold a default, so they can't be empty.)

## Dynamic Analysing screen
Reuses `GeneratingScreen` (phase-driven). `key={analyseStage}` remounts it per phase so the step
list/animation reset:
- `DOC_STEPS` while reading the document; `URL_STEPS` (incl. "Fetching website content",
  "Reading the About page") while scraping. **Website steps only appear if we actually scrape** —
  so the screen reflects the real path (doc-only → no website steps; doc complete → URL skipped).
- The checklist is cosmetic, but completion is gated on the real API call (it holds until the
  request resolves).

## API client (`lib/api.ts`)
- `extractCompanyProfile(file)` — multipart POST `/api/v1/auth/onboarding/extract-profile`.
- `scrapeWebsite(url)` — JSON POST `/api/v1/auth/onboarding/scrape-website`.
- Both return `ExtractedCompanyProfile` (10 nullable fields) from the `{ fields }` envelope.

## Notes
- Static scraping won't fully read JS-heavy SPA sites (handled later via a headless browser);
  such sites come back thin, and the user can fall back to the document or manual entry.
- Sector shown on Review is display-only for now (not yet in the onboarding save payload).

## Files
`pages/OnboardingPage.tsx`, `pages/onboarding/CompanyIntelStep.tsx`, `lib/api.ts`,
`components/reports/GeneratingScreen.tsx` (reused, `phase`/`steps` props).

## Update — sector dropdown, profile fields, single combined call
- **Review step new fields:** Sector is now a **dropdown** of the DB sectors (mirrors ESGModal),
  **AI-picked** (keeps the AI tag) and **mandatory**. Added **Company Profile** (listed/private
  dropdown) and **Shariah / Has subsidiaries / Has sukuk** as required **Yes/No** controls — all
  mandatory, **manual, no AI tag** (sensitive). `applyExtracted` only sets `sector_id`; the rest
  the user fills. Validation reds any missing required field.
- **Single combined extraction:** `extractCompanyProfile(file?, url?)` posts both to the one
  endpoint; the old two-phase doc→URL flow + skip-URL logic is gone. The Analysing screen is one
  pass. `ExtractedCompanyProfile.sector` → `sector_id`/`sector_name`.
- **OnboardingPayload** now carries `sector_id`, `company_profile`, `is_shariah`,
  `has_subsidiaries`, `has_sukuk`.
- **Cycle form (`CycleForm` + `CycleDetailPage`):** Company Profile + the 3 toggles removed; the
  remaining "Sector" is relabelled **Reporting Sector**. `CreateCyclePayload` drops the 4 fields.
- **ESG report page (`ESGModal`):** the sector dropdown pre-selects the company's saved sector
  (`companies.getMyCompany().sector_id`), still changeable.
- **Profile page (`CompanyDetailsCard`):** admins can edit Company Profile (listed/private dropdown)
  + Shariah / Has subsidiaries / Has sukuk (toggles), saved via `PATCH /companies/me` (the 4 aren't
  in the backend's `PROTECTED_FIELDS`; `company_profile` is value-validated). New cycles pick up the
  updated values on their next creation (existing cycles keep their snapshot).
