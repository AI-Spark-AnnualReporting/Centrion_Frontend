Perfect. Now I have everything I need. Here's your spec:

---

# Spec: Authentication — Login & Logout
## Overview
This feature implements JWT-based authentication for the Centriyon Investor Portal. It wires the existing Lovable-generated login UI to the real FastAPI backend at `POST /api/v1/auth/login`, stores the returned JWT token and user object in memory via an `AuthContext`, protects all dashboard routes behind a `ProtectedRoute` guard, and implements logout by clearing stored credentials and redirecting to `/login`. After this step the app can distinguish authenticated users from guests, which is a prerequisite for all ESG data features.

## Depends on
- Lovable-generated project is exported and running locally (`npm run dev`)
- FastAPI backend running locally at `http://localhost:8000`
- React Router is already configured in the Lovable project

## API Contract
**Endpoint:** `POST /api/v1/auth/login`

**Request:** Query parameters (not JSON body, not form data)
```
email    string   required
password string   required
```

**Success response `200`:**
```json
{
  "access_token": "<jwt_string>",
  "token_type": "bearer",
  "user": {
    "user_id": "usr_ac332d5304b4",
    "email": "test@centriton.com",
    "full_name": "Ahsan Bilal",
    "role": "admin"
  }
}
```

**Validation error `422`:** returned when email or password query param is missing entirely

**Auth failure:** returns non-200 status when credentials are wrong

All subsequent authenticated requests must include the header:
```
Authorization: Bearer <access_token>
```

## Files to create
- `src/lib/api.ts` — base fetch wrapper, login function, logout helper, token accessors
- `src/context/AuthContext.tsx` — global auth state, login/logout actions, user object
- `src/components/ProtectedRoute.tsx` — redirects unauthenticated users to `/login`
- `src/types/auth.ts` — TypeScript interfaces for the API response and user object

## Files to modify
- `src/main.tsx` or `src/App.tsx` — wrap root with `AuthProvider`, confirm login route is public, confirm all other routes use `ProtectedRoute`
- Existing `LoginPage.tsx` (or equivalent Lovable component) — replace mock submit handler with real `useAuth().login()` call, add error state display

## Files to leave unchanged
- All page components other than `LoginPage.tsx`
- All Lovable-generated UI components and styles
- `vite.config.ts` — proxy not needed because the endpoint already has `access-control-allow-origin: *`

## TypeScript interfaces
Define these in `src/types/auth.ts`:
```ts
export interface LoginResponse {
  access_token: string;
  token_type: 'bearer';
  user: AuthUser;
}

export interface AuthUser {
  user_id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'user';
}

export interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
}
```

## Implementation rules
- Credentials are sent as **query parameters**, not JSON body, not FormData — the curl confirms this
- Token stored in `localStorage` under the key `centriton_token`
- User object stored in `localStorage` under the key `centriton_user` as JSON string
- On app load, `AuthContext` must rehydrate both from `localStorage` before rendering routes — prevents logout on page refresh
- `fetchWithAuth()` in `api.ts` must attach `Authorization: Bearer <token>` header to every request — all future API calls use this wrapper, never raw `fetch`
- If any `fetchWithAuth()` call receives a `401` response, call `logout()` and redirect to `/login` — handles token expiry automatically
- `logout()` must call `localStorage.removeItem` for both keys then set `user` and `token` state to `null`
- Failed login must show a user-visible error message — do not log to console only
- Error message must be generic: `"Invalid email or password"` — do not reveal which field was wrong
- Do not create a new router — use whichever router Lovable already set up
- Do not modify any Lovable component except `LoginPage.tsx`
- Do not add any new UI libraries or auth libraries (no NextAuth, no Auth0, no Clerk)
- Use `import.meta.env.VITE_API_URL` as the base URL with fallback to `'http://localhost:8000'`

## `src/lib/api.ts` — required exports
```ts
login(email: string, password: string): Promise<LoginResponse>
logout(): void
getToken(): string | null
getStoredUser(): AuthUser | null
isAuthenticated(): boolean
fetchWithAuth(path: string, options?: RequestInit): Promise<Response>
```

## `src/context/AuthContext.tsx` — required shape
```ts
interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): void;
}
```
- `loading` is `true` only during the initial rehydration check on mount
- `login()` throws on failure so the `LoginPage` can catch and display the error

## `src/components/ProtectedRoute.tsx` — required behaviour
- While `loading` is `true` render a neutral loading state (spinner or blank) — never flash the login page
- If `user` is `null` after loading, redirect to `/login` using React Router `<Navigate replace />`
- Otherwise render `{children}` unchanged

## `LoginPage.tsx` changes only
- Find the existing form submit handler
- Replace it with `async` function calling `useAuth().login(email, password)`
- Wrap in try/catch — on catch set a local `error` string state
- Render the error string below the submit button using existing Lovable error/alert styles — do not add new CSS
- On success `navigate('/')` — React Router `useNavigate`
- Do not change any other part of the login page layout, styling or copy

## Environment variable
Create `.env.local` in the project root:
```
VITE_API_URL=http://localhost:8000
```
Add `.env.local` to `.gitignore` if not already present.

## Definition of done
- [ ] `npm run dev` starts without TypeScript errors
- [ ] Visiting `/` while unauthenticated redirects to `/login`
- [ ] Submitting the login form with `test@centriton.com` / `Test1234` stores the token in `localStorage` under `centriton_token` and redirects to `/`
- [ ] After login `useAuth().user.full_name` returns `"Ahsan Bilal"`
- [ ] Submitting with wrong password shows `"Invalid email or password"` on the login page
- [ ] Hard refreshing the browser while logged in stays on the dashboard — does not redirect to `/login`
- [ ] Clicking logout clears `localStorage` and redirects to `/login`
- [ ] Every file in `src/` compiles with `tsc --noEmit` — zero type errors
- [ ] No fetch call anywhere in the codebase uses raw `fetch` for authenticated requests — all go through `fetchWithAuth`