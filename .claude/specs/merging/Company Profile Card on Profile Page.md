# Part 6 — Company Profile Card on Profile Page
## Centriton Frontend Spec for Claude Code

---

### Scope

Add a "Company Details" card to the existing profile page. All authenticated
roles can VIEW the company details. Only `admin` role can EDIT.

The `description` field is read-only for everyone (it drives AI prompt
generation — separate flow needed to update it, out of scope here).

Plan-related fields are read-only and shown as info chips.

---

### File: `src/pages/ProfilePage.tsx` (existing)

Render the existing user profile card unchanged, then add the new Company
Details card below it.

---

### API additions in `src/lib/api.ts`

```ts
export const companies = {
  getMyCompany: () =>
    request<Company>("/api/v1/companies/me"),
  
  updateMyCompany: (body: Partial<Company>) =>
    request<Company>("/api/v1/companies/me", {
      method: "PATCH",
      body
    }),
}
```

Backend has `GET /api/v1/companies/me` and `PATCH /api/v1/companies/me`.

---

### TypeScript Type — `src/types/company.ts` (new or extend existing)

```ts
export interface Company {
  id:                      string
  name:                    string
  sector_id:               string | null
  sector_name?:            string  // populated by backend join if needed
  jurisdiction:            string | null
  description:             string | null
  employee_count:          number | null
  founded_year:            number | null
  website_url:             string | null
  headquarter_city:        string | null
  listed_exchange:         string | null
  reporting_currency:      string | null
  primary_language:        string | null
  fiscal_year_end_month:   number | null
  plan_name:               string | null
  plan_renewal_date:       string | null
  max_seats:               number | null
  created_at:              string
  updated_at:              string
}

// Subset of fields that can actually be edited via PATCH
export type CompanyEditableFields = Pick<Company,
  | "name"
  | "sector_id"
  | "jurisdiction"
  | "employee_count"
  | "founded_year"
  | "website_url"
  | "headquarter_city"
  | "listed_exchange"
  | "reporting_currency"
  | "primary_language"
  | "fiscal_year_end_month"
>
```

---

### Component: `CompanyDetailsCard`

**File:** `src/components/profile/CompanyDetailsCard.tsx` (new)

Receives `user` from context. Manages its own state for the company form.

---

### State and Data Fetching

```tsx
const { user } = useAuth()
const canEdit = user?.role === "admin"

const [company, setCompany]   = useState<Company | null>(null)
const [form, setForm]         = useState<Partial<Company>>({})
const [sectors, setSectors]   = useState<Sector[]>([])
const [loading, setLoading]   = useState(true)
const [saving, setSaving]     = useState(false)
const [error, setError]       = useState<string | null>(null)
const [success, setSuccess]   = useState<string | null>(null)

useEffect(() => {
  Promise.all([
    companies.getMyCompany(),
    sectors.list(),
  ])
    .then(([companyData, sectorsData]) => {
      setCompany(companyData)
      setForm(companyData)
      setSectors(sectorsData)
    })
    .catch(err => setError(err.message ?? "Failed to load company"))
    .finally(() => setLoading(false))
}, [])

const isDirty = company !== null &&
  JSON.stringify(form) !== JSON.stringify(company)

const updateField = <K extends keyof Company>(key: K, value: Company[K]) => {
  setForm(prev => ({ ...prev, [key]: value }))
}
```

---

### Layout

```tsx
<div className="card">
  <div className="ch">
    <h2 className="ct">Company Details</h2>
    <p className="cs">Your company's profile and reporting preferences</p>
  </div>
  
  <div className="cb">
    {loading ? (
      <Skeleton />
    ) : error ? (
      <div className="alert alert-error">{error}</div>
    ) : (
      <CompanyForm
        form={form}
        company={company}
        sectors={sectors}
        canEdit={canEdit}
        updateField={updateField}
      />
    )}
    
    {success && (
      <div className="alert alert-success" style={{ marginTop: 16 }}>
        {success}
      </div>
    )}
    
    {canEdit && !loading && !error && (
      <div className="form-footer" style={{ marginTop: 24 }}>
        <button
          className="btn bp"
          onClick={handleSave}
          disabled={saving || !isDirty}
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    )}
  </div>
</div>
```

---

### Form Sections

#### Section 1 — Basic Info

```tsx
<div className="row">
  <div className="fl">
    <label className="fl-label">Company Name *</label>
    <input
      className="inp"
      value={form.name ?? ""}
      onChange={e => updateField("name", e.target.value)}
      disabled={!canEdit}
      required
    />
  </div>
  
  <div className="fl">
    <label className="fl-label">Sector</label>
    <select
      className="sel"
      value={form.sector_id ?? ""}
      onChange={e => updateField("sector_id", e.target.value || null)}
      disabled={!canEdit}
    >
      <option value="">Select sector</option>
      {sectors.map(s => (
        <option key={s.id} value={s.id}>{s.name}</option>
      ))}
    </select>
  </div>
</div>

<div className="row">
  <div className="fl">
    <label className="fl-label">Jurisdiction</label>
    <input
      className="inp"
      value={form.jurisdiction ?? ""}
      onChange={e => updateField("jurisdiction", e.target.value || null)}
      disabled={!canEdit}
      placeholder="e.g. Saudi Arabia"
    />
  </div>
  
  <div className="fl">
    <label className="fl-label">Headquarter City</label>
    <input
      className="inp"
      value={form.headquarter_city ?? ""}
      onChange={e => updateField("headquarter_city", e.target.value || null)}
      disabled={!canEdit}
    />
  </div>
</div>
```

#### Section 2 — Business Details

```tsx
<div className="row">
  <div className="fl">
    <label className="fl-label">Employee Count</label>
    <input
      type="number"
      className="inp"
      value={form.employee_count ?? ""}
      onChange={e => updateField(
        "employee_count",
        e.target.value ? parseInt(e.target.value) : null
      )}
      disabled={!canEdit}
      min={1}
    />
  </div>
  
  <div className="fl">
    <label className="fl-label">Founded Year</label>
    <input
      type="number"
      className="inp"
      value={form.founded_year ?? ""}
      onChange={e => updateField(
        "founded_year",
        e.target.value ? parseInt(e.target.value) : null
      )}
      disabled={!canEdit}
      min={1800}
      max={new Date().getFullYear()}
    />
  </div>
</div>

<div className="row">
  <div className="fl">
    <label className="fl-label">Website URL</label>
    <input
      type="url"
      className="inp"
      value={form.website_url ?? ""}
      onChange={e => updateField("website_url", e.target.value || null)}
      disabled={!canEdit}
      placeholder="https://example.com"
    />
  </div>
  
  <div className="fl">
    <label className="fl-label">Listed Exchange</label>
    <input
      className="inp"
      value={form.listed_exchange ?? ""}
      onChange={e => updateField("listed_exchange", e.target.value || null)}
      disabled={!canEdit}
      placeholder="e.g. Tadawul, NYSE"
    />
  </div>
</div>
```

#### Section 3 — Reporting Preferences

```tsx
<div className="row">
  <div className="fl">
    <label className="fl-label">Reporting Currency</label>
    <select
      className="sel"
      value={form.reporting_currency ?? ""}
      onChange={e => updateField("reporting_currency", e.target.value || null)}
      disabled={!canEdit}
    >
      <option value="">Select currency</option>
      <option value="SAR">SAR — Saudi Riyal</option>
      <option value="USD">USD — US Dollar</option>
      <option value="EUR">EUR — Euro</option>
      <option value="GBP">GBP — British Pound</option>
      <option value="AED">AED — UAE Dirham</option>
      <option value="QAR">QAR — Qatari Riyal</option>
      <option value="KWD">KWD — Kuwaiti Dinar</option>
      <option value="BHD">BHD — Bahraini Dinar</option>
      <option value="OMR">OMR — Omani Rial</option>
    </select>
  </div>
  
  <div className="fl">
    <label className="fl-label">Primary Language</label>
    <select
      className="sel"
      value={form.primary_language ?? ""}
      onChange={e => updateField("primary_language", e.target.value || null)}
      disabled={!canEdit}
    >
      <option value="">Select language</option>
      <option value="en">English</option>
      <option value="ar">العربية</option>
    </select>
  </div>
</div>

<div className="row">
  <div className="fl">
    <label className="fl-label">Fiscal Year End Month</label>
    <select
      className="sel"
      value={form.fiscal_year_end_month ?? ""}
      onChange={e => updateField(
        "fiscal_year_end_month",
        e.target.value ? parseInt(e.target.value) : null
      )}
      disabled={!canEdit}
    >
      <option value="">Select month</option>
      {[
        "January","February","March","April","May","June",
        "July","August","September","October","November","December"
      ].map((m, i) => (
        <option key={i+1} value={i+1}>{m}</option>
      ))}
    </select>
  </div>
</div>
```

#### Section 4 — Description (read-only for everyone)

```tsx
<div className="fl" style={{ marginTop: 24 }}>
  <label className="fl-label">
    Company Description
    <span style={{ marginLeft: 8, fontSize: 12, color: "#9BA3C4" }}>
      Read-only
    </span>
  </label>
  <textarea
    className="inp"
    value={form.description ?? ""}
    disabled={true}
    readOnly
    rows={4}
    style={{
      background: "#F5F6FA",
      cursor: "not-allowed",
      color: "#5A6080"
    }}
  />
  <p style={{ fontSize: 12, color: "#9BA3C4", marginTop: 4 }}>
    This field drives AI prompts for your departments. 
    Contact support to update it.
  </p>
</div>
```

#### Section 5 — Plan & Account (always read-only, styled info chips)

```tsx
<div style={{
  marginTop: 32,
  paddingTop: 24,
  borderTop: "1px solid #E2E4F0"
}}>
  <h3 style={{ marginBottom: 16, fontSize: 14, color: "#5A6080" }}>
    Plan & Account
  </h3>
  <div style={{
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 16
  }}>
    <InfoItem
      label="Plan"
      value={company.plan_name ?? "Enterprise"}
    />
    <InfoItem
      label="Max Seats"
      value={String(company.max_seats ?? 12)}
    />
    <InfoItem
      label="Plan Renewal"
      value={company.plan_renewal_date 
        ? new Date(company.plan_renewal_date).toLocaleDateString()
        : "—"}
    />
    <InfoItem
      label="Account Created"
      value={new Date(company.created_at).toLocaleDateString()}
    />
  </div>
</div>
```

Small `InfoItem` component:

```tsx
const InfoItem = ({ label, value }: { label: string; value: string }) => (
  <div>
    <div style={{ fontSize: 12, color: "#9BA3C4", marginBottom: 4 }}>
      {label}
    </div>
    <div style={{ fontSize: 14, color: "#1A1D2E", fontWeight: 500 }}>
      {value}
    </div>
  </div>
)
```

---

### Save Handler

```tsx
const handleSave = async () => {
  // Build payload from editable fields only
  const editableFields: (keyof CompanyEditableFields)[] = [
    "name", "sector_id", "jurisdiction",
    "employee_count", "founded_year", "website_url",
    "headquarter_city", "listed_exchange",
    "reporting_currency", "primary_language",
    "fiscal_year_end_month",
  ]
  
  const payload: Partial<Company> = {}
  for (const key of editableFields) {
    if (form[key] !== company?.[key]) {
      payload[key] = form[key] as any
    }
  }
  
  if (Object.keys(payload).length === 0) {
    setSuccess("No changes to save")
    setTimeout(() => setSuccess(null), 2000)
    return
  }
  
  try {
    setSaving(true)
    setError(null)
    const updated = await companies.updateMyCompany(payload)
    setCompany(updated)
    setForm(updated)
    setSuccess("Company details updated successfully")
    setTimeout(() => setSuccess(null), 3000)
  } catch (err: any) {
    setError(err.message ?? "Failed to update company")
  } finally {
    setSaving(false)
  }
}
```

---

### Integration in `ProfilePage.tsx`

```tsx
import { CompanyDetailsCard } from "@/components/profile/CompanyDetailsCard"

export default function ProfilePage() {
  return (
    <div className="profile-page">
      <UserProfileCard />          {/* existing */}
      <CompanyDetailsCard />       {/* new */}
    </div>
  )
}
```

---

### Done Criteria

1. Profile page renders existing user info card unchanged
2. Below it, a new "Company Details" card renders for all authenticated roles
3. Admin sees all editable fields as enabled inputs
4. Non-admin roles (PM, department_user, IR) see all fields as disabled
5. Description field is disabled for everyone with helper text
6. Plan section shows as styled info chips, not editable inputs
7. Save button only visible for admin
8. Save button disabled when no changes made (dirty check)
9. Save sends only the changed fields, not the entire object
10. Successful save updates local state and shows green success message
11. Success message auto-dismisses after 3 seconds
12. Save errors show inline error banner
13. Loading state shows skeleton until data is fetched
14. API errors during fetch show clean error state