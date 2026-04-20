# Plan: Multi-Step Registration — User Details + Company Setup

Source spec: `.claude/specs/2step_register.md`
Style reference: `.claude/plans/registration.md`, `.claude/plans/login.md`
Depends on: login plan already implemented; single-step registration plan already implemented (`SignupPage` wired, `/register` route live, top-level `register()` helper in `src/lib/api.ts`, typed `companies.create` / `lookups.sectors` namespaces already in `api.ts`).

---

## Context

Registration is today a single-step form that hits `POST /api/v1/auth/register` and leaves the new user without any company. The platform needs every user to belong to a company, so we're splitting signup into two steps:

1. **Personal details** (full name, email, password, confirm password) — frontend validation only, no network calls.
2. **Company setup** (company name, sector from live API, jurisdiction) — on submit, sequentially call `POST /api/v1/companies/` then `POST /api/v1/auth/register` with the new `company_id`.

After a successful Step 2 the user is redirected to `/login` with a state flag that surfaces a one-line "Account created successfully. Please sign in." banner. The banner self-dismisses on typing.

Backend assumed running at `http://localhost:8000` (via `VITE_API_URL`). Spec guarantees JWT was removed from `GET /api/v1/lookups/sectors` and `POST /api/v1/companies/`, and that `company_id` is now accepted by `POST /api/v1/auth/register`.

---

## 0. Pre-flight findings & reconciliation (spec ↔ current code)

Found existing registration UI at `src/components/auth/AuthPages.tsx` — exports `SignupPage` used by both `/register` and `/signup` routes. Per spec § Pre-flight rule 3: **modify in place**. Do NOT create `src/pages/RegisterPage.tsx`.

| Area | Spec | Current | Decision |
| --- | --- | --- | --- |
| Registration component | Create `src/pages/RegisterPage.tsx` if missing | `SignupPage` in `AuthPages.tsx` lines 153–339, wired to single-step `register()` | **Rewrite `SignupPage` in place** as a two-step orchestrator. Don't create a new page file. |
| Step child components | `src/components/registration/StepIndicator.tsx`, `StepOneForm.tsx`, `StepTwoForm.tsx` | None exist | Create all three per spec. |
| Types — register | `src/types/register.ts` with `StepOneState`, `StepTwoState`, `RegisterRequest` (now accepts `company_id`), `RegisterResponse` | Current file has `UserRole`, `RegisterRequest` (no `company_id`), `RegisterFormState` | **Replace** current file contents. Verified `UserRole` / `RegisterFormState` are imported nowhere else in `src/`. |
| Types — company | `src/types/company.ts` with `Sector`, `SectorsResponse`, `CreateCompanyRequest`, `CompanyRecord`, `CreateCompanyResponse` | Does not exist | Create new file per spec. |
| `register()` helper | Must hardcode `role='admin'`, accept optional `company_id`, parse response as `res.text()` + `JSON.parse()` fallback, return `RegisterResponse` | Current `register()` returns `Promise<string>`, caller passes role, no `company_id` support | **Rewrite** the existing top-level `register()` in `src/lib/api.ts`. Only caller is `SignupPage` (verified via grep) — safe to change signature. |
| `createCompany()` helper | New top-level in `api.ts`, raw fetch, UUID `sector_id` | Typed `companies.create` namespace method exists (uses `request<T>()`) | **Add** the spec-named top-level `createCompany()` next to `register()`. Leave `companies.create` untouched — one-line comment documents the duplication. |
| `getSectors()` helper | New top-level in `api.ts`, unwraps `response.sectors` | Typed `lookups.sectors` namespace method exists | **Add** the spec-named top-level `getSectors()`. Leave `lookups.sectors` untouched. |
| Route | `/register` public | Already present (`/register` and `/signup` alias, both → `SignupPage`, both outside `<ProtectedRoute>`) | No change. |
| LoginPage banner | Show `"Account created successfully. Please sign in."` when `location.state.registered === true`; dismiss on typing | LoginPage has no banner, no `useLocation` import | Add minimal banner + dismissal per spec. |

**`role` hardcoding note.** Last turn we added a transitional `role: 'admin'` on the caller side. The spec now moves this into `register()` itself. Remove the caller-side argument to avoid two sources of truth.

---

## 1. File map

### Create
| Path | Purpose |
| --- | --- |
| `src/types/company.ts` | `Sector`, `SectorsResponse`, `CreateCompanyRequest`, `CompanyRecord`, `CreateCompanyResponse` |
| `src/components/registration/StepIndicator.tsx` | Two-circle progress indicator with connector line |
| `src/components/registration/StepOneForm.tsx` | Personal details form (controlled inputs, validation callback) |
| `src/components/registration/StepTwoForm.tsx` | Company form (name, sector select, jurisdiction select, Back + Create Account) |

### Modify
| Path | Change |
| --- | --- |
| `src/types/register.ts` | Replace contents: `StepOneState`, `StepTwoState`, `RegisterRequest` (with optional `company_id`), `RegisterResponse`. Remove `UserRole` and `RegisterFormState`. |
| `src/lib/api.ts` | Replace top-level `register()` per spec (hardcodes `role='admin'`, accepts `company_id`, `res.text()` → `JSON.parse` fallback). Add top-level `getSectors()` and `createCompany()`. Import new types. Leave typed namespaces untouched. |
| `src/components/auth/AuthPages.tsx` | Rewrite `SignupPage` as a two-step orchestrator: sectors fetch on mount, `step` state, `stepOne` / `stepTwo` state, back-preserves values, sequential API calls, 2 s success → `navigate('/login', { state: { registered: true } })`. Remove `await register({ email, password, full_name, role: 'admin' })` caller-side role override. `LoginPage` gets `useLocation`, `showRegisteredBanner` state, success banner above form, dismiss on typing. |

### Leave unchanged
- `src/types/auth.ts`
- `src/context/AuthContext.tsx`
- `src/components/ProtectedRoute.tsx`
- `src/App.tsx` (routes already correct)
- `src/lib/api.ts` typed namespaces (`auth`, `companies`, `lookups`, etc.), `fetchWithAuth`, `login`, `logout`
- `vite.config.ts`, `.env.local`, Topbar/Sidebar logout buttons

---

## 2. Step-by-step implementation

### Step 1 — `src/types/company.ts` (new)

Exact shape from spec:
```ts
export interface Sector {
  id: string;
  code: string;
  name: string;
}

export interface SectorsResponse {
  sectors: Sector[];
  total: number;
}

export interface CreateCompanyRequest {
  name: string;
  sector_id: string;
  jurisdiction?: string;
}

export interface CompanyRecord {
  id: string;
  name: string;
  jurisdiction: string | null;
  operating_mode: string;
  fiscal_year_end_month: number;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  sector_id: string;
}

export interface CreateCompanyResponse {
  company: CompanyRecord;
}
```

### Step 2 — `src/types/register.ts` (replace contents)

Drop `UserRole` / `RegisterFormState` (confirmed unused elsewhere). Replace with:
```ts
export interface StepOneState {
  full_name: string;
  email: string;
  password: string;
  confirmPassword: string; // frontend-only
}

export interface StepTwoState {
  companyName: string;
  sector_id: string;  // UUID string; empty = not selected
  jurisdiction: string; // default "KSA"
}

export interface RegisterRequest {
  email: string;
  password: string;
  full_name: string;
  role?: string;
  company_id?: string;
}

export interface RegisterResponse {
  message: string;
  user_id?: string;
  email?: string;
  full_name?: string;
  role?: string;
  company_id?: string | null;
}
```

### Step 3 — `src/lib/api.ts` updates

At top, replace the register-type import and add company types:
```ts
import type { RegisterRequest, RegisterResponse } from "@/types/register";
import type {
  CreateCompanyRequest,
  CreateCompanyResponse,
  Sector,
  SectorsResponse,
} from "@/types/company";
```

Replace the existing top-level `register()` function wholesale:
```ts
// Spec-named register() — raw fetch with res.text() + JSON.parse fallback.
// Role is always "admin" per .claude/specs/2step_register.md — never sourced from callers.
export async function register(
  params: RegisterRequest,
): Promise<RegisterResponse> {
  const query = new URLSearchParams({
    email: params.email,
    password: params.password,
    full_name: params.full_name,
    role: "admin",
  });
  if (params.company_id) query.append("company_id", params.company_id);

  let res: Response;
  try {
    res = await fetch(
      `${API_BASE_URL}/api/v1/auth/register?${query.toString()}`,
      { method: "POST", headers: { accept: "application/json" } },
    );
  } catch {
    throw new Error("Unable to connect. Check your connection.");
  }

  if (res.ok) {
    const text = await res.text();
    try {
      return JSON.parse(text) as RegisterResponse;
    } catch {
      return { message: text };
    }
  }

  if (res.status === 422) {
    const err = (await res.json().catch(() => null)) as
      | { detail?: Array<{ msg?: string }> }
      | null;
    throw new Error(err?.detail?.[0]?.msg ?? "Validation error");
  }

  throw new Error("Registration failed. Please try again.");
}
```

Append `getSectors()` and `createCompany()` next to `register()` (both raw fetch, both spec-named):
```ts
// Spec-named getSectors() — raw fetch. The typed lookups.sectors() namespace is retained.
export async function getSectors(): Promise<Sector[]> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/v1/lookups/sectors`, {
      headers: { accept: "application/json" },
    });
  } catch {
    throw new Error("Unable to connect. Check your connection.");
  }
  if (!res.ok) throw new Error("Failed to load sectors");
  const data = (await res.json()) as SectorsResponse;
  return data.sectors;
}

// Spec-named createCompany() — raw fetch. The typed companies.create() namespace is retained.
export async function createCompany(
  params: CreateCompanyRequest,
): Promise<CreateCompanyResponse> {
  const query = new URLSearchParams({
    name: params.name,
    sector_id: params.sector_id,
  });
  if (params.jurisdiction) query.append("jurisdiction", params.jurisdiction);

  let res: Response;
  try {
    res = await fetch(
      `${API_BASE_URL}/api/v1/companies/?${query.toString()}`,
      { method: "POST", headers: { accept: "application/json" } },
    );
  } catch {
    throw new Error("Unable to connect. Check your connection.");
  }

  if (res.ok) return (await res.json()) as CreateCompanyResponse;

  if (res.status === 422) {
    const err = (await res.json().catch(() => null)) as
      | { detail?: Array<{ msg?: string }> }
      | null;
    throw new Error(err?.detail?.[0]?.msg ?? "Validation error");
  }

  const text = await res.text().catch(() => "");
  throw new Error(text || "Failed to create company. Please try again.");
}
```

Leave `request<T>()`, `auth.*`, `companies.*`, `lookups.*`, and the `api` barrel untouched.

### Step 4 — `src/components/registration/StepIndicator.tsx` (new)

```tsx
interface StepIndicatorProps { currentStep: 1 | 2; }
```
Layout: two circles with labels ("Your Details" / "Company Setup") and a connector line. Use existing project style tokens only — inline styles are fine (LoginPage/SignupPage already use inline styles; no new CSS classes needed).

- **Circle 1:** filled accent `#4040C8` with white "1" when `currentStep === 1`; same accent with white check-SVG when `currentStep === 2`.
- **Circle 2:** when `currentStep === 2`: filled accent with white "2". When `currentStep === 1`: white background, muted border `#E5E7EF`, muted text `#8A90A8`.
- **Connector:** 2 px horizontal line between the circles, half accent / half muted when `currentStep === 1`, full accent when `currentStep === 2`.
- **Labels:** 10 px below each circle, `#5A6080`, `font-size: 11px`.
- Wrap the whole thing in a `div` with `display: flex; align-items: center; gap: 10px; margin-bottom: 18px`.

Colour tokens reused from LoginPage inline styles — no new variables introduced.

### Step 5 — `src/components/registration/StepOneForm.tsx` (new)

Props:
```ts
interface StepOneFormProps {
  initialValues: StepOneState;
  onSubmit: (data: StepOneState) => void;
  error: string;
}
```
Controlled inputs initialised from `initialValues`; each `onChange` updates local state only — parent learns values on submit.

Fields in this order, all using `.fl` / `.inp` classes already established by LoginPage:
1. Full Name (`text`) — placeholder `"e.g. Ahsan Bilal"`
2. Email Address (`email`) — placeholder `"you@centriton.com"`
3. Password (`password`) — placeholder `"Min. 8 characters"`, with show/hide eye toggle (reuse LoginPage's eye SVG block)
4. Confirm Password (`password`) — placeholder `"Repeat your password"`, with its own show/hide eye toggle

Below the last field: error shown via the exact LoginPage pattern
```jsx
{error && <div style={{ fontSize: '11px', color: '#E5484D', marginTop: '8px' }} role="alert">{error}</div>}
```

Submit button: `className="btn-auth"`, label `"Continue →"`, never disabled, calls `onSubmit(formData)`.

Below submit: `<div className="auth-sw">Already have an account? <Link to="/login">Sign in</Link></div>` — **must be `Link` from `react-router-dom`** per spec. Add import.

### Step 6 — `src/components/registration/StepTwoForm.tsx` (new)

Props:
```ts
interface StepTwoFormProps {
  initialValues: StepTwoState;
  sectors: Sector[];
  sectorsLoading: boolean;
  onSubmit: (data: StepTwoState) => void;
  onBack: () => void;
  error: string;
  loading: boolean;
}
```

Controlled inputs:
1. **Company Name** — `input.inp`, placeholder `"e.g. Al-Noor Capital"`.
2. **Sector** — `<select className="inp">` bound to `sector_id`.
   - While `sectorsLoading`: single `<option disabled selected>Loading sectors…</option>`.
   - When loaded: first `<option value="" disabled>Select a sector</option>` then `sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)`. Value is the UUID `s.id`.
3. **Jurisdiction** — `<select className="inp">`, default `"KSA"`, options: `KSA`, `UAE`, `Bahrain`, `Kuwait`, `Oman`, `Qatar`, `Other`.

Error display below jurisdiction field, same pattern as StepOneForm.

Two-button row (flex, `gap: 10px`):
- **Back** — secondary style (transparent bg, `#5A6080` text, `1px solid #E5E7EF`, border-radius `8px`). Always enabled. Calls `onBack()`. Label `"← Back"`.
- **Create Account** — `className="btn-auth"`, disabled while `loading`, label `"Creating account…"` with an inline spinner SVG when `loading`, otherwise `"Create Account"`. Flex-grows to fill the rest.

### Step 7 — Rewrite `SignupPage` in `src/components/auth/AuthPages.tsx`

State:
```ts
const [step, setStep] = useState<1 | 2>(1);
const [stepOne, setStepOne] = useState<StepOneState>({ full_name: '', email: '', password: '', confirmPassword: '' });
const [stepTwo, setStepTwo] = useState<StepTwoState>({ companyName: '', sector_id: '', jurisdiction: 'KSA' });
const [sectors, setSectors] = useState<Sector[]>([]);
const [sectorsLoading, setSectorsLoading] = useState(true);
const [error, setError] = useState('');
const [loading, setLoading] = useState(false);
const [success, setSuccess] = useState(false);
```

Effects / handlers:

```ts
useEffect(() => {
  getSectors()
    .then(setSectors)
    .catch(() => setSectors([]))
    .finally(() => setSectorsLoading(false));
}, []);

function handleStepOneSubmit(data: StepOneState) {
  setError('');
  if (!data.full_name.trim() || !data.email.trim() || !data.password || !data.confirmPassword) {
    setError('All fields are required'); return;
  }
  if (!data.email.includes('@')) { setError('Please enter a valid email address'); return; }
  if (data.password.length < 8) { setError('Password must be at least 8 characters'); return; }
  if (data.password !== data.confirmPassword) { setError('Passwords do not match'); return; }
  setStepOne(data);
  setStep(2);
}

async function handleStepTwoSubmit(data: StepTwoState) {
  setError('');
  if (!data.companyName.trim()) { setError('Company name is required'); return; }
  if (!data.sector_id) { setError('Please select a sector'); return; }
  setStepTwo(data);

  setLoading(true);
  try {
    const companyRes = await createCompany({
      name: data.companyName,
      sector_id: data.sector_id,
      jurisdiction: data.jurisdiction || undefined,
    });
    const companyId = companyRes.company.id;

    await register({
      email: stepOne.email,
      password: stepOne.password,
      full_name: stepOne.full_name,
      company_id: companyId,
    });

    setSuccess(true);
    setTimeout(() => navigate('/login', { state: { registered: true } }), 2000);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
  } finally {
    setLoading(false);
  }
}

function handleBack() {
  setError('');
  setStep(1);
}
```

JSX (inside the existing `.auth` / `.auth-card` / `.auth-l` branding block — keep Left panel verbatim). The right panel `.auth-r` becomes:
```tsx
<div className="auth-r">
  <StepIndicator currentStep={step} />
  <h2>{step === 1 ? 'Your Details' : 'Company Setup'}</h2>
  <p>{step === 1 ? 'Step 1 of 2 — Personal information' : 'Step 2 of 2 — Your organisation'}</p>

  {success && (
    <div style={{ fontSize: '11px', color: '#30A46C', marginBottom: '8px' }} role="status">
      Account created! Setting up your workspace…
    </div>
  )}

  {step === 1 ? (
    <StepOneForm initialValues={stepOne} onSubmit={handleStepOneSubmit} error={error} />
  ) : (
    <StepTwoForm
      initialValues={stepTwo}
      sectors={sectors}
      sectorsLoading={sectorsLoading}
      onSubmit={handleStepTwoSubmit}
      onBack={handleBack}
      error={error}
      loading={loading}
    />
  )}
</div>
```

Remove the `rememberMe` / `MicrosoftLogo` / `showPassword` / `showConfirm` / `submitting` signup-only state (now lives inside `StepOneForm`), and remove all previous signup JSX.

### Step 8 — LoginPage banner additions

In `AuthPages.tsx` `LoginPage` function:

Add imports at top:
```ts
import { useLocation } from 'react-router-dom';
```

Add state at top of `LoginPage`:
```ts
const location = useLocation();
const [showRegisteredBanner, setShowRegisteredBanner] = useState<boolean>(
  (location.state as { registered?: boolean } | null)?.registered === true,
);
```

Above the Email input row, add:
```tsx
{showRegisteredBanner && (
  <div style={{ fontSize: '11px', color: '#30A46C', marginBottom: '10px' }} role="status">
    Account created successfully. Please sign in.
  </div>
)}
```

Wire dismissal — in the Email and Password `onChange` handlers, also call `setShowRegisteredBanner(false)`:
```ts
onChange={(e) => { setEmail(e.target.value); if (showRegisteredBanner) setShowRegisteredBanner(false); }}
```
Same for the password `onChange`. No other LoginPage changes.

### Step 9 — No routing changes

`/register` (primary) and `/signup` (alias) already exist, both public, both → `SignupPage`. Verified after previous work.

---

## 3. Error-message mapping (1-to-1 with spec § "Error message mapping")

| Scenario | Source | Where |
| --- | --- | --- |
| Step 1 — any required field empty | `setError('All fields are required')` | `handleStepOneSubmit` guard 1 |
| Step 1 — invalid email format | `setError('Please enter a valid email address')` | guard 2 |
| Step 1 — password < 8 | `setError('Password must be at least 8 characters')` | guard 3 |
| Step 1 — passwords do not match | `setError('Passwords do not match')` | guard 4 |
| Step 2 — company name empty | `setError('Company name is required')` | `handleStepTwoSubmit` guard 1 |
| Step 2 — no sector selected | `setError('Please select a sector')` | guard 2 |
| companies 422 | `throw detail?.[0]?.msg ?? 'Validation error'` | `createCompany()` |
| companies non-200 | `throw text || 'Failed to create company. Please try again.'` | `createCompany()` |
| register 422 | `throw detail?.[0]?.msg ?? 'Validation error'` | `register()` |
| register non-200 | `throw 'Registration failed. Please try again.'` | `register()` |
| Network / fetch throws | `throw 'Unable to connect. Check your connection.'` | both `register` & `createCompany` `try/catch(fetch)` branches |

All `Error.message` values are captured by the orchestrator's single `catch` and pushed through `setError(err.message)`.

---

## 4. Definition-of-Done mapping (1-to-1 with spec § "Definition of done")

| DoD item | How we verify |
| --- | --- |
| Found-vs-created report | Implementation turn will say: "Existing `SignupPage` in `AuthPages.tsx` — modified in place; no `src/pages/RegisterPage.tsx` created." |
| `npm run dev` zero errors | Run; check console + type-check. |
| `tsc --noEmit` zero errors | `npx tsc -p tsconfig.app.json --noEmit`. |
| `/register` shows Step 1 + indicator | Manual visit. |
| Step 1 Continue with valid data → Step 2, zero network | DevTools Network panel empty; `step` flips to 2. |
| Step 2 loads with sectors populated | `useEffect` kicked off on mount; by the time Step 2 renders the fetch has either resolved or is still loading (sector dropdown handles both). |
| Option values are UUIDs | Inspect `<option value="…">` in DOM. |
| Back preserves Step 1 values | `setStep(1)` without resetting `stepOne`; `StepOneForm` initial values refilled. |
| Companies then Register in order | Sequential `await` in `handleStepTwoSubmit`. |
| `sector_id` is UUID in companies call | Query string built from `data.sector_id` (the `<option>` value). |
| `company_id` in register matches `company.id` | `companyId = companyRes.company.id`. |
| `role=admin` present | Hardcoded in `register()`. |
| Success banner on `/register` | `setSuccess(true)`. |
| 2 s redirect to `/login` | `setTimeout(…, 2000)`. |
| `/login` shows success banner after redirect | `navigate('/login', { state: { registered: true } })` + `useLocation()` on LoginPage. |
| Banner dismisses on typing | `onChange` in email/password fields sets banner false. |
| Companies fail → no register call | Thrown error skips the register `await`. |
| Step 1 empty field → error, no network | Guards return before setting step. |
| Step 2 no sector → `"Please select a sector"`, no network | Guard returns. |
| Submit disabled + loading indicator | `StepTwoForm` sets `disabled={loading}` and swaps label. |
| No login/logout regression | No edits to AuthContext, ProtectedRoute, Topbar, Sidebar. |

---

## 5. Risks & edge cases

1. **Stale `stepTwo` on Back then Continue.** Because `StepTwoForm` is remounted (only rendered when `step === 2`), its internal controlled-input state is seeded from `initialValues` each time. We persist `stepTwo` via `setStepTwo(data)` at the top of `handleStepTwoSubmit` so a submit-then-back-then-forward flow keeps user edits. Step 1 values are preserved identically via `setStepOne(data)` before advancing.
2. **Double-submit.** Both `loading` (Step 2 button disabled) and `success` gate the flow; set `success` before `setLoading(false)` so the 2 s redirect can't start a second submit. Consider `disabled={loading || success}` on Step 2 button — add as spec hedge.
3. **Unmount during `setTimeout`.** React Router v6 no-ops on unmount. Fine. Don't over-engineer a cleanup unless lint flags it.
4. **Sectors fetch fails.** We catch and set `sectors=[]`; Step 2 shows "Select a sector" with no options. User can't proceed (`sector_id` empty → validation fails). The error isn't surfaced as a banner — intentionally silent per spec (no UX copy given). Consider surfacing a tiny inline hint under the dropdown in a follow-up — out of scope here.
5. **`res.text()` then `JSON.parse()` quirk.** FastAPI wraps a plain-string return as `"message"` (with quotes). `JSON.parse('"message"')` yields the string `"message"`, which is NOT a `RegisterResponse` shape. Guard: `typeof parsed === 'object' ? parsed : { message: parsed }` — or accept that `RegisterResponse.message` may end up as the whole plain string. The orchestrator doesn't use any field off the response other than not-throwing, so this is cosmetic. The plan's implementation uses `JSON.parse` success → return as-is; if you hit the string-wrap case, tighten to the guard above. Low priority.
6. **Duplicated API helpers.** Keeping typed namespace versions (`companies.create`, `lookups.sectors`) alongside spec-named top-level versions. Each has a one-line comment pointing at the spec so no one "cleans up" one by deleting the other.
7. **Banner re-appears on browser back.** If the user navigates away from `/login` and then presses Back, `location.state.registered` may still be true in the history entry. Dismissal via `onChange` handles the typical typing flow; if a pure "visit with no typing" matters, clear `location.state` via `navigate(location.pathname, { replace: true, state: {} })` inside a `useEffect`. Low priority, not in spec DoD.
8. **`Link` vs `<a onClick>`.** Spec requires React Router `<Link to="/login">` for the Step 1 footer. Keep this change scoped to `StepOneForm`; other `auth-sw` anchors in LoginPage/SignupPage can stay as-is (spec doesn't ask to change them).

---

## 6. Execution order

1. `src/types/company.ts` (new).
2. `src/types/register.ts` — replace contents.
3. `src/lib/api.ts` — imports, replace `register()`, add `getSectors()` + `createCompany()`.
4. `src/components/registration/StepIndicator.tsx`.
5. `src/components/registration/StepOneForm.tsx`.
6. `src/components/registration/StepTwoForm.tsx`.
7. `src/components/auth/AuthPages.tsx` — rewrite `SignupPage`; add banner logic to `LoginPage`.
8. `npx tsc -p tsconfig.app.json --noEmit` — expect clean.
9. Manual browser walk through DoD (needs backend on `:8000` with spec's endpoint changes applied).
10. Commit: `feat(auth): two-step registration with company creation`.

---

## 7. Out of scope

- Remember the last used sector/jurisdiction across sessions.
- Client-side password-strength meter beyond the 8-char minimum.
- Back-navigation hardening (clearing `location.state` on /login).
- Retry UI for failed sectors fetch (silent fallback to empty list).
- Auto-login after Step 2 success (spec redirects to `/login`).
- Role selector (always `admin` per spec).
- Component tests (no harness to extend).
- Dedup of `register` / `createCompany` / `getSectors` vs their typed-namespace counterparts.

---

### Critical files
- `D:\Centrion_Frontend\Centrion_Frontend\src\components\auth\AuthPages.tsx`
- `D:\Centrion_Frontend\Centrion_Frontend\src\lib\api.ts`
- `D:\Centrion_Frontend\Centrion_Frontend\src\types\register.ts`
- `D:\Centrion_Frontend\Centrion_Frontend\src\types\company.ts` (new)
- `D:\Centrion_Frontend\Centrion_Frontend\src\components\registration\StepIndicator.tsx` (new)
- `D:\Centrion_Frontend\Centrion_Frontend\src\components\registration\StepOneForm.tsx` (new)
- `D:\Centrion_Frontend\Centrion_Frontend\src\components\registration\StepTwoForm.tsx` (new)
- `D:\Centrion_Frontend\Centrion_Frontend\.claude\specs\2step_register.md`
