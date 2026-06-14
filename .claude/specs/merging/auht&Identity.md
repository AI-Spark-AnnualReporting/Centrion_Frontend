# Part 2 — Auth & Identity
## Centriton Frontend Spec for Claude Code

---

### Context

The Centriton backend now returns `onboarding_completed` in login and
registration responses. A new `POST /auth/onboarding` endpoint collects
company and user profile details on first login. The JWT now carries
`company_id`, `email`, `full_name`, and `onboarding_completed` in its
payload.

The frontend needs to handle the new onboarding gate and collect the missing
company details before letting the user reach the dashboard.

**Tech stack:** React 18.3 + TypeScript + Vite, react-router-dom 6.30, custom
fetch client at `src/lib/api.ts`, auth state in `src/context/AuthContext.tsx`.

---

### Files to Change

| File | Change type |
|---|---|
| `src/types/auth.ts` | Update `AuthUser`, add `OnboardingPayload` |
| `src/lib/api.ts` | Add `auth.onboarding()`, update `auth.login()` response handling |
| `src/context/AuthContext.tsx` | Handle `onboarding_completed` in login and storage |
| `src/components/ProtectedRoute.tsx` | Add onboarding gate |
| `src/App.tsx` | Add `/onboarding` route |
| `src/pages/OnboardingPage.tsx` | New file — two-step onboarding form |

---

### Change 1 — `src/types/auth.ts`

Update `AuthUser` to add `onboarding_completed` and fix the `role` type to
match the actual 3 roles the backend uses:

```ts
interface AuthUser {
  user_id:               string
  email:                 string
  full_name:             string
  role:                  "admin" | "project_manager" | "department_user"
  company_id?:           string | null
  company_name?:         string | null
  must_change_password?: boolean | null
  onboarding_completed?: boolean | null   // ADD
}

interface LoginResponse {
  access_token:         string
  token_type:           "bearer"
  user:                 AuthUser
  onboarding_completed: boolean           // ADD — explicit top-level field
}
```

Add a new payload type for the onboarding request:

```ts
interface OnboardingPayload {
  // Mandatory
  description:           string
  employee_count:        number
  fiscal_year_end_month: number
  reporting_currency:    "SAR" | "AED" | "BHD" | "KWD" | "OMR" | "QAR" | "USD"
  primary_language:      "en" | "ar"
  title:                 string
  position_type:         "executive" | "board_member" | "investor_contact" |
                         "esg_lead" | "finance" | "operations" | "other"
  // Optional
  founded_year?:         number | null
  website_url?:          string | null
  headquarter_city?:     string | null
  listed_exchange?:      string | null
  phone?:                string | null
}

interface OnboardingResponse {
  access_token: string
  company:      CompanyRecord
  user:         AuthUser
}
```

---

### Change 2 — `src/lib/api.ts`

Add `auth.onboarding()` to the `auth` namespace:

```ts
async onboarding(payload: OnboardingPayload): Promise<OnboardingResponse> {
  return request<OnboardingResponse>("/api/v1/auth/onboarding", {
    method: "POST",
    body: payload,
  })
}
```

In `auth.login()`, map the `onboarding_completed` field from the response onto
the returned `AuthUser` object so the auth context can read it:

```ts
async login(email: string, password: string): Promise<AuthUser> {
  const data = await request<LoginResponse>("/api/v1/auth/login", {
    method: "POST",
    body: { email, password },
  })
  // ... existing token storage ...
  return {
    ...data.user,
    onboarding_completed: data.onboarding_completed  // ADD
  }
}
```

In `parseJwtPayload`, also extract `onboarding_completed` so backfill works for
existing sessions that were issued before the field existed in the JWT:

```ts
function parseJwtPayload(token: string): Partial<AuthUser> {
  // ... existing decode ...
  return {
    ...existing,
    company_id:           payload.company_id    ?? null,
    onboarding_completed: payload.onboarding_completed ?? null,  // ADD
  }
}
```

---

### Change 3 — `src/context/AuthContext.tsx`

`login()` already stores the user to localStorage. Ensure `onboarding_completed`
is part of what gets stored so it survives a page reload:

```ts
const login = async (email: string, password: string): Promise<AuthUser> => {
  const user = await auth.login(email, password)
  // ... existing token + user storage ...
  // user now has onboarding_completed from Change 2 — nothing extra needed here
  return user
}
```

Add a `completeOnboarding()` helper that the onboarding page calls after a
successful submission — it replaces the stored token and user with the fresh
ones returned by the endpoint:

```ts
const completeOnboarding = async (payload: OnboardingPayload): Promise<void> => {
  const data = await auth.onboarding(payload)
  // Replace stored token with the freshly issued one (onboarding_completed = true)
  localStorage.setItem("centriton_token", data.access_token)
  const updatedUser: AuthUser = {
    ...data.user,
    onboarding_completed: true
  }
  localStorage.setItem("centriton_user", JSON.stringify(updatedUser))
  setUser(updatedUser)
}
```

Expose `completeOnboarding` from the hook return value.

---

### Change 4 — `src/components/ProtectedRoute.tsx`

Current logic (simplified):
```
1. hydrating → Loading
2. no user → /login
3. must_change_password → /change-password
4. else → render
```

New logic — add the onboarding gate between step 3 and step 4:

```ts
// After must_change_password check and before rendering the route:

// Onboarding gate — only for admin users who haven't completed onboarding
if (
  user.role === "admin" &&
  user.onboarding_completed === false &&
  location.pathname !== "/onboarding"
) {
  return <Navigate to="/onboarding" replace />
}

// Prevent accessing /onboarding if already done
if (
  location.pathname === "/onboarding" &&
  user.onboarding_completed === true
) {
  return <Navigate to="/dashboard" replace />
}
```

`project_manager` and `department_user` roles skip onboarding entirely —
they are invited users, not self-registered company admins.

---

### Change 5 — `src/App.tsx`

Add the `/onboarding` route. It must be a protected route (user must be logged
in) but it must NOT be inside `<AppLayout>` — just like `/change-password`.

```tsx
// Inside the protected routes block, OUTSIDE the AppLayout wrapper:
<Route path="/onboarding" element={
  <ProtectedRoute>
    <OnboardingPage />
  </ProtectedRoute>
} />
```

---

### Change 6 — `src/pages/OnboardingPage.tsx` (new file)

**Layout:** Full-page centered form, same visual language as the existing
registration pages. Reuse the existing `StepIndicator` component from
`src/components/registration/StepIndicator.tsx`.

**Two steps:**

**Step 1 — Company Details**

Label: "Company Setup"
Subtitle: "Tell us about your organisation"

| Field | Input type | Required | Notes |
|---|---|---|---|
| Description | Textarea | Yes | Min 20 chars, "Brief description of your company" |
| Number of employees | Number input | Yes | Min 1 |
| Fiscal year end month | Select | Yes | January (1) – December (12) |
| Reporting currency | Select | Yes | SAR (default), AED, BHD, KWD, OMR, QAR, USD |
| Primary language | Select | Yes | English (en), Arabic (ar) |
| Founded year | Number input | No | Placeholder "e.g. 1995" |
| Website | Text input | No | Placeholder "https://..." |
| Headquarter city | Text input | No | |
| Listed exchange | Text input | No | Placeholder "e.g. Tadawul, DFM" |

**Step 2 — Your Profile**

Label: "Your Details"
Subtitle: "Help your team know who you are"

| Field | Input type | Required | Notes |
|---|---|---|---|
| Job title | Text input | Yes | Placeholder "e.g. Chief Sustainability Officer" |
| Position type | Select | Yes | Executive, Board Member, Investor Contact, ESG Lead, Finance, Operations, Other |
| Phone | Text input | No | |

**Navigation:**
- Step 1 has a "Continue →" button — validates Step 1 mandatory fields, does NOT call the API yet
- Step 2 has a "← Back" button and a "Complete Setup" button
- "Complete Setup" calls `useAuth().completeOnboarding(payload)` with all fields from both steps combined
- On success: `useNavigate()` to `/dashboard`
- On error: show an inline error message, stay on Step 2

**Validation:**
- Validate mandatory fields on the step they belong to before allowing navigation forward
- Show inline field-level error messages
- "Complete Setup" button disabled while the API call is in flight

**State management:**
Use plain React `useState` (matching the existing registration page pattern —
no react-hook-form here per existing convention in auth flows).

**Loading state:**
Show a spinner inside the "Complete Setup" button and disable both navigation
buttons while the API call is in progress.

**CSS classes to use** (matching existing design system):
- Outer wrapper: same centered layout as login/register pages
- Form card: `.card`
- Labels: `.fl-label`
- Inputs: `.inp`
- Selects: `.sel`
- Primary button: `.btn .bp`
- Secondary button: `.btn .bs`

---

### Done Criteria

1. After registration, JWT decodes to show `onboarding_completed: false`
2. First login after registration routes to `/onboarding` not `/dashboard`
3. `/onboarding` is not inside the app shell (no sidebar, no topbar)
4. Step 1 validates mandatory fields before allowing navigation to Step 2
5. "Complete Setup" calls `POST /auth/onboarding` and receives a new JWT
6. New JWT is stored — subsequent login goes straight to `/dashboard`
7. `project_manager` and `department_user` roles are never redirected to `/onboarding`
8. Navigating to `/onboarding` manually when `onboarding_completed = true`
   redirects to `/dashboard`