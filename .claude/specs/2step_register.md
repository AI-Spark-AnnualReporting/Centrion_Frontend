# Spec: Multi-Step Registration — User Details + Company Setup

## Overview
This feature replaces the existing single-step registration page with a two-step onboarding flow. Step 1 collects personal details (full name, email, password, confirm password) with frontend validation only — no API call is made. Step 2 collects company details (company name, sector selected from a live API dropdown, jurisdiction). On Step 2 submit the flow calls `POST /api/v1/companies/` first, extracts `response.company.id` from the response, then calls `POST /api/v1/auth/register` with that `company_id`. On success redirects to `/login` with a registered state flag that triggers a success banner. This spec covers both the case where a registration page already exists in the project and the case where it does not.

## Depends on
- Spec: Login & Logout fully complete — `src/lib/api.ts`, `src/context/AuthContext.tsx`, `src/components/ProtectedRoute.tsx`, and `src/types/auth.ts` must all exist
- FastAPI backend running at `http://localhost:8000`
- JWT removed from `GET /api/v1/lookups/sectors` and `POST /api/v1/companies/` — both endpoints are fully public
- `company_id` parameter added to `POST /api/v1/auth/register`
- `.env.local` has `VITE_API_URL=http://localhost:8000`

## Pre-flight check — Claude must do this before writing any code
1. Search the entire `src/` directory for any file whose name contains `Register`, `Signup`, `SignUp`, or `CreateAccount` (case-insensitive)
2. Search `App.tsx` and any router config file for routes containing `/register`, `/signup`, or `/create-account`
3. If a registration page is found — modify that file, do not create a new one
4. If a registration page is not found — create `src/pages/RegisterPage.tsx` from scratch, visually matching `LoginPage.tsx` exactly
5. Report which path was taken before proceeding with implementation

## API Contract

### GET /api/v1/lookups/sectors
```
No auth required
No parameters

Response 200:
{
  "sectors": [
    {
      "id": "537a7872-cf2b-4caf-8da5-67e3da134a61",
      "code": "agriculture",
      "name": "Agriculture, Aquaculture & Fishing"
    },
    {
      "id": "d4cf7213-bce2-402f-a2bb-2828b9820c48",
      "code": "financial_services",
      "name": "Financial Services"
    }
    ... 13 sectors total
  ],
  "total": 13
}

Key facts:
- The array is at response.sectors — not the root object
- sector.id is a UUID string — this is what gets sent to the companies endpoint
- sector.code and sector.name are for display only
```

### POST /api/v1/companies/
```
No auth required

Query parameters:
  name          string   required
  sector_id     string   required — UUID from sectors response e.g. "d01df6f0-e7c2-4108-9c6d-76d9b1dc4dae"
  jurisdiction  string   optional — omit entirely if not provided

Response 200:
{
  "company": {
    "id": "de9d08da-615f-49b9-a450-d8d4670eb1ae",
    "name": "testng compay",
    "jurisdiction": null,
    "operating_mode": "hybrid",
    "fiscal_year_end_month": 12,
    "logo_url": null,
    "is_active": true,
    "created_at": "2026-04-20T08:34:27.507219+00:00",
    "updated_at": "2026-04-20T08:34:27.507219+00:00",
    "sector_id": "d01df6f0-e7c2-4108-9c6d-76d9b1dc4dae"
  }
}

Key facts:
- The company ID is at response.company.id — not response.id or response.company_id
- This UUID must be passed as company_id to the register endpoint immediately after
```

### POST /api/v1/auth/register
```
No auth required

Query parameters:
  email       string   required
  password    string   required
  full_name   string   required
  role        string   hardcoded to "admin" — always, never "department_user"
  company_id  string   required — UUID from response.company.id above

Response 200: may be plain string or JSON object — handle both cases
```

### Execution order on Step 2 submit — strictly sequential
```
1. Validate Step 2 fields frontend-only
        ↓ passes
2. POST /api/v1/companies/?name=xxx&sector_id=uuid
        ↓ success → extract response.company.id as companyId
        ↓ failure → show error message, stay on Step 2, STOP — never call register
3. POST /api/v1/auth/register?...&company_id=companyId&role=admin
        ↓ success
        ↓ failure → show error message, stay on Step 2
4. setSuccess(true) → show success message → after 2 seconds navigate('/login', { state: { registered: true } })
```

## TypeScript interfaces

### Create `src/types/company.ts`
```ts
export interface Sector {
  id: string;       // UUID string
  code: string;     // e.g. "financial_services"
  name: string;     // e.g. "Financial Services"
}

export interface SectorsResponse {
  sectors: Sector[];
  total: number;
}

export interface CreateCompanyRequest {
  name: string;
  sector_id: string;      // UUID string — not an integer
  jurisdiction?: string;
}

export interface CompanyRecord {
  id: string;             // UUID — this is what gets passed to register as company_id
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

### Create `src/types/register.ts`
```ts
export interface StepOneState {
  full_name: string;
  email: string;
  password: string;
  confirmPassword: string;  // frontend only — never sent to API
}

export interface StepTwoState {
  companyName: string;
  sector_id: string;        // UUID string — empty string means not yet selected
  jurisdiction: string;     // default "KSA"
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

## Files to create
- `src/types/company.ts` — as above
- `src/types/register.ts` — as above
- `src/components/registration/StepIndicator.tsx` — step 1 of 2 visual progress indicator
- `src/components/registration/StepOneForm.tsx` — personal details fields
- `src/components/registration/StepTwoForm.tsx` — company details fields
- `src/pages/RegisterPage.tsx` — only if no registration page found in pre-flight check

## Files to modify
- `src/lib/api.ts` — add `getSectors()` and `createCompany()`, update `register()`
- `src/pages/RegisterPage.tsx` — replace with two-step orchestrator if it already exists
- `src/pages/LoginPage.tsx` — add registered success banner only
- `src/App.tsx` or router config — add `/register` as public route if missing, add link from `/login` to `/register` if missing

## Files to leave unchanged
- `src/context/AuthContext.tsx`
- `src/components/ProtectedRoute.tsx`
- `src/types/auth.ts`
- All other pages and components

## `src/lib/api.ts` — exact function signatures

### Add `getSectors()` — new function, do not modify existing functions
```ts
export async function getSectors(): Promise<Sector[]> {
  const res = await fetch(
    `${BASE_URL}/api/v1/lookups/sectors`,
    { headers: { accept: 'application/json' } }
  );

  if (!res.ok) throw new Error('Failed to load sectors');

  const data: SectorsResponse = await res.json();
  return data.sectors;  // extract array from wrapper object
}
```

### Add `createCompany()` — new function, do not modify existing functions
```ts
export async function createCompany(
  params: CreateCompanyRequest
): Promise<CreateCompanyResponse> {
  const query = new URLSearchParams({
    name: params.name,
    sector_id: params.sector_id,  // UUID string passed as-is
  });

  if (params.jurisdiction) {
    query.append('jurisdiction', params.jurisdiction);
  }

  const res = await fetch(
    `${BASE_URL}/api/v1/companies/?${query.toString()}`,
    { method: 'POST', headers: { accept: 'application/json' } }
  );

  if (res.ok) return res.json();

  if (res.status === 422) {
    const err = await res.json();
    throw new Error(err.detail?.[0]?.msg ?? 'Validation error');
  }

  const text = await res.text();
  throw new Error(text || 'Failed to create company. Please try again.');
}
```

### Update `register()` — replace the existing function entirely
```ts
export async function register(
  params: RegisterRequest
): Promise<RegisterResponse> {
  const query = new URLSearchParams({
    email: params.email,
    password: params.password,
    full_name: params.full_name,
    role: 'admin',  // always admin — never department_user
  });

  if (params.company_id) {
    query.append('company_id', params.company_id);
  }

  const res = await fetch(
    `${BASE_URL}/api/v1/auth/register?${query.toString()}`,
    { method: 'POST', headers: { accept: 'application/json' } }
  );

  if (res.ok) {
    const text = await res.text();
    try {
      return JSON.parse(text);      // handle JSON response
    } catch {
      return { message: text };     // handle plain string response
    }
  }

  if (res.status === 422) {
    const err = await res.json();
    throw new Error(err.detail?.[0]?.msg ?? 'Validation error');
  }

  throw new Error('Registration failed. Please try again.');
}
```

## `src/pages/RegisterPage.tsx` — complete implementation

### State
```ts
const [step, setStep] = useState<1 | 2>(1);

const [stepOne, setStepOne] = useState<StepOneState>({
  full_name: '',
  email: '',
  password: '',
  confirmPassword: '',
});

const [stepTwo, setStepTwo] = useState<StepTwoState>({
  companyName: '',
  sector_id: '',        // empty string = nothing selected yet
  jurisdiction: 'KSA',
});

const [sectors, setSectors] = useState<Sector[]>([]);
const [sectorsLoading, setSectorsLoading] = useState(true);
const [error, setError] = useState('');
const [loading, setLoading] = useState(false);
const [success, setSuccess] = useState(false);

const navigate = useNavigate();
```

### Sector fetch on mount
```ts
useEffect(() => {
  getSectors()
    .then(data => setSectors(data))
    .catch(() => setSectors([]))
    .finally(() => setSectorsLoading(false));
}, []);
```

### Step 1 submit — validation only, zero API calls
```ts
function handleStepOneSubmit(data: StepOneState) {
  setError('');

  if (!data.full_name.trim() || !data.email.trim() ||
      !data.password || !data.confirmPassword) {
    setError('All fields are required');
    return;
  }
  if (!data.email.includes('@')) {
    setError('Please enter a valid email address');
    return;
  }
  if (data.password.length < 8) {
    setError('Password must be at least 8 characters');
    return;
  }
  if (data.password !== data.confirmPassword) {
    setError('Passwords do not match');
    return;
  }

  setStepOne(data);
  setStep(2);
  // No API call — only advance the step
}
```

### Step 2 submit — sequential API calls
```ts
async function handleStepTwoSubmit(data: StepTwoState) {
  setError('');

  if (!data.companyName.trim()) {
    setError('Company name is required');
    return;
  }
  if (!data.sector_id) {
    setError('Please select a sector');
    return;
  }

  setLoading(true);
  try {
    // Call 1 — create company
    const companyResponse = await createCompany({
      name: data.companyName,
      sector_id: data.sector_id,
      jurisdiction: data.jurisdiction || undefined,
    });

    // Extract company.id — NOT company_id, NOT id at root level
    const companyId = companyResponse.company.id;

    // Call 2 — register user with company.id
    await register({
      email: stepOne.email,
      password: stepOne.password,
      full_name: stepOne.full_name,
      company_id: companyId,
    });

    setSuccess(true);
    setTimeout(() => {
      navigate('/login', { state: { registered: true } });
    }, 2000);

  } catch (err: any) {
    setError(err.message ?? 'Something went wrong. Please try again.');
  } finally {
    setLoading(false);
  }
}
```

### Back button
```ts
function handleBack() {
  setError('');
  setStep(1);
  // Do NOT reset stepOne — preserve all entered values
}
```

### JSX structure
```tsx
return (
  <OuterWrapper> {/* same wrapper class as LoginPage */}

    <BrandingBlock/> {/* same logo/brand as LoginPage */}

    <StepIndicator currentStep={step} />

    <PageTitle>
      {step === 1 ? 'Your Details' : 'Company Setup'}
    </PageTitle>
    <PageSubtitle>
      {step === 1
        ? 'Step 1 of 2 — Personal information'
        : 'Step 2 of 2 — Your organisation'}
    </PageSubtitle>

    {success && (
      <SuccessAlert>
        Account created! Setting up your workspace…
      </SuccessAlert>
    )}

    {step === 1 && (
      <StepOneForm
        initialValues={stepOne}
        onSubmit={handleStepOneSubmit}
        error={error}
      />
    )}

    {step === 2 && (
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

  </OuterWrapper>
);
```

## `src/components/registration/StepIndicator.tsx`

```tsx
interface StepIndicatorProps {
  currentStep: 1 | 2;
}

// Renders two numbered steps connected by a horizontal line
//
// Visual layout:
//   ●━━━━━━━━━○      (step 1 active)
//  (1)       (2)
// Your      Company
// Details    Setup
//
//   ✓━━━━━━━━━●      (step 2 active — step 1 shows checkmark)
//  (1)       (2)
// Your      Company
// Details    Setup
//
// Rules:
// - Active step: filled circle, accent color, white number
// - Completed step: checkmark icon, accent color
// - Inactive step: empty circle, muted border
// - Connecting line: accent color for completed portion, muted for remaining
// - Labels below each circle
// - Use ONLY existing Tailwind classes or CSS variables already in the project
// - Do NOT introduce new colors, new spacing values, or new utility classes
```

## `src/components/registration/StepOneForm.tsx`

```tsx
interface StepOneFormProps {
  initialValues: StepOneState;
  onSubmit: (data: StepOneState) => void;
  error: string;
}

// Internal state initialized from initialValues
// Updates on every keystroke — controlled inputs

// Fields in this exact order:
//   Full Name         text input    placeholder "e.g. Ahsan Bilal"
//   Email Address     email input   placeholder "you@centriton.com"
//   Password          password      placeholder "Min. 8 characters"
//   Confirm Password  password      placeholder "Repeat your password"

// Error display:
//   Show error prop below the last field
//   Use the exact same error component or class already used in LoginPage
//   Never console.log errors — always show them in the UI

// Submit button:
//   Label: "Continue →"
//   Style: same primary button class as LoginPage submit button
//   Never disabled, never shows loading spinner
//   No API call happens here — button only triggers handleStepOneSubmit

// Below the submit button:
//   "Already have an account?" followed by <Link to="/login">Sign in</Link>
//   Use React Router Link — not an anchor tag

// Use the same input component, label style, and button component
// already used in LoginPage — do not create new UI primitives
```

## `src/components/registration/StepTwoForm.tsx`

```tsx
interface StepTwoFormProps {
  initialValues: StepTwoState;
  sectors: Sector[];
  sectorsLoading: boolean;
  onSubmit: (data: StepTwoState) => void;
  onBack: () => void;
  error: string;
  loading: boolean;
}

// Internal state initialized from initialValues
// Updates on every change — controlled inputs

// Fields in this exact order:

// 1. Company Name
//    text input
//    placeholder "e.g. Al-Noor Capital"

// 2. Sector
//    select dropdown — controlled by sector_id (UUID string)
//    while sectorsLoading is true:
//      single option: "Loading sectors…" — disabled, selected
//    when loaded:
//      first option: "Select a sector" — value="" — disabled — selected by default
//      remaining options: sectors.map(s => <option value={s.id}>{s.name}</option>)
//      value is s.id (UUID) — NOT s.code, NOT s.name
//    the selected value stored in state is the UUID string

// 3. Jurisdiction
//    select dropdown — hardcoded options
//    default selected: "KSA"
//    options: KSA, UAE, Bahrain, Kuwait, Oman, Qatar, Other

// Error display:
//    show error prop below the jurisdiction field
//    use exact same error component or class as LoginPage

// Two buttons side by side — Back left, Create Account right:

//    Back button:
//      label "← Back"
//      secondary style — same as cancel/secondary buttons elsewhere in project
//      always enabled — calls onBack() — no loading state
//      never triggers an API call

//    Create Account button:
//      label "Create Account" when loading is false
//      label "Creating account…" with spinner when loading is true
//      disabled when loading is true
//      primary style — same as LoginPage submit button

// Use the same input, select, and button components already in the project
```

## `src/pages/LoginPage.tsx` — single addition only

Add these lines at the top of the component, touch nothing else:
```ts
const location = useLocation();
const [showRegisteredBanner, setShowRegisteredBanner] = useState(
  (location.state as any)?.registered === true
);
```

Add this block above the login form — only renders when showRegisteredBanner is true:
```tsx
{showRegisteredBanner && (
  <div className={/* exact same success/green alert class used elsewhere in project */}>
    Account created successfully. Please sign in.
  </div>
)}
```

Dismiss the banner when user starts typing in either field:
```ts
onChange={() => setShowRegisteredBanner(false)}
```

Do not change the layout, form fields, submit handler, or any other
part of LoginPage.

## Error message mapping

| Scenario | Message |
|---|---|
| Step 1 — any required field empty | `"All fields are required"` |
| Step 1 — invalid email format | `"Please enter a valid email address"` |
| Step 1 — password under 8 characters | `"Password must be at least 8 characters"` |
| Step 1 — passwords do not match | `"Passwords do not match"` |
| Step 2 — company name empty | `"Company name is required"` |
| Step 2 — no sector selected | `"Please select a sector"` |
| Step 2 — companies API returns 422 | `detail[0].msg` from response body |
| Step 2 — companies API returns non-200 | `"Failed to create company. Please try again."` |
| Step 2 — register API returns 422 | `detail[0].msg` from response body |
| Step 2 — register API returns non-200 | `"Registration failed. Please try again."` |
| Any network failure | `"Unable to connect. Check your connection."` |

## Rules for implementation
- Never send `confirmPassword` to any API endpoint — it is frontend only
- Always send `role=admin` in the register call — never send `department_user`
- Always extract the company ID from `response.company.id` — never from `response.id` or `response.company_id`
- Always send `sector_id` as the UUID string from `sector.id` — never send `sector.code` or `sector.name`
- Never call `POST /api/v1/auth/register` if `POST /api/v1/companies/` fails
- Never call either API from Step 1 — Step 1 is validation only
- Always call `getSectors()` on component mount — not on Step 2 mount, not on button click
- Never hardcode sector options — always use the live API response
- Preserve `stepOne` state when user clicks Back — never reset it
- Use `res.text()` then `JSON.parse()` for the register response — not `res.json()` directly — because the backend may return a plain string
- Do not add any new UI libraries, auth libraries, or state management libraries
- Do not add any new CSS files or CSS-in-JS — use only existing project styles
- All new components use the same import style and path aliases already in the project
- `tsc --noEmit` must pass with zero errors after all changes

## Definition of done
- [ ] Claude reports whether an existing registration page was found or a new one was created
- [ ] `npm run dev` starts with zero TypeScript errors
- [ ] `tsc --noEmit` passes with zero errors
- [ ] Visiting `/register` shows Step 1 form with step indicator showing Step 1 of 2
- [ ] Step 1 Continue with valid data advances to Step 2 — zero network requests in browser Network tab
- [ ] Step 2 loads with sector dropdown already populated from `GET /api/v1/lookups/sectors`
- [ ] Sector dropdown option values are UUID strings — confirmed by inspecting option elements
- [ ] Clicking Back on Step 2 returns to Step 1 with all previously entered values preserved
- [ ] Submitting Step 2 with valid data shows `POST /api/v1/companies/` then `POST /api/v1/auth/register` in Network tab in that order
- [ ] The `sector_id` query param in the companies call is a UUID string matching the selected sector
- [ ] The `company_id` query param in the register call matches `response.company.id` from the companies response
- [ ] The `role=admin` query param is present in the register call
- [ ] On success `"Account created! Setting up your workspace…"` appears on the page
- [ ] After 2 seconds the page redirects to `/login`
- [ ] `/login` shows `"Account created successfully. Please sign in."` immediately after redirect
- [ ] The success banner on `/login` disappears when the user starts typing
- [ ] If the companies API call fails, the register API call is never made — confirmed in Network tab
- [ ] Submitting Step 1 with an empty field shows the correct error with zero network requests
- [ ] Submitting Step 2 with no sector selected shows `"Please select a sector"` with zero network requests
- [ ] The submit button is disabled and shows a loading state while API calls are in progress
- [ ] No existing login, logout, or protected route behaviour is broken