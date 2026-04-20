# Plan: Authentication — Login & Logout

Source spec: `.claude/specs/login.md`
Target branch: `main` (clean)
Backend assumed running at `http://localhost:8000`

---

## 0. Reconciliation notes (spec ↔ current code)

The spec was written against a greenfield Lovable export, but this repo has already diverged:

1. **`src/lib/api.ts` already exists** as a typed OpenAPI-wide client (namespaces: `auth`, `companies`, `reports`, …). It uses:
   - localStorage key `centriton.auth_token`
   - env var `VITE_API_BASE_URL` (default `""` — Vite proxy)
   - `auth.login({ email, password })` params-object signature
   - typed `request<T>()` helper (returns parsed JSON, not `Response`)

   The spec wants: localStorage key `centriton_token`, env `VITE_API_URL`, positional `login(email, password)`, and a `fetchWithAuth()` that returns a raw `Response`.

   **Decision:** keep the typed client but bring it in line with the spec’s contract. This means **one** storage key, **one** env var, plus the spec-named helpers (`login`, `logout`, `getToken`, `getStoredUser`, `isAuthenticated`, `fetchWithAuth`) exported alongside the existing namespaces. The existing `auth.login(params)` / `getAuthToken` / `setAuthToken` stay as thin wrappers so nothing else we add later breaks.

   Chosen canonical values:
   - localStorage token key: **`centriton_token`** (per spec)
   - localStorage user key: **`centriton_user`** (per spec)
   - env var: **`VITE_API_URL`** (per spec), fallback `http://localhost:8000`

2. **`App.tsx` routing is inverted vs the spec.** Today `/` is the login page and dashboard lives at `/dashboard`. The spec’s DoD says "Visiting `/` while unauthenticated redirects to `/login`" and "on success `navigate('/')`" — so `/` must become the authenticated home and `/login` must be the public entry.

   **Decision:** restructure routes. `/login` → `LoginPage`, `/signup` stays public, everything under `<AppLayout />` moves behind `<ProtectedRoute>` and the default `/` route renders the dashboard.

3. **`vite.config.ts` proxy** is already wired (`/api` → `http://localhost:8000`). The spec says the proxy isn’t needed because the endpoint sends `access-control-allow-origin: *`. **Decision:** leave the proxy as-is — it’s harmless, helps for endpoints that may not have CORS, and is already documented.

4. **Existing `LoginPage`** is in `src/components/auth/AuthPages.tsx` (co-located with `SignupPage`). The spec asks to modify "`LoginPage.tsx`" — we’ll edit the `LoginPage` export in `AuthPages.tsx` only. `SignupPage` stays on its mock handler (out of scope).

---

## 1. File map

### Create
| Path | Purpose |
| --- | --- |
| `src/types/auth.ts` | `LoginResponse`, `AuthUser`, `AuthState` interfaces |
| `src/context/AuthContext.tsx` | `AuthProvider` + `useAuth()` hook |
| `src/components/ProtectedRoute.tsx` | Route guard |
| `.env.local` | `VITE_API_URL=http://localhost:8000` |

### Modify
| Path | Change |
| --- | --- |
| `src/lib/api.ts` | Add spec-named exports (`login`, `logout`, `getToken`, `getStoredUser`, `isAuthenticated`, `fetchWithAuth`); switch storage keys to `centriton_token` / `centriton_user`; switch env var to `VITE_API_URL`; keep existing typed client intact |
| `src/App.tsx` | Make `/login` public; wrap protected tree with `<ProtectedRoute>`; move dashboard to `/` |
| `src/main.tsx` | Wrap `<App />` with `<AuthProvider>` |
| `src/components/auth/AuthPages.tsx` | `LoginPage` only: replace mock `handleLogin` with `useAuth().login`; show generic error on failure; `navigate('/')` on success |
| `.gitignore` | Ensure `.env.local` is ignored |

### Leave unchanged
- `SignupPage` in `AuthPages.tsx`
- All UI/layout components and CSS
- `vite.config.ts`
- Every page component other than `AuthPages.tsx`

---

## 2. Step-by-step implementation

### Step 1 — `src/types/auth.ts`
Create exactly what the spec dictates:
```ts
export interface AuthUser {
  user_id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'user';
}

export interface LoginResponse {
  access_token: string;
  token_type: 'bearer';
  user: AuthUser;
}

export interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
}
```

### Step 2 — Update `src/lib/api.ts`
- Change base URL resolution:
  ```ts
  const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(/\/+$/, "");
  ```
- Replace token storage constant with `centriton_token`. Add `USER_STORAGE_KEY = "centriton_user"`.
- Add spec-named exports (positional args, raw-response where required):
  ```ts
  export async function login(email: string, password: string): Promise<LoginResponse> {
    const res = await auth.login<LoginResponse>({ email, password });
    setAuthToken(res.access_token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(res.user));
    return res;
  }

  export function logout(): void {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  }

  export function getToken(): string | null { return getAuthToken(); }

  export function getStoredUser(): AuthUser | null {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw) as AuthUser; } catch { return null; }
  }

  export function isAuthenticated(): boolean {
    return getToken() !== null && getStoredUser() !== null;
  }

  export async function fetchWithAuth(path: string, options: RequestInit = {}): Promise<Response> {
    const token = getToken();
    const headers = new Headers(options.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
    if (res.status === 401) {
      logout();
      if (typeof window !== "undefined") window.location.assign("/login");
    }
    return res;
  }
  ```
- Keep the existing `request<T>()` helper, typed namespaces (`companies`, `reports`, …), and `ApiError` — they stay useful. Their auth-header code already pulls from `getAuthToken()`, so switching the key flows through automatically.
- Keep the `Authorization` header injection inside `request<T>()` — it already does what `fetchWithAuth` does for the typed path, so existing typed callers also get the bearer token.

**Important:** the spec says "no fetch call … uses raw `fetch` for authenticated requests." The typed `request<T>()` is our equivalent of `fetchWithAuth` for JSON endpoints — document this at the top of the file so future devs don’t reintroduce raw `fetch`.

### Step 3 — `src/context/AuthContext.tsx`
```tsx
interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): void;
}
```
Behaviour:
- On mount, read `getToken()` + `getStoredUser()` synchronously into state, then set `loading = false`. Use `useState` initializer so the first render already has the rehydrated value — `loading` is only briefly `true` to match the spec’s contract, or can be derived as `useState(() => false)` once we set initial state from storage. Using `loading=true` initially and flipping it in a `useLayoutEffect` keeps the contract clean and matches the spec wording.
- `login(email, password)`: calls `apiLogin(email, password)` (from `api.ts`), sets `user` + `token` state on success, rethrows on failure so `LoginPage` can catch.
- `logout()`: calls `apiLogout()`, clears state. Leave route change to the caller (`ProtectedRoute` / `LoginPage`).
- `useAuth()` hook throws if used outside provider.

### Step 4 — `src/components/ProtectedRoute.tsx`
```tsx
export function ProtectedRoute({ children }: { children?: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-6 text-[#5A6080]">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children ?? <Outlet />}</>;
}
```
- Uses `Outlet` so it can wrap the `<AppLayout />` route element without children, matching the current layout-route pattern.
- Neutral loading state — plain div, no flash of login UI.

### Step 5 — Update `src/App.tsx`
```tsx
<BrowserRouter>
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/signup" element={<SignupPage />} />
    <Route element={<ProtectedRoute />}>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="reports" element={<ReportsPage />} />
        {/* …rest of nested routes… */}
      </Route>
    </Route>
    <Route path="*" element={<NotFound />} />
  </Routes>
</BrowserRouter>
```
- `index` route means `/` resolves to the dashboard once authenticated.
- Keeping `/dashboard` as an alias avoids breaking existing sidebar links.

### Step 6 — `src/main.tsx`
```tsx
createRoot(document.getElementById("root")!).render(
  <AuthProvider>
    <App />
  </AuthProvider>
);
```

### Step 7 — `AuthPages.tsx` → `LoginPage` edits
Only the LoginPage export changes:
- Add `const { login } = useAuth();` and `const [error, setError] = useState<string | null>(null);` + `const [submitting, setSubmitting] = useState(false);`.
- Replace `handleLogin`:
  ```ts
  const handleLogin = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/');
    } catch {
      setError('Invalid email or password');
    } finally {
      setSubmitting(false);
    }
  };
  ```
- Disable the submit button while `submitting`.
- Render the error message **above or below** the submit button using existing utility classes only (e.g. `<div className="text-[11px] text-red-500 mt-2">{error}</div>`). No new CSS files.
- Do **not** touch: Microsoft SSO button, remember-me checkbox, layout, logo marks, copy.

### Step 8 — `.env.local` + `.gitignore`
- Create `.env.local` with `VITE_API_URL=http://localhost:8000`.
- Confirm `.gitignore` lists `.env.local` (Vite templates usually ship this; add the line if missing).

### Step 9 — Add a logout surface
The spec DoD says "Clicking logout clears `localStorage` and redirects to `/login`." There’s no existing logout button. Pick the **smallest visible surface**:
- `src/components/layout/Topbar.tsx` — add a simple `Logout` button/link in the existing layout; on click: `logout(); navigate('/login')`.
- Keep the styling consistent with surrounding topbar elements; no new CSS.

This is the only UI addition outside `LoginPage` the plan allows, and it’s required to satisfy the DoD.

---

## 3. Validation checklist (maps 1-to-1 to spec’s Definition of Done)

| DoD item | How we verify |
| --- | --- |
| `npm run dev` starts without TS errors | `npx tsc -p tsconfig.app.json --noEmit` returns clean |
| Visiting `/` while unauthenticated redirects to `/login` | Manual: fresh incognito window → hits `/login` |
| Login with `test@centriton.com` / `Test1234` stores `centriton_token`, redirects to `/` | Manual: DevTools → Application → Local Storage |
| `useAuth().user.full_name === "Ahsan Bilal"` | Quick debug log from any protected page |
| Wrong password shows `"Invalid email or password"` | Manual, using a garbage password |
| Hard refresh while logged in stays on dashboard | Manual: F5 on `/` with token in storage |
| Logout clears localStorage + redirects to `/login` | Manual: click Topbar logout |
| `tsc --noEmit` passes across `src/` | CI command identical to step 1 |
| No raw `fetch` used for authed requests | Grep: `rg "\\bfetch\\(" src --glob '!**/api.ts'` returns zero hits for authed paths |

---

## 4. Risks & edge cases

1. **Stale `centriton.auth_token` key in localStorage.** Anyone who ran the app before this change will have the old key and will appear unauthenticated after the switch. Fine for dev, but worth calling out in the commit message.
2. **Token expiry mid-session.** `fetchWithAuth` triggers `logout` + redirect on `401`. The typed `request<T>()` helper should do the same — plan: fold the 401 branch into `request<T>()` so typed callers behave identically.
3. **Refresh flicker.** `loading = true` on mount then `false` on effect could flash "Loading…" briefly. Mitigated by initializing state synchronously from `localStorage` in the `useState` initializer so the first render already sees the real auth state; `loading` stays `true` for a single render only to satisfy the spec’s contract.
4. **`index` route vs existing sidebar links.** Sidebar links currently point to `/dashboard`, `/reports`, etc. — these still work because we keep both `/` and `/dashboard` mapped to `DashboardPage`. Confirm no sidebar component hard-codes the `/` login path.
5. **`/` used as login target somewhere.** `SignupPage` has `onClick={() => navigate('/')}` → "Sign in". After the route swap that would land on the dashboard for logged-in users, but redirect to `/login` for guests (which is the intended behaviour). Update the signup copy/link to `navigate('/login')` to keep it correct even if the user is briefly authed.

---

## 5. Execution order (how to actually do the work)

1. `src/types/auth.ts` (no deps).
2. `src/lib/api.ts` updates — keys, env var, spec-named exports.
3. `src/context/AuthContext.tsx`.
4. `src/components/ProtectedRoute.tsx`.
5. `src/main.tsx` — wrap in `AuthProvider`.
6. `src/App.tsx` — restructure routes.
7. `AuthPages.tsx` — LoginPage edits; flip SignupPage link target to `/login`.
8. `Topbar.tsx` — logout button.
9. `.env.local` + `.gitignore` check.
10. Run `npx tsc -p tsconfig.app.json --noEmit`.
11. Manual walk through the DoD checklist in the browser.
12. Commit: `feat(auth): wire login/logout to FastAPI with JWT + protected routes`.

---

## 6. Out of scope (do not do in this PR)

- Signup endpoint wiring — spec is login/logout only.
- Refresh-token / silent re-auth.
- Role-based route gating (admin vs user) — the `role` field is captured on `AuthUser` but not yet enforced.
- Microsoft SSO button behaviour — stays as a no-op placeholder.
- Any change to page components other than `AuthPages.tsx` (and the minimal Topbar logout button required for DoD).
