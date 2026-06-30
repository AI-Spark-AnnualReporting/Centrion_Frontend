# Centrion Frontend — Complete Reference

> Single source of truth for the Centrion ESG & IR (Investor Relations) web frontend.
> Covers architecture, every screen, every backend endpoint the app calls, the design
> system, auth, the async report-generation/polling pipeline, and all key data types.
> If you paste this document, you have everything needed to understand or extend the app.

---

## 1. What the product is

Centrion is an institutional ESG (Environmental, Social, Governance) & Investor-Relations
platform aimed at SAMA/CMA-regulated companies (Gulf region). The frontend lets a company:

- Generate **ESG reports** from uploaded documents, mapped to frameworks (GRI, IFRS-S1/S2, regional regulators).
- Generate **Quarterly financial reports** (figures/drivers/comparatives extraction).
- Watch report generation **in real time** (async pipeline + polling).
- Drill into a report's **coverage** (which indicators were found / partial / not disclosed), with evidence and gap Q&A.
- Manage **meetings**, **team/stakeholders**, **documents**, and a **questions bank**.
- Use an **AI copilot** (chat with tool-calling) for questions about the data.

---

## 2. Tech stack & tooling

| Area | Choice |
|------|--------|
| Framework | React 18.3 + TypeScript |
| Build | Vite 5.4 (`@vitejs/plugin-react-swc`) |
| Routing | react-router-dom 6.30 |
| Data fetching | Native `fetch` via a typed client (`src/lib/api.ts`). TanStack Query is installed but the app primarily uses the custom client + React state. |
| UI primitives | Radix UI + shadcn/ui (`src/components/ui/*`, 40+ wrappers) |
| Styling | Tailwind 3.4 + a large custom CSS design system in `src/index.css` (most app screens use inline styles + custom classes, not Tailwind utilities) |
| Charts | recharts |
| Icons | lucide-react |
| Markdown | react-markdown + remark-gfm (AI chat) |
| Forms/validation | react-hook-form + zod (available; auth/registration use plain state) |
| Notifications | sonner / custom `use-toast` |
| Tests | vitest + @testing-library/react + jsdom |

### NPM scripts (`package.json`)
- `dev` — Vite dev server (port **8080**)
- `build` — production build → `dist/`
- `build:dev` — build in development mode
- `lint` — ESLint
- `preview` — preview the production build
- `test` / `test:watch` — vitest

### Path alias
`@/` → `./src/` (configured in `vite.config.ts` and `tsconfig`).

### TypeScript config
Strict mode is **off** (`strict: false`, `noImplicitAny: false`), JSX automatic runtime, target ES2020, bundler module resolution.

### Dev server (`vite.config.ts`)
- Host `::`, port `8080`, HMR overlay disabled.
- `/api` is proxied to `VITE_API_URL`.
- Allowed hosts include localhost + `*.ngrok-free.dev/.app`, `*.ngrok.io`, `*.trycloudflare.com`.
- `componentTagger()` (lovable-tagger) runs only in dev.

---

## 3. Environment variables

Only one env var matters:

| Var | Purpose | Default |
|-----|---------|---------|
| `VITE_API_URL` | Backend API base URL. Trailing slashes are stripped. | `http://localhost:8000` |

- `.env.local` (dev) → `VITE_API_URL=http://localhost:8000` (with commented Azure/ngrok alternatives).
- `.env.production` → Azure backend URL (`https://centrion-backend-...azurewebsites.net`).

All API paths below are relative to `VITE_API_URL` (e.g. `${VITE_API_URL}/api/v1/...`).

---

## 4. Project structure

```
src/
├── main.tsx                 # App bootstrap: <AuthProvider><App/></AuthProvider>, imports index.css
├── App.tsx                  # BrowserRouter + all route definitions
├── index.css                # Global design system (CSS vars, component classes, animations)
├── context/
│   └── AuthContext.tsx       # Auth state + useAuth() hook
├── hooks/
│   ├── use-pipeline-poll.ts  # Async pipeline polling
│   ├── use-mobile.tsx        # useIsMobile() (<768px)
│   └── use-toast.ts          # Toast manager
├── lib/
│   ├── api.ts                # Typed fetch client — ALL backend calls live here
│   ├── active-pipeline.ts    # Persist in-flight run to localStorage (resume)
│   ├── agent-labels.ts       # Canonical ESG pipeline agent list
│   └── utils.ts              # cn() = clsx + tailwind-merge
├── types/
│   ├── auth.ts               # AuthUser, LoginResponse, UserProfile
│   ├── company.ts            # Sector, CompanyRecord
│   ├── lookups.ts            # Regions/Countries/Regulators/Scopes/FrameworkIndicator
│   ├── meeting.ts            # Meeting + enums
│   ├── register.ts           # Registration step state + RegisterRequest
│   └── report.ts             # Coverage, pipeline, agent-run types (largest)
├── pages/                   # One file per route (see §6)
└── components/
    ├── layout/               # AppLayout, Sidebar, Topbar
    ├── auth/                 # AuthPages (login+signup), ChangePasswordPage
    ├── registration/         # StepIndicator, StepOneForm, StepTwoForm
    ├── dashboard/            # DashboardESG, DashboardBoard, DashboardFinancial
    ├── reports/              # GeneratingScreen, QuarterlyGeneratingScreen,
    │                         #   QuarterlyReportForm, AgentTimeline, ReportDetailView
    ├── shared/               # ESGModal, FloatingChatbot
    ├── ui/                   # shadcn/ui primitives (40+)
    ├── ProtectedRoute.tsx
    ├── NavLink.tsx
    ├── AddPersonDialog.tsx
    └── ScheduleMeetingModal.tsx
```

---

## 5. Routing & app shell

### Bootstrap
`src/main.tsx` mounts `<AuthProvider><App/></AuthProvider>` to `#root` and imports `index.css`.

### Routes (`src/App.tsx`)

**Public:**
| Path | Component | Purpose |
|------|-----------|---------|
| `/login` | LoginPage | Sign in |
| `/register`, `/signup` | SignupPage | Two-step self-service signup |
| `*` | NotFound | 404 |

**Protected** (wrapped by `<ProtectedRoute>`):
| Path | Component | Purpose |
|------|-----------|---------|
| `/change-password` | ChangePasswordPage | Forced first-login password rotation (no sidebar) |

**Protected + inside `<AppLayout>`:**
| Path | Component | Page title (Topbar) |
|------|-----------|--------|
| `/` and `/dashboard` | DashboardPage | Command Center |
| `/reports` | ReportsPage | Reports |
| `/reports/processing` | ProcessingPage | (loader) |
| `/reports/:reportId` | ReportDetailPage | (detail) |
| `/kpi` | KPIPage | KPI Normalizer |
| `/compliance` | CompliancePage | Compliance (placeholder) |
| `/ai` | AIPage | IR Copilot |
| `/meetings` | MeetingsPage | Board & Meetings |
| `/comms` | CommsPage | Comms Hub (placeholder) |
| `/stakeholders` | StakeholdersPage | Leadership |
| `/docs` | DocsPage | Document Bank |
| `/questions` | QuestionsPage | Questions Bank |
| `/profile` | ProfilePage | Profile |

### ProtectedRoute logic (`src/components/ProtectedRoute.tsx`)
1. While auth is hydrating → "Loading…".
2. No `user` → redirect `/login`.
3. `user.must_change_password === true` and not on `/change-password` → redirect `/change-password`.
4. `must_change_password` falsy but on `/change-password` → redirect `/dashboard`.
5. Otherwise render the route (`<Outlet/>`).

### App shell (`src/components/layout/AppLayout.tsx`)
```
<div class="app-shell">
  <Sidebar/>
  <div class="main">
    <Topbar pageName={...}/>
    <div class="content"><Outlet/></div>
  </div>
  <FloatingChatbot/>     // "Ask Centriyon" FAB → /ai
</div>
```
`PAGE_NAMES` maps pathname → Topbar title (defaults to "Command Center").

**Sidebar** (`Sidebar.tsx`) groups nav into **IR System** (Command Center, Reports, KPI Normalizer, IR Copilot), **Stakeholders** (Board & Meetings, Leadership), **Workspace** (Document Bank, Questions Bank, Profile). Logo shows "Centriyon" (the "Investor Portal" subtext was removed). Bottom shows the current user's avatar/name/role + logout. (Compliance & Comms Hub nav items are commented out until wired.)

**Topbar** (`Topbar.tsx`) shows page name · company name, user avatar (initials), name, role · email, and a Log out button.

---

## 6. Screens (pages) — what each does

### Auth
- **LoginPage** (`components/auth/AuthPages.tsx`): branded split layout; email + password (show/hide), "remember me", Sign in → `useAuth().login()`. On success redirects to `/` or `/change-password`. Link to signup.
- **SignupPage** (`components/auth/AuthPages.tsx`): two-step wizard with `StepIndicator`.
  - Step 1 (`StepOneForm`): full name, email, password (≥8), confirm.
  - Step 2 (`StepTwoForm`): company name, sector (from lookups), jurisdiction. Submit chains `createCompany` → `register`, then redirects to `/login?registered`.
- **ChangePasswordPage** (`components/auth/ChangePasswordPage.tsx`): mandatory rotation for team-invited users (temp password). Fields: old, new (≥8, ≠old), confirm. Calls `auth.changePassword`. Logout still available.

### Dashboard (`pages/DashboardPage.tsx`)
Command Center with tabs **ESG | Board** (a Financial tab exists but is hidden). Header button is "Generate Report" (ESG tab → opens `ESGModal`) or "Schedule Meeting" (Board tab → `ScheduleMeetingModal`).

- **DashboardESG** (`components/dashboard/DashboardESG.tsx`): loads latest report + its coverage.
  - **Hero** card (indigo gradient): overall coverage %, metrics disclosed/total, gaps count, period + frameworks.
  - **Pillar cards** (E / S / G), 3-up equal grid: score, found/coverage, "Key Metrics" list (code, label, value, ✓/!).
  - Bottom row, 3-up equal grid (`repeat(3,minmax(0,1fr))` — fixed so the columns stay equal-width and align with the pillar cards above): **Framework Catalogue**, **Critical Gaps — Sector Materiality**, **Coverage by Report** (recharts trend).
  - APIs: `reports.list`, `reports.getCoverage`, `lookups.scopes`.
- **DashboardBoard** (`components/dashboard/DashboardBoard.tsx`): meetings calendar, leadership roster (counts + sorted people), coverage questions list. APIs: `meetings.list`, `team.list`, `companies.listQuestions`. Re-fetches when parent bumps a `refreshKey` (after scheduling a meeting).
- **DashboardFinancial** (`components/dashboard/DashboardFinancial.tsx`): KPI strip + revenue/profitability charts — currently hardcoded placeholder pending backend.

### Reports (`pages/ReportsPage.tsx`)
Header tabs: **ESG & Sustainability** and **Quarterly** (Annual/Sustainability still commented out). Tab state `activeTab: 'esg' | 'quarterly'`. A resume banner appears (across both tabs) if an active pipeline is in localStorage (Dismiss / Resume watching → `/reports/processing`).

- **ESG tab** — "Validate ESG Report" collapsible card:
  - Reporting Year (year picker for new, or dropdown of existing reports + "+ Add new…").
  - Industry Sector (optional, from `getSectors`/lookups).
  - Report Scope: global | regional. Regional reveals Region → Country (cascading lookups) → Regulators.
  - ESG Frameworks: global = radio (GRI/IFRS), regional = checkboxes of regulator codes (auto-checked).
  - GRI Indicator Scope (if GRI): Standard (85) | Full (128).
  - Source selector when an existing report is picked: "Generate from DB" or "Upload new documents".
  - Upload zone (drag/drop, one file: pdf/docx/txt/csv/xlsx).
  - Validate Report → `reports.generate(...)` → navigate `/reports/processing`.
  - Below: **Recent Reports** gallery (cards → `/reports/:reportId`).
- **Quarterly tab** — `QuarterlyReportForm` (see §8).

### ProcessingPage (`pages/ProcessingPage.tsx`)
Receives `ProcessingPageState` via router state, polls via `usePipelinePoll`, persists the run (resume), and on completion fetches coverage then navigates to `/reports/:reportId` (passing coverage in state to skip a refetch). Renders:
- `QuarterlyGeneratingScreen` when `state.reportType === 'quarterly'`.
- `GeneratingScreen` otherwise (ESG).
Both handle running / completed / failed / timeout.

### ReportDetailPage (`pages/ReportDetailPage.tsx`) + ReportDetailView
Full coverage breakdown: header (period, frameworks, overall %), pillar breakdown, critical gaps, coverage-by-report chart, and a filterable indicator table. FOUND rows open an evidence modal (verbatim quote, source doc, confidence). NOT_DISCLOSED rows open a "ask a question about this gap" modal → `reports.createQuestion`. Can receive coverage via router state to avoid refetching.

### Other pages
- **KPIPage** — KPI normalizer table (framework indicators, disclosed values, confidence, evidence).
- **AIPage** — IR Copilot chat: hydrates `chat.getSession`, streams `chat.send` (SSE tokens + tool_start/tool_end), `chat.clearSession`. Markdown rendering, inline tool activity.
- **MeetingsPage** — calendar/list of meetings; create/edit/cancel; `ScheduleMeetingModal`.
- **StakeholdersPage** — team roster by position type; add/edit/remove via `team.*` and `AddPersonDialog` (generates temp password, shows it once).
- **ProfilePage** — `auth.me()`; identity, org info, company id, certifications (some static).
- **DocsPage** — document bank as a 3-level hierarchy: category (report type) → report (or reporting cycle) → documents (`documents.companyDocumentBank`); file metadata + signed download URLs.
- **QuestionsPage** — coverage questions grouped by report (`companies.listQuestions`).
- **CompliancePage**, **CommsPage** — placeholders.
- **NotFound** — 404.

### Shared components
- **ESGModal** (`components/shared/ESGModal.tsx`): dashboard shortcut mirroring the ESG form; submits by navigating to `/reports` with a `pendingGenerate` router state that ReportsPage picks up and sends to the API.
- **FloatingChatbot**: fixed FAB → `/ai`.
- **AddPersonDialog**, **ScheduleMeetingModal**: team invite + meeting scheduling modals.

---

## 7. The async report pipeline (core architecture)

This is the heart of the app. Both ESG and Quarterly generation use it.

```
Form submit
  → reports.generate(...)  OR  reports.generateQuarterly(...)   (multipart/form-data)
      backend replies 202 Accepted (new run)  OR  409 Conflict (a run already exists)
      → postPipeline() normalizes BOTH into a PipelineHandle { runId, pollUrl, reportId, ... }
  → navigate('/reports/processing', { state: ProcessingPageState })
  → ProcessingPage: saveActivePipeline(localStorage) + usePipelinePoll(runId, pollUrl)
      poll every 3s:
        GET {pollUrl}                     → AgentRun   (status: running/completed/failed)
        GET /agent_runs/{runId}/nodes     → AgentNode[] (per-step timeline)
      phases: idle → running → completed | failed | timeout(30m, dismissible)
  → on 'completed': GET coverage, clearActivePipeline(), navigate('/reports/:reportId', {state:{coverage}})
```

### Polling hook (`src/hooks/use-pipeline-poll.ts`)
- `usePipelinePoll(runId, pollUrl)` → `{ state, restart }`.
- `POLL_INTERVAL_MS = 3000`; `MAX_WATCH_MS = 30 min` (user-dismissible → `restart()`).
- `state.phase`: `idle | running | completed | failed | timeout`; carries `run: AgentRun | null`, `nodes: AgentNode[]`, `elapsedMs`.
- Fetches run + nodes in parallel; a nodes error doesn't block phase transitions. AbortController cleans up on unmount.

### Resume persistence (`src/lib/active-pipeline.ts`)
- localStorage key: `centriton_active_pipeline`.
- `ActivePipelineRecord { runId, pollUrl, reportId, companyId, fileName, estimatedDurationSeconds, savedAt }`.
- `saveActivePipeline / loadActivePipeline / clearActivePipeline`.

### ESG step labels (`src/lib/agent-labels.ts`)
The ESG `GeneratingScreen`/`AgentTimeline` always renders these 5 canonical rows (missing backend agents show "pending"):
`validate_file` → "Validating file", `data_extractor` → "Extracting content", `esg_harvester` → "Harvesting ESG indicators", `kpi_normalizer` → "Normalizing KPIs", `save_to_db` → "Saving to database".

---

## 8. Quarterly report feature (built on top of the pipeline)

### Form — `components/reports/QuarterlyReportForm.tsx`
Single ESG-themed card (`.card`) with header (star icon, "New Quarterly Report", subtitle, "AI Powered") and a separator. Body:
- **Reporting Year** (`<select>`; current year ±10) and **Quarter** (Q1–Q4 button group; default Q1).
- **Report Areas** (label + "Select all/Clear all") — 6 selectable cards in a `repeat(3,1fr)` grid, none selected by default. Each card has a checkbox indicator + metric count. The `key` is the slug sent to the backend:
  | Card | slug (`areas[]`) |
  |------|------|
  | Key Highlights | `key_highlights` |
  | Income Statement Review | `income_statement` |
  | Balance Sheet Review | `balance_sheet` |
  | Shareholder Returns | `shareholder_returns` |
  | Outlook | `outlook` |
  | Financial Tables | `financial_tables` |
- **Source Documents** (`*`) — drag/drop, **multiple** files (pdf/docx/xlsx/csv), de-duped by name+size, removable list.
- **Validate Report** — enabled only when companyId + year + ≥1 file + ≥1 area. Calls `reports.generateQuarterly`, then navigates to `/reports/processing` with `reportType: 'quarterly'` and `period: "Q{n} {year}"`.

### Loader — `components/reports/QuarterlyGeneratingScreen.tsx`
Rendered by ProcessingPage when `reportType === 'quarterly'`, driven by the same real poll:
- **Dark gradient hero**: circular SVG **progress ring** (live %), eyebrow `"{period} · {companyName}"`, title that flips from "Crunching the quarter's numbers" → "Extraction complete", subtitle. Optional **stats tiles** (Figures extracted / Drivers linked / Comparatives matched) that render *only when the backend's run `output_summary` includes those counts* (no fabricated numbers).
- **Step checklist card**: Parsing documents → Extracting figures → Linking drivers → Loading comparatives, each with Done / In progress / Pending badges. Step completion is derived from the poll progress fraction; on `completed` all steps mark done and the ring hits 100%.
- Failed/timeout render dedicated result cards.

> Backend contract note: the `areas[]` slugs and the three hero stat field names
> (`figures_extracted`/`figures_total`, `drivers_linked`/`drivers_total`,
> `comparatives_matched`/`comparatives_total`) are assumptions. They are isolated to
> `QUARTERLY_AREAS[].key` and the `QuarterlyMetrics` interface respectively, so if the
> backend differs only those need changing.

---

## 9. API client (`src/lib/api.ts`) — base behavior

- **Base URL**: `API_BASE_URL = (VITE_API_URL ?? "http://localhost:8000").replace(/\/+$/,"")`.
- **Default headers**: `{ "ngrok-skip-browser-warning": "true" }` (harmless on Azure).
- **Auth**: Bearer token auto-attached unless `auth: false`. Stored in localStorage:
  - `centriton_token` — JWT access token.
  - `centriton_user` — serialized `AuthUser`.
- **`request<T>(path, opts)`**: core helper — supports `method`, `query`, `body` (JSON), `form` (FormData), `signal`. Builds query via URLSearchParams (arrays = repeated params). Parses JSON/text. **On 401** it clears auth and redirects to `/login`. Throws `ApiError<TBody>` (`status`, `statusText`, `body`, `url`) on non-2xx.
- **`postPipeline(path, form)`**: posts multipart FormData; normalizes **202** (`AsyncPipelineResponse`) and **409** (`PipelineConflictBody`, possibly nested under `detail`) into one **`PipelineHandle`**.
- **`parseJwtPayload`**: decodes the JWT (no signature check) to backfill `company_id`.
- **`company_id` resolution**: from the login response's `user`, else from JWT claims; persisted and backfilled for older sessions.

---

## 10. API endpoint reference (everything the frontend calls)

All paths are under `${VITE_API_URL}`. `{companyId}` etc. are path params. Functions are exported from `src/lib/api.ts` (namespaced objects: `auth`, `companies`, `documents`, `team`, `reports`, `agentRuns`, `esg`, `compliance`, `agents`, `chat`, `meetings`, `admin`, `lookups`, `system`).

### Auth
| Method | Path | Function | Notes |
|--------|------|----------|-------|
| POST | `/api/v1/auth/register` | `auth.register` | email, password, full_name, role? |
| POST | `/api/v1/auth/login` | `auth.login` | → `LoginResponse` (access_token, user) |
| POST | `/api/v1/auth/change-password` | `auth.changePassword` | old_password, new_password (query) |
| GET | `/api/v1/auth/me` | `auth.me` | → `UserProfile` |

### Companies
| Method | Path | Function |
|--------|------|----------|
| POST | `/api/v1/companies/` | `companies.create` (name, sector, jurisdiction?) |
| GET | `/api/v1/companies/` | `companies.list` |
| GET | `/api/v1/companies/{companyId}` | `companies.get` |
| GET | `/api/v1/companies/{companyId}/twin` | `companies.getDigitalTwin` (period?) |
| GET | `/api/v1/companies/{companyId}/twin/{stateType}` | `companies.getTwinState` |
| GET | `/api/v1/companies/{companyId}/kpis` | `companies.getKpiHistory` (metric?) |
| GET | `/api/v1/companies/{companyId}/questions` | `companies.listQuestions` (report_id?, indicator_id?) → `CompanyQuestionsResponse` |

### Documents
| Method | Path | Function | Notes |
|--------|------|----------|-------|
| POST | `/api/v1/documents/upload` | `documents.upload` | FormData files + frameworks[] (default ["GRI"]); async → `PipelineHandle` |
| GET | `/api/v1/documents/{companyId}/{documentId}` | `documents.get` | |
| GET | `/api/v1/documents/{companyId}/by-report` | `documents.byReport` | expires_in? → `DocumentBankResponse` |
| GET | `/api/v1/documents/{companyId}/company-document-bank` | `documents.companyDocumentBank` | expires_in? → `CompanyDocumentBankResponse` (Category → Report → Documents; cycle docs surface as reports under Annual) |

### Team
| Method | Path | Function |
|--------|------|----------|
| GET | `/api/v1/companies/{companyId}/team` | `team.list` (position_type?, role?, include_inactive?) |
| POST | `/api/v1/companies/{companyId}/team` | `team.create` (email, full_name, temp_password, …) |
| GET | `/api/v1/companies/{companyId}/team/{userId}` | `team.get` |
| PATCH | `/api/v1/companies/{companyId}/team/{userId}` | `team.update` |
| DELETE | `/api/v1/companies/{companyId}/team/{userId}` | `team.remove` |

### Reports
| Method | Path | Function | Notes |
|--------|------|----------|-------|
| GET | `/api/v1/reports/{companyId}` | `reports.list` | |
| GET | `/api/v1/reports/{companyId}/{reportId}` | `reports.get` | |
| POST | `/api/v1/reports/{companyId}/{reportId}/approve` | `reports.approve` | |
| POST | `/api/v1/reports/{companyId}/{reportId}/publish` | `reports.publish` | channel? (default `investor_portal`) |
| **POST** | **`/api/v1/reports/{companyId}/generate`** | `reports.generate` | **ESG**; FormData: files[], year, sector_id?, scope_type, report_type?, framework_codes[]?, region?, country_id?, regulator_ids[]?, gri_scope?; async → `PipelineHandle` |
| **POST** | **`/api/v1/reports/{companyId}/quarterly/generate`** | `reports.generateQuarterly` | **Quarterly**; FormData: files[], year (int), quarter (string), areas[]?; async → `PipelineHandle` |
| POST | `/api/v1/reports/{companyId}/{reportId}/documents` | `reports.addDocuments` | FormData files[]; async → `PipelineHandle` |
| GET | `/api/v1/reports/{companyId}/{reportId}/coverage` | `reports.getCoverage` | status?, pillar?, include_duplicates? → `CoverageResponse` |
| POST | `/api/v1/reports/{companyId}/{reportId}/questions` | `reports.createQuestion` | { framework_indicator_id, question_text } → question id |

### Agent runs (polling)
| Method | Path | Function |
|--------|------|----------|
| GET | `/api/v1/agent_runs/{runId}` | `agentRuns.get` → `AgentRun` |
| GET | `{pollUrl}` (dynamic) | `agentRuns.getByPollUrl` |
| GET | `/api/v1/agent_runs/{runId}/nodes` | `agentRuns.getNodes` → `AgentNodesResponse` |

### ESG
| Method | Path | Function |
|--------|------|----------|
| GET | `/api/v1/esg/{companyId}/scores` | `esg.getScores` |
| GET | `/api/v1/esg/{companyId}/evidence` | `esg.getEvidence` (pillar?, document_id?, fields?) |
| GET | `/api/v1/esg/{companyId}/gaps` | `esg.getGaps` |
| GET | `/api/v1/esg/{companyId}/certifications` | `esg.getCertifications` |

### Compliance (placeholder UI)
| Method | Path | Function |
|--------|------|----------|
| GET | `/api/v1/compliance/{companyId}/checks` | `compliance.getChecks` (regulator?) |
| GET | `/api/v1/compliance/{companyId}/deadlines` | `compliance.getDeadlines` |
| GET | `/api/v1/compliance/rules` | `compliance.getRules` (regulator?) |

### Agents
| Method | Path | Function |
|--------|------|----------|
| GET | `/api/v1/agents/` | `agents.list` |
| GET | `/api/v1/agents/class/{agentClass}` | `agents.filterByClass` |
| GET | `/api/v1/agents/sprint/{sprint}` | `agents.filterBySprint` |
| POST | `/api/v1/agents/{agentName}/run` | `agents.run` (company_id, period?, inputData) |
| GET | `/api/v1/agents/runs/{companyId}` | `agents.getRuns` (agent_name?) |

### Chat (IR Copilot)
| Method | Path | Function | Notes |
|--------|------|----------|-------|
| GET | `/api/v1/chat/session` | `chat.getSession` | → history |
| POST | `/api/v1/chat/` | `chat.send` | SSE stream of `tool_start`/`tool_end`/`token`/`error`/`done` |
| POST | `/api/v1/chat/session/clear` | `chat.clearSession` | |

### Meetings
| Method | Path | Function |
|--------|------|----------|
| GET | `/api/v1/meetings` | `meetings.list` |
| GET | `/api/v1/meetings/{meetingId}` | `meetings.get` |
| POST | `/api/v1/meetings` | `meetings.create` |
| PATCH | `/api/v1/meetings/{meetingId}` | `meetings.update` |

### Admin
| Method | Path | Function |
|--------|------|----------|
| GET | `/api/v1/admin/users` | `admin.listUsers` |
| PATCH | `/api/v1/admin/users/{userId}/role` | `admin.updateUserRole` |
| PATCH | `/api/v1/admin/users/{userId}/status` | `admin.updateUserStatus` |
| GET | `/api/v1/admin/stats` | `admin.platformStats` |

### Lookups (no auth required)
| Method | Path | Function |
|--------|------|----------|
| GET | `/api/v1/lookups/sectors` | `lookups.sectors` → `SectorsResponse` |
| GET | `/api/v1/lookups/regions` | `lookups.regions` |
| GET | `/api/v1/lookups/countries` | `lookups.countries` (region?) |
| GET | `/api/v1/lookups/regulators` | `lookups.regulators` (country_id?) |
| GET | `/api/v1/lookups/frameworks` | `lookups.frameworks` (scope, default global) |
| GET | `/api/v1/lookups/scopes` | `lookups.scopes` → `ScopesResponse` |
| GET | `/api/v1/lookups/framework-indicators` | `lookups.frameworkIndicators` (framework?, fields?, is_active?) |

### System
| Method | Path | Function |
|--------|------|----------|
| GET | `/health` | `system.health` |
| GET | `/` | `system.root` |

---

## 11. Auth (`src/context/AuthContext.tsx`)

`useAuth()` returns:
- `user: AuthUser | null` — hydrated synchronously from localStorage on first render.
- `token: string | null`.
- `loading: boolean`.
- `login(email, password) → Promise<AuthUser>` — calls API, stores token + user, backfills company_id/name.
- `changePassword(old, new) → Promise<void>` — optimistically clears `must_change_password`, then refreshes via `/auth/me`.
- `refreshUser() → Promise<void>` — re-fetches `/auth/me`.
- `logout()` — clears token + user (and on 401 anywhere, the API client logs out + redirects to `/login`).

**First-login rotation**: team-invited users get `must_change_password: true`; ProtectedRoute pins them to `/change-password` until they rotate.

---

## 12. Key data types (`src/types/*`)

### auth.ts
```ts
interface AuthUser { user_id; email; full_name; role:"admin"|"user";
  company_id?:string|null; company_name?:string|null; must_change_password?:boolean|null }
interface LoginResponse { access_token; token_type:"bearer"; user:AuthUser }
interface UserProfile { user_id; email; full_name; role; status;
  company_id:string|null; company_name:string|null; must_change_password?:boolean|null }
```

### company.ts
```ts
interface Sector { id; code; name }
interface CompanyRecord { id; name; jurisdiction:string|null; operating_mode;
  fiscal_year_end_month:number; logo_url:string|null; is_active; created_at; updated_at; sector_id }
```

### lookups.ts
```ts
interface RegionsResponse { regions:string[]; total }
interface CountryLookup { id; code; name; region }
interface ScopeUniversal { code; label; indicator_count }
interface ScopeRegional { regulator_id; code; label; country_id; country_code; country_name;
  primary_frameworks:string[]; indicator_count }
interface ScopesResponse { universal:ScopeUniversal[]; regional:ScopeRegional[];
  totals:{ universal_options; regional_options } }
interface FrameworkIndicator { id?; framework; source_code; indicator_label; terse_label?;
  parent_standard?; esg_pillar?:"E"|"S"|"G"|"ESG"|null; esg_category?; data_type?;
  expected_unit?; is_active? }
```

### report.ts (largest — coverage + pipeline)
```ts
type CoverageStatus = "FOUND"|"PARTIAL"|"NOT_DISCLOSED";
type CoveragePillar = "E"|"S"|"G"|"ESG"|(string&{});

// Async generation
interface AsyncPipelineResponse { run_id; report_id; period; scope_type;
  persisted_frameworks:string[]; ingested_frameworks:string[]; status; started_at;
  poll_url; file_count; estimated_duration_seconds }
interface PipelineConflictBody { error; message; existing_run_id; started_at; poll_url }
interface PipelineHandle { runId; pollUrl; reportId:string|null; startedAt;
  estimatedDurationSeconds:number|null; fileCount:number|null; isExisting:boolean; message? }

// Request bodies
interface GenerateReportBody { files:File[]; year:number; sector_id?; scope_type:string;
  report_type?; framework_codes?:string[]; region?; country_id?; regulator_ids?:string[];
  gri_scope?:"standard"|"full" }
interface GenerateQuarterlyBody { files:File[]; year:number; quarter:string; areas?:string[] }
interface AddReportDocumentsBody { files:File[] }

// Polling
interface AgentRun { run_id; agent_name; status:"running"|"completed"|"failed";
  company_id?; started_at; elapsed_seconds; completed_at:string|null;
  input_summary:PipelineInputSummary|null; output_summary:PipelineOutputSummary|null;
  error_message:string|null }
interface AgentNode { agent_name; status; elapsed_seconds; created_at; error_message:string|null }
interface AgentNodesResponse { run_id; nodes:AgentNode[] }
interface PipelineOutputSummary { results:PipelineResultItem[]; total_uploaded; succeeded; failed; skipped }

// Coverage (report detail)
interface CoverageIndicator { framework_indicator_id; framework; source_code; indicator_label;
  pillar; esg_category; data_type; status:CoverageStatus; value:number|null; unit:string|null;
  text_value:string|null; bool_value:boolean|null; confidence:number|null; source_page:number|null;
  document_id:string|null; evidence_id:string|null; is_mandatory?; provenance?; … }
interface CoverageSummary { total_indicators; found_count; partial_count; not_disclosed_count;
  disclosure_rate; by_pillar:Record<string,CoveragePillarSummary>; sector_materiality? }
interface CoverageResponse { report_id; company_id?; company_name?; period; sector?;
  scope_type; frameworks:string[]; regulators?; documents?; summary:CoverageSummary;
  indicators:CoverageIndicator[]; critical_gaps? }
```
`ProcessingPageState` (exported from `pages/ProcessingPage.tsx`) — the router-state handoff:
```ts
interface ProcessingPageState { runId; pollUrl; reportId:string|null; companyId;
  estimatedDurationSeconds:number|null; fileName:string|null; isExisting:boolean;
  conflictMessage?; reportType?:string /* 'quarterly' */; period? /* "Q1 2025" */ }
```

### meeting.ts
```ts
type MeetingType='investor_call'|'board_meeting'|'esg_briefing'|'roadshow'|'one_on_one'|(string&{});
type MeetingPlatform='zoom'|'teams'|'google_meet'|'in_person'|(string&{});
type MeetingStatus='scheduled'|'cancelled'|'completed'|(string&{});
interface Meeting { id; user_id; title; meeting_date /*YYYY-MM-DD*/; meeting_time /*HH:mm:ss*/;
  meeting_type; platform; participants:string[]; agenda; link_or_location?; status;
  created_at; updated_at }
```

### register.ts
```ts
interface StepOneState { full_name; email; password; confirmPassword }
interface StepTwoState { companyName; sector_id; jurisdiction }
interface RegisterRequest { email; password; full_name; role?; company_id? }
```

---

## 13. Design system (`src/index.css`)

CSS custom properties on `:root`, consumed by hand-written component classes used across the app (alongside inline styles).

### Color tokens
| Token / hex | Use |
|------|-----|
| `#4040C8` (`--accent`) | Primary indigo: buttons, active states, accents |
| `#3333A8` (`--accent2`) | Primary hover |
| `#F5F5FF` / `#EEEEFF` | Light accent backgrounds, selected chips |
| `#3535B5` (`--sb`) | Sidebar / hero gradients |
| `#F2F3FA` (`--background`) | Content background |
| `#1A1D2E` (`--foreground`) | Primary text |
| `#5A6080` (`--t2`) | Secondary text / labels |
| `#9BA3C4` (`--t3`) | Tertiary / placeholder |
| `#E2E4F0` (`--bdr`) | Borders |
| `#22C55E` / `#16A34A` | Success / green (FOUND, Done) |
| `#F59E0B` / `#F5C842` | Warning / amber (PARTIAL) |
| `#EF4444` / `#DC2626` | Error / red (NOT_DISCLOSED) |
| Pillars | E `#16A34A`, S `#0891B2`/teal, G `#7C3AED`/purple |

Radius default `10px`; cards `14–16px`. Shadows: subtle `0 2px 8px rgba(64,64,200,.07)`, medium `0 6px 24px rgba(64,64,200,.1)`, large `0 10px 40px rgba(64,64,200,.14)`.

### Fonts
`'Plus Jakarta Sans'` (400–800) for UI; `'DM Mono'` for numbers/codes.

### Key component classes
- Layout/containers: `.app-shell`, `.main`, `.content`, `.card`, `.ch` (card header), `.ct` (card title), `.cb` (card body).
- Buttons: `.btn`, `.bp` (primary indigo), `.bs` (secondary), `.bsm` (small).
- Badges: `.badge` + `.b-or/.b-gn/.b-am/.b-rd/.b-pp/.b-bl/.b-tl/.b-gy`.
- Tabs: `.tabs`, `.tab`, `.tab.act`.
- Inputs: `.inp`, `.sel` (select w/ arrow), `.fl-label` (uppercase label), `.fl`.
- Sidebar: `.sb-item`, `.sb-item.act`, `.sb-badge.*`, `.sb-lname`/`.sb-lsub` (logo).
- Pipeline UI: `.proc-ring` (spinner), `.proc-step`/`.act`/`.done`, `.proc-dot`, `.proc-txt`, `.proc-ck`.
- Domain cards: `.esg-rpt-card`, `.doc-card`, `.q-card`, `.person-card`, `.pillar-cards` + `.pc.e/.s/.g`, `.ph-hero` (profile/hero).
- Upload & chips: `.upload-z` (dashed dropzone), `.fw-chip` / `.fw-chip.sel` (framework & area selectors).
- Chat: `.chat-area`, `.chat-msgs`, `.msg`/`.msg.u`/`.msg.ai`, `.msg-bub`, `.md-bub`, `.bot-fab` (+ pulse).
- Skeletons: `.skel` (light), `.skel-dark` (on dark bg).
- Keyframes: `spin`, `dpulse`, `bpulse`, `shimmer`, `pdot`.

### shadcn/ui
`src/components/ui/*` holds 40+ Radix-based primitives (Dialog, Select, Tabs, Tooltip, Table, etc.), styled via `cn()` (`clsx` + `tailwind-merge`). Tailwind dark mode is `class`-based; theme colors are HSL CSS vars. Note: most *app* screens use the custom classes/inline styles above rather than these primitives.

---

## 14. Cross-cutting conventions

- **Where to add a backend call**: always in `src/lib/api.ts` (a namespaced function), then call it from a page/component. Don't `fetch` directly elsewhere.
- **Async generation**: anything that uploads files for processing returns a `PipelineHandle`; hand it to `/reports/processing` via `ProcessingPageState` and let `usePipelinePoll` drive the UI.
- **company_id** comes from `useAuth().user?.company_id`.
- **Router state handoffs**: ESGModal → ReportsPage (`pendingGenerate`); ReportsPage/QuarterlyForm → ProcessingPage (`ProcessingPageState`); ProcessingPage → ReportDetailPage (`{ coverage }`).
- **localStorage keys**: `centriton_token`, `centriton_user`, `centriton_active_pipeline`.
- **Race-safety**: form submit handlers use an incrementing `genRequestIdRef` so stale responses are ignored.
- **Equal-width card grids**: use `repeat(N,minmax(0,1fr))` (not `1fr 1fr 1fr`) so wide content can't unbalance columns.

---

## 15. Run it locally

```bash
npm install
# set VITE_API_URL in .env.local (defaults to http://localhost:8000)
npm run dev      # http://localhost:8080
npm run build    # production build to dist/
npm run lint
npm test
```

Log in (or register) so `company_id` is populated, then use Reports → ESG or Quarterly to exercise the full generate → poll → coverage flow.
