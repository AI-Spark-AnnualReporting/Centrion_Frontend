# Part 6 — Annual Report (Cycles) in Centriton Frontend
## Spec for Claude Code (Centriton Frontend Only)

---

### Context

The Annual Report sidebar entry, cycle list page, create cycle form, and
cycle detail page are already built. This spec covers the final missing
pieces in the Edit Cycle modal and confirms the rest of the implementation.

What needs to be completed:

1. Edit Cycle modal — add Project Manager dropdown and Content Language toggle
2. Pre-fill form state from cycle data when Edit is opened
3. Include both fields in the PUT payload

No backend changes. SAR's APIs are already live and company-scoped.

---

### SAR Endpoints Used

All calls authenticated via the existing Centriton JWT (Part 2 token passthrough).

| Action | SAR endpoint |
|---|---|
| List cycles | `GET /api/v1/admin/cycles` |
| Get cycle detail | `GET /api/v1/admin/cycles/{cycle_id}` |
| Create cycle | `POST /api/v1/admin/cycles` |
| Update cycle | `PUT /api/v1/admin/cycles/{cycle_id}` |
| Cycle overview (stats, dept progress) | `GET /api/v1/admin/cycles/{cycle_id}/overview` |
| Cycle sections | `GET /api/v1/admin/cycles/{cycle_id}/sections` |
| List PMs (for the dropdown) | `GET /api/v1/admin/users?role=project_manager` |

---

### API Client — `src/lib/api.ts`

```ts
export const sarCycles = {
  list:        () =>
    sarRequest<{ cycles: Cycle[] }>("/api/v1/admin/cycles"),

  get:         (id: string) =>
    sarRequest<{ cycle: Cycle }>(`/api/v1/admin/cycles/${id}`),

  create:      (body: CreateCyclePayload) =>
    sarRequest<{ cycle: Cycle }>("/api/v1/admin/cycles", {
      method: "POST",
      body
    }),

  update:      (id: string, body: Partial<CreateCyclePayload>) =>
    sarRequest<{ cycle: Cycle }>(`/api/v1/admin/cycles/${id}`, {
      method: "PUT",
      body
    }),

  overview:    (id: string) =>
    sarRequest<CycleOverview>(`/api/v1/admin/cycles/${id}/overview`),

  sections:    (id: string) =>
    sarRequest<{ sections: CycleSection[] }>(
      `/api/v1/admin/cycles/${id}/sections`
    ),
}

export const sarUsers = {
  listProjectManagers: () =>
    sarRequest<{ users: SARUser[] }>(
      "/api/v1/admin/users?role=project_manager"
    ),
}
```

---

### TypeScript Types — `src/types/cycles.ts`

```ts
export interface Cycle {
  id:                 string
  company_id:         string
  name:               string
  fiscal_year:        number
  period_label:       string
  content_language:   "en" | "ar"
  project_manager_id: string
  project_manager_name?: string
  cycle_start_date:   string
  cycle_end_date:     string
  submission_deadline: string
  company_profile:    string
  sector_id:          string
  sector_name?:       string
  is_shariah_compliant: boolean
  has_subsidiaries:   boolean
  has_sukuk:          boolean
  status:             "draft" | "active" | "in_review" | "completed" | "archived"
  created_at:         string
  updated_at:         string
}

export interface CreateCyclePayload {
  name:                 string
  fiscal_year:          number
  content_language:     "en" | "ar"
  project_manager_id:   string
  cycle_start_date:     string
  cycle_end_date:       string
  submission_deadline:  string
  company_profile:      string
  sector_id:            string
  is_shariah_compliant: boolean
  has_subsidiaries:     boolean
  has_sukuk:            boolean
}

export interface CycleOverview {
  cycle:           Cycle
  stats: {
    total_sections:     number
    completed_sections: number
    total_departments:  number
    submitted:          number
    in_progress:        number
    completion_rate:    number
  }
  departments: Array<{
    department_id:    string
    department_name:  string
    department_code:  string
    assigned_user_name?: string
    assigned_user_email?: string
    session_status:   "not_started" | "in_progress" | "submitted" | "approved"
    progress:         number
    submitted_at:     string | null
  }>
}

export interface CycleSection {
  id:                 string
  cycle_id:           string
  section_code:       string
  section_name:       string
  layer:              "common" | "cma_required" | "custom"
  mode:               "ai_written" | "upload" | "system" | "extract" | "manual"
  status:             "pending" | "locked" | "in_progress" | "completed"
  assigned_dept_id?:  string
  assigned_dept_name?: string
  word_count?:        number
}

export interface SARUser {
  id:         string
  user_id:    string
  full_name:  string
  email:      string
  role:       string
}
```

---

### Pages Already Built

These are complete — do not rebuild:

- **Cycles List Page** (`/annual-report`) — header, 4 stat tiles (Active /
  Drafts / Completed / Avg Progress), status filter tabs, search bar, and
  cycle table with PM, deadline, progress bar, status badge, and View button
- **Create Cycle Page** (`/annual-report/cycles/new`) — workflow explainer
  banner, Cycle Information (name, fiscal year, content language), Assign
  Project Manager, Timeline (start/end/deadline), Company Profile (profile
  type, sector, flags), Cancel / Create Cycle buttons
- **Cycle Detail Page** (`/annual-report/cycles/:cycleId`) — header (back
  arrow, cycle name, fiscal year, deadline, status badge, PM label, Edit
  button), 4 stat tiles (Total Departments / Submitted / In Progress /
  Completion Rate), Report Sections table with type-filter pills and
  Re-resolve action, Department Sessions table with Refresh action

---

### Edit Cycle Modal — Missing Pieces to Add

**File:** `src/pages/annual-report/CycleDetailPage.tsx` (existing Edit modal)

The Edit Cycle modal currently has: Cycle Name, Fiscal Year, Start Date,
End Date, Submission Deadline, Company Profile section (profile, sector,
flags). Two fields are missing — add them.

---

#### 1 — Add Project Manager Dropdown

Place between "Submission Deadline" and the "Company Profile" section.

```tsx
<div className="fl">
  <label className="fl-label">Project Manager *</label>
  <select
    className="sel"
    value={projectManagerId}
    onChange={e => setProjectManagerId(e.target.value)}
    required
  >
    <option value="">Select a Project Manager</option>
    {projectManagers.map(pm => (
      <option key={pm.id} value={pm.user_id}>
        {pm.full_name}
      </option>
    ))}
  </select>
</div>
```

---

#### 2 — Add Content Language Toggle

Place right after Project Manager.

```tsx
<div className="fl">
  <label className="fl-label">Content Language *</label>
  <div className="toggle-group">
    <button
      type="button"
      className={contentLanguage === "en" ? "active" : ""}
      onClick={() => setContentLanguage("en")}
    >
      English
    </button>
    <button
      type="button"
      className={contentLanguage === "ar" ? "active" : ""}
      onClick={() => setContentLanguage("ar")}
    >
      العربية
    </button>
  </div>
</div>
```

Match the styling of the Create Cycle form's existing language toggle.

---

#### 3 — Fetch PMs When Modal Opens

```ts
const [projectManagers, setProjectManagers] = useState<SARUser[]>([])

useEffect(() => {
  if (!isEditModalOpen) return
  sarUsers.listProjectManagers()
    .then(data => setProjectManagers(data.users ?? []))
    .catch(() => setProjectManagers([]))
}, [isEditModalOpen])
```

---

#### 4 — Pre-fill Form State From Cycle Data on Open

```ts
const openEditModal = () => {
  setCycleName(cycle.name)
  setFiscalYear(String(cycle.fiscal_year))
  setContentLanguage(cycle.content_language)      // NEW
  setProjectManagerId(cycle.project_manager_id)   // NEW
  setStartDate(cycle.cycle_start_date)
  setEndDate(cycle.cycle_end_date)
  setSubmissionDeadline(cycle.submission_deadline)
  setCompanyProfile(cycle.company_profile)
  setSectorId(cycle.sector_id)
  setShariahCompliant(cycle.is_shariah_compliant)
  setHasSubsidiaries(cycle.has_subsidiaries)
  setHasSukuk(cycle.has_sukuk)
  setIsEditModalOpen(true)
}
```

---

#### 5 — Update PUT Payload

When the admin clicks "Save Changes", include both new fields in the payload
sent to `sarCycles.update(cycleId, payload)`:

```ts
const payload: Partial<CreateCyclePayload> = {
  name:                 cycleName,
  fiscal_year:          parseInt(fiscalYear, 10),
  content_language:     contentLanguage,        // NEW
  project_manager_id:   projectManagerId,       // NEW
  cycle_start_date:     startDate,
  cycle_end_date:       endDate,
  submission_deadline:  submissionDeadline,
  company_profile:      companyProfile,
  sector_id:            sectorId,
  is_shariah_compliant: shariahCompliant,
  has_subsidiaries:     hasSubsidiaries,
  has_sukuk:            hasSukuk,
}

try {
  await sarCycles.update(cycle.id, payload)
  toast.success("Cycle updated successfully")
  setIsEditModalOpen(false)
  await refetchCycle()
} catch (err) {
  toast.error(err.message ?? "Failed to update cycle")
}
```

---

#### 6 — Validation

The Save Changes button must be disabled until both required fields have values:

```ts
const canSubmit = (
  cycleName.trim() !== "" &&
  fiscalYear !== "" &&
  contentLanguage &&
  projectManagerId !== "" &&         // NEW — required
  startDate !== "" &&
  endDate !== "" &&
  submissionDeadline !== "" &&
  companyProfile !== "" &&
  sectorId !== ""
)
```

---

### Routes — Already Configured

```tsx
<Route path="/annual-report" element={
  <ProtectedRoute requiredRole="admin">
    <Outlet />
  </ProtectedRoute>
}>
  <Route index element={<CyclesListPage />} />
  <Route path="cycles/new" element={<CreateCyclePage />} />
  <Route path="cycles/:cycleId" element={<CycleDetailPage />} />
</Route>
```

---

### Done Criteria

The following items are already complete:

1. Admin can navigate from sidebar "Annual Report" entry to the cycles list
2. Cycles list shows all cycles for the company with status filter, search,
   and stat tiles
3. Each cycle row navigates to detail view on click of View button
4. "+ New Cycle" button navigates to the create form
5. Create form Project Manager dropdown is populated from SAR
6. Create form Sector dropdown is populated
7. Create form validates all required fields before submit
8. Successful create stamps `company_id` from JWT and redirects to detail page
9. Cycle detail page shows all 4 stat tiles, Report Sections table with type
   pills and Re-resolve, and Department Sessions table with refresh
10. PM, department_user, and IR roles cannot access `/annual-report/*` —
    redirected to /dashboard
11. All API failures show clean error states

The following items are completed by this spec:

12. Edit Cycle modal shows the Project Manager dropdown pre-filled with the
    current PM
13. Edit Cycle modal shows the Content Language toggle pre-filled with the
    current language
14. Submitting the Edit form sends `project_manager_id` and `content_language`
    in the PUT payload along with all other editable fields
15. Save Changes button is disabled when Project Manager or Content Language
    is unset
16. After successful update, the modal closes and the cycle detail refetches
    to show the new values