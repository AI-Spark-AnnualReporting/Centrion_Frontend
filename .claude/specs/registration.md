# Spec: Authentication — User Registration

## Overview
This feature implements user registration for the Centriyon Investor Portal. It first checks whether a registration/signup page already exists in the Lovable-generated project. If one exists it wires it to the real FastAPI backend. If one does not exist it creates a new `RegisterPage.tsx` from scratch that visually matches the existing `LoginPage.tsx` — same layout, same design tokens, same component library — then wires it to the backend. It submits new user details to `POST /api/v1/auth/register` as query parameters, handles success by redirecting to `/login` with a brief success message, and handles all validation and API errors inline on the form. After this step new users can create accounts independently.

## Depends on
- Spec: Login & Logout must be fully complete — `AuthContext`, `api.ts`, `ProtectedRoute`, and `src/types/auth.ts` must already exist
- FastAPI backend running locally at `http://localhost:8000`
- `VITE_API_URL` already set in `.env.local`

## API Contract
**Endpoint:** `POST /api/v1/auth/register`

**Request:** Query parameters — not JSON body, not FormData
```
email       string   required
password    string   required
full_name   string   required
role        string   optional — defaults to "department_user" if omitted
```

**Success response `200`:**
```json
"string"
```
The response body is a plain string message such as `"User registered successfully"`. It is not a JSON object. Must be parsed with `res.text()` — never `res.json()`.

**Validation error `422`:** returned when any required query param is missing — FastAPI returns the standard detail array

**Conflict or business error:** any non-200 non-422 status means email already registered or other server rejection

## Pre-flight check — Claude must do this first
Before writing any code, Claude must:
1. Search the project for any file whose name contains `Register`, `Signup`, `SignUp`, or `CreateAccount` (case-insensitive) in `src/pages/`, `src/views/`, `src/app/`, or `src/screens/`
2. Search `App.tsx` and any router config file for routes containing `/register`, `/signup`, or `/create-account`
3. If a registration page **is found** — modify that file only, do not create a new one
4. If a registration page **is not found** — create `src/pages/RegisterPage.tsx` from scratch and add its route to the router

## Files to create (only if no registration page exists)
- `src/pages/RegisterPage.tsx` — full registration page matching the style of `LoginPage.tsx`
- `src/types/register.ts` — TypeScript interfaces for the registration form and API call

## Files to modify
- `src/lib/api.ts` — add `register()` as a new named export
- `src/App.tsx` or router config — add `/register` public route if it does not exist, add link from `/login` to `/register` if it does not exist
- Existing registration page (if found in pre-flight check) — replace mock handler with real API call

## Files to leave unchanged
- `src/context/AuthContext.tsx`
- `src/components/ProtectedRoute.tsx`
- `src/types/auth.ts`
- `src/pages/LoginPage.tsx` — except to add a "Create account" link to `/register` if one does not already exist
- All other page components

## TypeScript interfaces
Define in `src/types/register.ts`:
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

## `src/lib/api.ts` — add this function only, touch nothing else
```ts
export async function register(params: RegisterRequest): Promise<string> {
  const query = new URLSearchParams({
    email: params.email,
    password: params.password,
    full_name: params.full_name,
    ...(params.role ? { role: params.role } : {}),
  });

  const res = await fetch(
    `${BASE_URL}/api/v1/auth/register?${query.toString()}`,
    { method: 'POST', headers: { accept: 'application/json' } }
  );

  if (res.ok) return res.text();

  if (res.status === 422) {
    const err = await res.json();
    throw new Error(err.detail?.[0]?.msg ?? 'Validation error');
  }

  throw new Error('Registration failed. Please try again.');
}
```

## If creating `RegisterPage.tsx` from scratch
Claude must open `LoginPage.tsx` first and replicate:
- The exact same outer layout and wrapper classes
- The same card/container component if one is used
- The same input component for each field
- The same button component for the submit button
- The same error display pattern already used in `LoginPage.tsx`
- The same import style (named imports, path aliases)

The page must include these fields in this order:
1. Full Name — text input, placeholder `"e.g. Ahsan Bilal"`
2. Email Address — email input, placeholder `"you@centriton.com"`
3. Password — password input, placeholder `"Min. 8 characters"`
4. Confirm Password — password input, placeholder `"Repeat your password"`

Below the submit button, a line: `Already have an account?` with a React Router `<Link to="/login">` that says `Sign in`

Do not add a role selector — role defaults on the backend.

Do not invent new styles, new components, or new color values. Use only what already exists in the project.

## Form submit logic — applies whether page is new or existing
```ts
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  setError('');
  setSuccess(false);

  // Frontend validation — runs before any API call
  if (!full_name || !email || !password || !confirmPassword) {
    setError('All fields are required');
    return;
  }
  if (!email.includes('@')) {
    setError('Please enter a valid email address');
    return;
  }
  if (password.length < 8) {
    setError('Password must be at least 8 characters');
    return;
  }
  if (password !== confirmPassword) {
    setError('Passwords do not match');
    return;
  }

  setLoading(true);
  try {
    await register({ email, password, full_name });
    setSuccess(true);
    setTimeout(() => navigate('/login'), 2000);
  } catch (err: any) {
    setError(err.message ?? 'Registration failed. Please try again.');
  } finally {
    setLoading(false);
  }
}
```

## Local state required in the component
```ts
const [full_name, setFullName] = useState('');
const [email, setEmail] = useState('');
const [password, setPassword] = useState('');
const [confirmPassword, setConfirmPassword] = useState('');
const [error, setError] = useState('');
const [success, setSuccess] = useState(false);
const [loading, setLoading] = useState(false);
```

## Success and error display rules
- When `success` is `true`: show a success message `"Account created! Redirecting to login…"` above the form using the same success/alert style already used elsewhere in the project
- When `error` is non-empty: show it below the submit button using the same error/alert style already used in `LoginPage.tsx`
- While `loading` is `true`: disable the submit button and show a loading indicator using the same pattern as `LoginPage.tsx`
- Clear `error` at the start of every submit attempt

## Router changes
- The `/register` route must be **public** — outside `ProtectedRoute`, same as `/login`
- If the router already has a `/register` route pointing to a different component, update it to point to `RegisterPage`
- If `LoginPage.tsx` does not already have a link to `/register`, add one below the submit button using React Router `<Link>`

## Error message mapping
| Scenario | Message shown to user |
|---|---|
| Any required field empty | `"All fields are required"` |
| Invalid email format | `"Please enter a valid email address"` |
| Password under 8 characters | `"Password must be at least 8 characters"` |
| Passwords do not match | `"Passwords do not match"` |
| API returns 422 | `detail[0].msg` from the response |
| API returns any other non-200 | `"Registration failed. Please try again."` |
| Network error or fetch throws without message | `"Unable to connect. Check your connection."` |

## Environment
No new environment variables. Uses existing `VITE_API_URL` from `.env.local`.

## Definition of done
- [ ] Claude confirms in its response whether an existing registration page was found or a new one was created
- [ ] `npm run dev` starts without TypeScript or build errors
- [ ] `tsc --noEmit` passes with zero errors
- [ ] Visiting `/register` renders a registration form with Full Name, Email, Password, and Confirm Password fields
- [ ] The registration page visually matches `LoginPage.tsx` — same layout, same components, same styling
- [ ] Submitting with valid new details sends `POST /api/v1/auth/register` with all four query parameters visible in the Network tab
- [ ] On success `"Account created! Redirecting to login…"` appears and after 2 seconds the page redirects to `/login`
- [ ] Submitting with empty fields shows `"All fields are required"` with no API call made
- [ ] Submitting with mismatched passwords shows `"Passwords do not match"` with no API call made
- [ ] Submitting with password under 8 characters shows `"Password must be at least 8 characters"` with no API call made
- [ ] Submitting with an already-registered email shows the API error message on the page
- [ ] `LoginPage.tsx` has a visible link to `/register`
- [ ] `/register` is accessible without being logged in
- [ ] The `register()` function in `api.ts` is the only place that calls the registration endpoint — no inline fetch in the component
- [ ] No existing login, logout, or protected route functionality is broken