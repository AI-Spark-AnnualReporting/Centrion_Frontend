# Plan: Authentication — User Registration

Source spec: `.claude/specs/registration.md`
Style reference: `.claude/plans/login.md`
Depends on: login plan already implemented (`AuthContext`, `ProtectedRoute`, `src/types/auth.ts`, `/login` route, typed `auth.register` helper, `.env.local` with `VITE_API_URL`).

---

## Context

Registration is the second half of auth. Login is already wired to FastAPI via the spec-named helpers in `src/lib/api.ts`. The existing `SignupPage` in `src/components/auth/AuthPages.tsx` is still running the original Lovable mock — it sets local state for `firstName`, `lastName`, `company`, `email`, `password` and `handleSignup` just calls `navigate('/dashboard')`. No API call. This plan wires it to `POST /api/v1/auth/register`, updates the field set to match the spec, adds validation/error/success states, and exposes the page at `/register`.

Backend assumed running at `http://localhost:8000` via `VITE_API_URL`.

---

## 0. Pre-flight findings & reconciliation (spec ↔ current code)

| Area | Spec | Current | Decision |
| --- | --- | --- | --- |
| Registration component | Create `src/pages/RegisterPage.tsx` if missing; otherwise modify in place | `SignupPage` exists in `src/components/auth/AuthPages.tsx` (lines 153–203), fully mocked | **Modify in place** per spec § Pre-flight rule 3. Do NOT create `RegisterPage.tsx`. |
| Route | `/register` public | Router has `/signup` → `SignupPage`; no `/register` | Add `/register` → same `SignupPage` component; keep `/signup` as alias so existing links don’t break. Both outside `<ProtectedRoute>`. |
| API helper | New top-level `register()` using raw `fetch` + `res.text()`, mapped error messages | `src/lib/api.ts` already has a typed `auth.register<T>(params)` using `request<T>()` client | Add the **new top-level `register()`** next to the other spec-named helpers (`login`, `logout`, `fetchWithAuth`, …). Leave `auth.register` untouched — one-line comment documents the duplication. |
| Field set | full_name, email, password, confirmPassword | firstName, lastName, company, email, password | Replace field set. Single name input. No role selector (role defaults server-side). |
| Types | `src/types/register.ts` with `UserRole`, `RegisterRequest`, `RegisterFormState` | File does not exist | Create per spec § "TypeScript interfaces". |
| LoginPage link | Must link to `/register` | `AuthPages.tsx` LoginPage line 146: `navigate('/signup')` | One-char change: `/signup` → `/register`. No other LoginPage edits. |
| Env | Uses `VITE_API_URL` | Already in `.env.local` | No change. |

---

## 1. File map

### Create
| Path | Purpose |
| --- | --- |
| `src/types/register.ts` | `UserRole`, `RegisterRequest`, `RegisterFormState` |

### Modify
| Path | Change |
| --- | --- |
| `src/lib/api.ts` | Append top-level `register()` (raw fetch, `res.text()`, 422 → `detail[0].msg`, other non-200 → generic, network/fetch throw → connection error). Import `RegisterRequest`. Touch nothing else. |
| `src/components/auth/AuthPages.tsx` | Rework `SignupPage`: new state, new field set (Full Name / Email / Password / Confirm Password), show/hide eye icon on both password inputs (mirrors `LoginPage`), `handleSubmit` with spec validation sequence, success banner + 2s redirect, error display below submit. Flip `LoginPage`'s link target from `/signup` to `/register` (one line). |
| `src/App.tsx` | Add `<Route path="/register" element={<SignupPage />} />` next to `/signup`. Both public. |

### Leave unchanged
- `src/types/auth.ts`
- `src/context/AuthContext.tsx`
- `src/components/ProtectedRoute.tsx`
- `LoginPage` body (except the one-line link change)
- All pages under `<ProtectedRoute>`
- `vite.config.ts`, `.env.local`, Topbar logout button

---

## 2. Step-by-step implementation

### Step 1 — `src/types/register.ts` (new)
Exactly the spec shape:
```ts
export type UserRole = 'admin' | 'department_user';

export interface RegisterRequest {
  email: string;
  password: string;
  full_name: string;
  role?: UserRole;
}

export interface RegisterFormState {
  full_name: string;
  email: string;
  password: string;
  confirmPassword: string;
  role?: UserRole;
}
```
`confirmPassword` is frontend-only — never sent to the API.

### Step 2 — `src/lib/api.ts` — add top-level `register()`

Top of file, beside the existing auth-types import:
```ts
import type { RegisterRequest } from "@/types/register";
```

Append to the spec-named helpers block (after `fetchWithAuth`, before the `api` barrel):
```ts
// Spec-named register() — raw fetch + res.text() per .claude/specs/registration.md.
// The typed auth.register() namespace method is retained for other callers.
export async function register(params: RegisterRequest): Promise<string> {
  const query = new URLSearchParams({
    email: params.email,
    password: params.password,
    full_name: params.full_name,
    ...(params.role ? { role: params.role } : {}),
  });

  let res: Response;
  try {
    res = await fetch(
      `${API_BASE_URL}/api/v1/auth/register?${query.toString()}`,
      { method: "POST", headers: { accept: "application/json" } },
    );
  } catch {
    throw new Error("Unable to connect. Check your connection.");
  }

  if (res.ok) return res.text();

  if (res.status === 422) {
    const err = (await res.json().catch(() => null)) as
      | { detail?: Array<{ msg?: string }> }
      | null;
    throw new Error(err?.detail?.[0]?.msg ?? "Validation error");
  }

  throw new Error("Registration failed. Please try again.");
}
```
Notes:
- `API_BASE_URL` already lives at the top of the file and resolves from `VITE_API_URL`.
- `URLSearchParams` handles URL-encoding for email/password specials.
- Network-error branch satisfies the spec's "Network error or fetch throws without message" row.
- Do not modify `auth.register`, `request<T>()`, or the `api` barrel.

### Step 3 — `src/components/auth/AuthPages.tsx` — rework `SignupPage`

**Imports (add to existing top imports):**
```ts
import { register } from '@/lib/api';
```

**Replace `SignupPage` state (lines 155–159) with:**
```ts
const [full_name, setFullName] = useState('');
const [email, setEmail] = useState('');
const [password, setPassword] = useState('');
const [confirmPassword, setConfirmPassword] = useState('');
const [showPassword, setShowPassword] = useState(false);
const [showConfirm, setShowConfirm] = useState(false);
const [error, setError] = useState<string | null>(null);
const [success, setSuccess] = useState(false);
const [submitting, setSubmitting] = useState(false);
```

**Replace `handleSignup` (lines 161–163) with:**
```ts
const handleSubmit = async () => {
  if (submitting || success) return;
  setError(null);
  setSuccess(false);

  if (!full_name || !email || !password || !confirmPassword) {
    setError('All fields are required'); return;
  }
  if (!email.includes('@')) {
    setError('Please enter a valid email address'); return;
  }
  if (password.length < 8) {
    setError('Password must be at least 8 characters'); return;
  }
  if (password !== confirmPassword) {
    setError('Passwords do not match'); return;
  }

  setSubmitting(true);
  try {
    await register({ email, password, full_name });
    setSuccess(true);
    setTimeout(() => navigate('/login'), 2000);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
  } finally {
    setSubmitting(false);
  }
};

const handleKeyDown = (e: React.KeyboardEvent) => {
  if (e.key === 'Enter') void handleSubmit();
};
```

**JSX inside the `.auth-r` panel — replace the existing `<h2>…</h2>` through `<button>Create Account</button>` block with:**

```jsx
<h2>Create account</h2>
<p>Start your 14-day free trial</p>

{success && (
  <div style={{ fontSize: '11px', color: '#30A46C', marginBottom: '8px' }} role="status">
    Account created! Redirecting to login…
  </div>
)}

<div className="fl">
  <label>Full name</label>
  <input
    type="text"
    className="inp"
    placeholder="e.g. Ahsan Bilal"
    value={full_name}
    onChange={(e) => setFullName(e.target.value)}
  />
</div>

<div className="fl">
  <label>Email address</label>
  <input
    type="email"
    className="inp"
    placeholder="you@centriton.com"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
  />
</div>

<div className="fl">
  <label>Password</label>
  <div style={{ position: 'relative' }}>
    <input
      type={showPassword ? 'text' : 'password'}
      className="inp"
      placeholder="Min. 8 characters"
      value={password}
      onChange={(e) => setPassword(e.target.value)}
      onKeyDown={handleKeyDown}
      style={{ paddingRight: 36 }}
    />
    {/* Same eye-icon button used in LoginPage — copy the block verbatim,
        bound to showPassword/setShowPassword. */}
  </div>
</div>

<div className="fl">
  <label>Confirm password</label>
  <div style={{ position: 'relative' }}>
    <input
      type={showConfirm ? 'text' : 'password'}
      className="inp"
      placeholder="Repeat your password"
      value={confirmPassword}
      onChange={(e) => setConfirmPassword(e.target.value)}
      onKeyDown={handleKeyDown}
      style={{ paddingRight: 36 }}
    />
    {/* Same eye-icon button bound to showConfirm/setShowConfirm. */}
  </div>
</div>

<button className="btn-auth" onClick={handleSubmit} disabled={submitting || success}>
  {submitting ? 'Creating account…' : 'Create Account'}
</button>

{error && (
  <div style={{ fontSize: '11px', color: '#E5484D', marginTop: '8px' }} role="alert">
    {error}
  </div>
)}
```

Footer link stays as `Already have an account? <a onClick={() => navigate('/login')}>Sign in</a>` — already correct from prior work.

**Also in `LoginPage` (same file, currently line 146):**
```diff
- <div className="auth-sw">No account? <a onClick={() => navigate('/signup')}>Create one</a></div>
+ <div className="auth-sw">No account? <a onClick={() => navigate('/register')}>Create one</a></div>
```

### Step 4 — `src/App.tsx`
Add `/register` route next to `/signup`, both public:
```tsx
<Route path="/login" element={<LoginPage />} />
<Route path="/register" element={<SignupPage />} />
<Route path="/signup" element={<SignupPage />} />
```
No other routing changes. `<ProtectedRoute>` wrapping untouched.

---

## 3. Error-message mapping (1-to-1 with spec § "Error message mapping")

| Scenario | Wiring | Where |
| --- | --- | --- |
| Any required field empty | `setError('All fields are required')` | `handleSubmit` guard 1 |
| Invalid email format | `setError('Please enter a valid email address')` | guard 2 |
| Password < 8 chars | `setError('Password must be at least 8 characters')` | guard 3 |
| Passwords do not match | `setError('Passwords do not match')` | guard 4 |
| API 422 | `throw new Error(err.detail?.[0]?.msg ?? 'Validation error')` | `register()` |
| API non-200 / non-422 | `throw new Error('Registration failed. Please try again.')` | `register()` |
| Network / fetch throws | `try { fetch(...) } catch { throw new Error('Unable to connect. Check your connection.') }` | `register()` |

All thrown `Error` values flow into the component's `catch (err)` block → `setError(err.message)`. One funnel, deterministic text.

---

## 4. Definition-of-Done mapping (1-to-1 with spec § "Definition of done")

| DoD item | How we verify |
| --- | --- |
| Claude states found-vs-created | Implementation turn will say: "Existing `SignupPage` found in `AuthPages.tsx` — modified in place." |
| `npm run dev` without TS/build errors | Running dev server already green; verify after edits. |
| `tsc --noEmit` passes | `npx tsc -p tsconfig.app.json --noEmit`. |
| `/register` renders form with 4 fields | Manual visit. |
| Visually matches `LoginPage.tsx` | Reuses `auth`, `auth-card`, `auth-l/r`, `fl`, `inp`, `btn-auth`, `auth-sw` classes + identical eye-icon SVG block. |
| POST with 4 query params in Network tab | DevTools — URL contains `email=…&password=…&full_name=…` (role omitted → server default). |
| Success → 2s redirect to `/login` | `setSuccess(true)` + `setTimeout(…, 2000)`. |
| Empty-field error, no API call | Guards return before `setSubmitting(true)`. |
| Mismatched-password error, no API call | Guard 4. |
| Password < 8 error, no API call | Guard 3. |
| Already-registered email → API error shown | Non-422 branch throws `"Registration failed. Please try again."`; 422 surfaces `detail[0].msg`. |
| LoginPage link to `/register` | Line 146 updated. |
| `/register` accessible logged-out | Route outside `<ProtectedRoute>`. |
| `register()` sole caller | Component imports `register` from `@/lib/api`; no inline `fetch`. |
| No login/logout regression | Only additive edits; AuthContext / ProtectedRoute / typed `auth.register` untouched. |

---

## 5. Risks & edge cases

1. **Double-submit during redirect window.** Mitigated by `disabled={submitting || success}` on the button and `if (submitting || success) return` guard at the top of `handleSubmit`. Without disabling on `success`, a fast user could fire a second POST before `navigate('/login')` runs.
2. **Unmount before `setTimeout` fires.** Low severity — `navigate()` on unmount is a no-op under React Router v6. Add a `useRef` + cleanup only if a lint rule complains; otherwise skip.
3. **`/signup` alias drift.** Keeping both routes means the component remains single-source. If the team later wants one canonical URL, follow-up can swap `/signup` for a `<Navigate to="/register" replace />` — out of scope here.
4. **`auth.register` duplication.** Two registration paths now live in `api.ts`. The one-line comment on the new `register()` keeps future devs from "cleaning up" by deleting one.
5. **Password manager compatibility.** `type="password"` ↔ `type="text"` toggle preserves autofill.
6. **Accessibility.** `role="status"` for success, `role="alert"` for error mirror LoginPage's pattern. Eye-icon buttons carry `aria-label` matching the login version.
7. **Spec’s `res.text()` quirk.** FastAPI will JSON-encode a plain string return to `"User registered successfully"` (with quotes). `res.text()` returns the raw body including quotes. This is what the spec explicitly asks for; downstream code ignores the body value so the quoting is cosmetic. Noted so nobody "fixes" it to `res.json()` later.

---

## 6. Execution order

1. `src/types/register.ts` (no deps).
2. `src/lib/api.ts` — add import + `register()`. Don't touch existing exports.
3. `src/App.tsx` — add `/register` route.
4. `src/components/auth/AuthPages.tsx` — rework `SignupPage`; flip `LoginPage` link target.
5. `npx tsc -p tsconfig.app.json --noEmit` → expect clean.
6. Manual browser walk through the DoD table (requires backend on `:8000`).
7. Commit: `feat(auth): wire registration page to FastAPI register endpoint`.

---

## 7. Out of scope

- Role selector on the form (spec forbids; role defaults server-side).
- Auto-login after registration (spec redirects to `/login`; no token returned).
- Email verification / confirmation step.
- Password-strength meter beyond the 8-char minimum.
- Forgot-password flow; Microsoft SSO for signup.
- Redirect `/signup` → `/register` via `<Navigate>` (left as alias instead).
- Refactoring / deduplicating `auth.register` vs top-level `register()`.
- Component tests (no test harness exists to extend).

---

### Critical files
- `D:\Centrion_Frontend\Centrion_Frontend\src\components\auth\AuthPages.tsx`
- `D:\Centrion_Frontend\Centrion_Frontend\src\lib\api.ts`
- `D:\Centrion_Frontend\Centrion_Frontend\src\types\register.ts` (new)
- `D:\Centrion_Frontend\Centrion_Frontend\src\App.tsx`
- `D:\Centrion_Frontend\Centrion_Frontend\.claude\specs\registration.md`
