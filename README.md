# Centriyon — Investor Portal (Frontend)

Institutional-grade ESG & Investor-Relations platform for SAMA / CMA / Tadawul-regulated companies in Saudi Arabia and the wider GCC. This repo is the React/Vite frontend that talks to the FastAPI backend.

---

## Tech stack

- **Build**: [Vite 5](https://vitejs.dev/) + `@vitejs/plugin-react-swc`
- **Language**: TypeScript 5
- **UI**: React 18, Tailwind CSS, hand-rolled CSS, [shadcn/ui](https://ui.shadcn.com/) primitives (Radix), [lucide-react](https://lucide.dev/) icons
- **Routing**: react-router-dom v6
- **State / data**: React state + context (`AuthContext`) — TanStack Query is installed but not wired in (yet)
- **Forms**: react-hook-form + zod
- **Charts**: Recharts + inline SVG
- **Markdown**: react-markdown + remark-gfm (used by IR Copilot)
- **Tests**: Vitest + Testing Library

---

## Quick start

```bash
# 1. Install
npm install

# 2. Configure backend
cp .env.local .env.local        # already in the repo; edit if needed
# VITE_API_URL=http://localhost:8000   ← local FastAPI
# VITE_API_URL=https://<ngrok>.ngrok-free.dev
# VITE_API_URL=https://centrion-backend-...azurewebsites.net

# 3. Run
npm run dev          # http://localhost:8080
```

### Other scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server on `:8080` (HMR, env-driven proxy) |
| `npm run build` | Production build → `dist/` |
| `npm run build:dev` | Build with `--mode development` (sourcemaps, no minify) |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint |
| `npm run test` | Run Vitest once |
| `npm run test:watch` | Vitest in watch mode |

---

## Backend integration

`VITE_API_URL` in `.env.local` is the single source of truth for the backend URL. It's read in two places:

- **Runtime** — `src/lib/api.ts` builds every request URL from it.
- **Dev proxy** — `vite.config.ts` proxies `/api/*` to the same target so cookies / streaming work without CORS quirks.

Vite only reads `.env.local` on boot, so restart `npm run dev` after editing it.

### Tunnels (ngrok / Cloudflare)

`vite.config.ts` whitelists `*.ngrok-free.dev`, `*.ngrok-free.app`, `*.ngrok.io`, and `*.trycloudflare.com` under `server.allowedHosts` so you can expose the local dev server through any of them. Every authenticated request also sends `ngrok-skip-browser-warning: true` so ngrok's free-tier interstitial doesn't intercept JSON responses.

### Auth

JWT in `localStorage` (`centriton_token`). `src/context/AuthContext.tsx` rehydrates synchronously on first render so authenticated routes don't flash the login screen. A 401 from any authenticated request triggers `handleUnauthorized()` and bounces the user to `/login`.

Users created via the admin "Add Person" flow (`POST /companies/{id}/team`) come back with `must_change_password: true`. `ProtectedRoute` pins them on `/change-password` until they call `POST /auth/change-password`.

---

## Project layout

```
src/
├── App.tsx                       # Route table
├── pages/
│   ├── DashboardPage.tsx         # /dashboard — Command Center
│   ├── ReportsPage.tsx           # /reports — generate + browse reports
│   ├── ReportDetailPage.tsx      # /reports/:id
│   ├── ProcessingPage.tsx        # /reports/processing — async pipeline
│   ├── KPIPage.tsx               # /kpi — KPI Normalizer
│   ├── AIPage.tsx                # /ai — IR Copilot streaming chat
│   ├── MeetingsPage.tsx          # /meetings
│   ├── StakeholdersPage.tsx      # /stakeholders — Leadership
│   ├── DocsPage.tsx              # /docs — Document Bank
│   ├── QuestionsPage.tsx         # /questions — Question Bank
│   ├── ProfilePage.tsx           # /profile
│   └── OtherPages.tsx            # Compliance / Comms placeholders
├── components/
│   ├── auth/                     # LoginPage, SignupPage, ChangePasswordPage
│   ├── dashboard/                # DashboardESG, DashboardBoard
│   ├── layout/                   # AppLayout, Sidebar, Topbar
│   ├── reports/                  # ReportDetailView, AgentTimeline, GeneratingScreen
│   ├── shared/                   # ESGModal, FloatingChatbot
│   ├── registration/             # 2-step signup forms
│   └── ui/                       # shadcn/ui primitives
├── context/
│   └── AuthContext.tsx           # JWT, login/logout, changePassword, refreshUser
├── lib/
│   └── api.ts                    # Typed fetch client + every API namespace
├── types/                        # auth.ts, company.ts, lookups.ts, report.ts, …
└── index.css                     # Hand-rolled design tokens + components
```

### `src/lib/api.ts`

One file, one source of truth for the backend contract. Each endpoint group is a flat namespace:

```ts
import { auth, companies, documents, team, reports, chat,
         meetings, esg, compliance, lookups, agents, agentRuns } from "@/lib/api";
```

Highlights:

- `request<T>(path, opts)` is the typed JSON helper used by every namespace.
- `fetchWithAuth(path, init)` is for raw `Response` access (used for SSE streams and 204-only DELETEs).
- `postPipeline()` normalises the `202 Accepted` / `409 Conflict` async-pipeline contract into a `PipelineHandle`.

---

## Key features

### Dashboard / Command Center (`/dashboard`)

- **Hero card** — score ring + ENV/SOC/GOV pill scores from the latest *created* report (sorted by `generated_at` desc). Period badge is prominent so the year is unmissable.
- **3 pillar cards** — per-pillar found / missing / coverage% + top 6 indicators with formatted values. FOUND first, NOT_DISCLOSED last.
- **Framework Catalogue** — straight render of `GET /api/v1/lookups/scopes`. Universal standards in brand purple, regional regulators in teal, bar length proportional to indicator count.
- **Critical Gaps — Sector Materiality** — uses `coverage.critical_gaps` from the latest report, sorted critical-then-high. Shows a clear "no sector picked" empty state instead of a misleading green "all covered" pill when the report wasn't tagged with a sector.
- **Coverage by Report** — vertical bar chart of every report's `coverage.percentage` in chronological order, plus the average across all reports.

### Reports (`/reports`)

- Generate new ESG report or read from an existing one.
- Global scope = single-select GRI/IFRS radios. Regional scope = country/regulator dropdowns + multi-select regulator chips.
- GRI Indicator Scope (Standard / Full) appears whenever GRI is in scope.
- Async pipeline handoff — POST `/reports/{id}/generate` returns `202` with a `PipelineHandle`. Routes to `/reports/processing` which polls per-agent nodes and renders the `AgentTimeline`.

### IR Copilot (`/ai`)

Multi-turn streaming chat backed by `/api/v1/chat/*` (server-stateful conversation history).

- Hydrates from `GET /chat/session` on mount.
- Sends new turns via `POST /chat/` (SSE). Tokens stream into the active assistant bubble; `tool_start` / `tool_end` events render as live pills above the message.
- Markdown rendering (headings, lists, tables, code blocks, inline `code`, `**bold**`) via react-markdown + remark-gfm.
- Edit pencil on any user message rewinds the local UI; Stop button aborts a stream mid-flight; Clear chat soft-archives the conversation server-side.

### Leadership (`/stakeholders`)

- Three tabs: Board Members / Investors / Management. Backed by the seven-value `position_type` enum on `POST /companies/{id}/team`.
- Add Person modal generates a CSPRNG temp password client-side, posts it, and surfaces it back to the admin in a copyable banner. Backend forces password rotation on first login.
- Organisation field is locked to the signed-in user's `company_name` — every person captured here belongs to that company by definition.

### Forced password rotation (`/change-password`)

Lives outside `AppLayout` (no sidebar / topbar / chatbot) so the user can't navigate away mid-flow. Three fields with shared eye toggle, inline 401 / 422 mapping, "Sign out" escape hatch.

### KPI Normalizer (`/kpi`), Document Bank (`/docs`), Question Bank (`/questions`), Board & Meetings (`/meetings`), Profile (`/profile`)

All wired to their respective `/api/v1/...` endpoints. See `src/lib/api.ts` for the contract per namespace.

---

## Routing

```
/login                 → LoginPage
/register · /signup    → SignupPage (2-step)
[ProtectedRoute]
  /change-password     → ChangePasswordPage   (no sidebar)
  [AppLayout]
    /                  → DashboardPage
    /dashboard         → DashboardPage
    /reports           → ReportsPage
    /reports/processing → ProcessingPage
    /reports/:id       → ReportDetailPage
    /kpi               → KPIPage
    /ai                → AIPage
    /meetings          → MeetingsPage
    /stakeholders      → StakeholdersPage      (Leadership)
    /docs              → DocsPage
    /questions         → QuestionsPage
    /profile           → ProfilePage
    /comms             → CommsPage             (placeholder)
    /compliance        → CompliancePage        (placeholder)
*                      → NotFound
```

---

## Conventions

- **Single API client.** Never hit `fetch()` directly for authenticated endpoints — use `request<T>()` or `fetchWithAuth()` from `@/lib/api`. Both attach the bearer token and trigger logout on 401.
- **Path aliases.** `@/...` resolves to `src/...` (configured in `vite.config.ts` and `tsconfig.json`). Use it instead of relative `../../../` chains.
- **No new files unless needed.** Most pages live in a single `.tsx`. Extract components when a single page exceeds ~600 lines or when a piece is reused.
- **Comments explain WHY, not WHAT.** Identifiers should already say what; reserve comments for non-obvious constraints, hidden invariants, and workarounds.
- **Type checking is the gate.** `npx tsc --noEmit` should pass before every commit. Don't suppress with `any`.

---

## Deploying

The `staging` branch is the working integration branch. PRs from feature branches → `staging`, then `staging` → `main` for production cuts.

`.env.production` stays pinned to the Azure backend so Vercel builds always point at it. `.env.local` is for local development only and is git-ignored.

---

## Useful links

- Backend repo (FastAPI) — separate
- Live preview — Vercel
- Issue tracker — GitHub Issues
