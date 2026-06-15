
# Cycle Detail — Draft State with Department Assignment (Updated)

## Scope

When a cycle is in `draft` status, the detail page shows an "Assign Departments" section where admin selects departments and assigns one responsible user per department. The Submit button calls SAR's `POST /admin/cycles/{cycle_id}/assign-departments` (bulk assignment) and then `POST /admin/cycles/{cycle_id}/activate` to activate the cycle.

## SAR Workflow Order (from backend confirmation)

The complete flow once a cycle is created in draft:

1. **POST /cycles/{id}/resolve-sections** — resolves which report sections this cycle gets (already happens at cycle creation OR via re-resolve button — admin doesn't need to call this manually for new cycles)
2. **POST /cycles/{id}/assign-departments** — admin assigns departments + users (this is the bulk endpoint)
3. **POST /cycles/{id}/activate** — flips cycle to active, generates questions from kickoff brief

Steps 2 and 3 happen when admin clicks the Submit button on the draft cycle detail page.

---

## Implementation

### File: `src/pages/annual-report/CycleDetailPage.tsx`

Conditional rendering based on cycle status:

```tsx
{cycle.status === "draft" ? (
  <AssignDepartmentsSection 
    cycle={cycle} 
    onSubmit={handleSubmitCycle} 
  />
) : (
  <DepartmentSessionsTable cycle={cycle} />
)}
```

### Header buttons

When status is `draft`, show two buttons:

```tsx
<div className="actions">
  <button className="btn bs" onClick={openEditModal}>
    <PencilIcon /> Edit
  </button>
  {cycle.status === "draft" && (
    <button 
      className="btn bp" 
      onClick={handleSubmitCycle}
      disabled={!canSubmit}
    >
      <CheckIcon /> Submit
    </button>
  )}
</div>
```

`canSubmit` = at least one department assigned AND every assigned department has a user.

---

### New Component: `AssignDepartmentsSection`

**File:** `src/components/annual-report/AssignDepartmentsSection.tsx` (new)

**Layout matches the design:**

- Card header: "Assign Departments" + subtitle
- Blue info banner: "Each department will get an AI-generated questionnaire after assignments are saved. The responsible user will fill in their department's answers."
- Search field: "Search and add departments..."
- List of assigned department rows
- Footer: "{count} department added"

**Each row:**

```
[CODE Badge] Department Name
             Responsible user                     [User dropdown ▼]  [🗑]
```

User dropdown shows users WHERE `department_id === row.department_id` AND `role === "department_user"`.

---

### Data fetching on mount

```ts
useEffect(() => {
  // 1. All active departments for the company
  sarDepartments.list()
    .then(data => setAllDepartments(data.departments ?? []))
  
  // 2. All department_users in the company
  adminConsole.listUsers({ role: "department_user" })
    .then(data => setDepartmentUsers(data ?? []))
  
  // 3. Existing assignments for this cycle (if any saved)
  // SAR has assignments in department_assignments table — read via cycle overview or new endpoint
  sarCycles.overview(cycle.id)
    .then(data => {
      // Hydrate from existing assignments
      const existing = (data.departments ?? []).map(d => ({
        department_id:    d.department_id,
        department_name:  d.department_name,
        department_code:  d.department_code,
        assigned_user_id: d.assigned_user_id ?? null,
      }))
      setAssignedDepartments(existing)
    })
}, [cycle.id])
```

---

### State

```ts
interface DepartmentAssignment {
  department_id:    string
  department_name:  string
  department_code:  string
  assigned_user_id: string | null
}

const [allDepartments,       setAllDepartments]       = useState<SARDepartment[]>([])
const [departmentUsers,      setDepartmentUsers]      = useState<AdminUserRow[]>([])
const [assignedDepartments,  setAssignedDepartments]  = useState<DepartmentAssignment[]>([])
const [searchQuery,          setSearchQuery]          = useState("")
```

---

### Add a department

Search filters available departments (not yet assigned):

```ts
const availableDepartments = allDepartments.filter(d =>
  !assignedDepartments.some(a => a.department_id === d.id) &&
  d.department_name.toLowerCase().includes(searchQuery.toLowerCase())
)
```

Click result → add to `assignedDepartments` with `assigned_user_id: null`. No backend call yet — assignments only persist on Submit.

---

### Change responsible user

```tsx
<select
  value={row.assigned_user_id ?? ""}
  onChange={e => updateAssignment(row.department_id, e.target.value)}
>
  <option value="">Select responsible user</option>
  {departmentUsers
    .filter(u => u.department_id === row.department_id)
    .map(u => (
      <option key={u.user_id} value={u.user_id}>
        {u.full_name}
      </option>
    ))
  }
</select>
```

If no users exist for that department, show inline warning:
"No department users available. Invite one from the admin portal."

---

### Remove a department

```ts
const removeDepartment = (deptId: string) => {
  setAssignedDepartments(prev => 
    prev.filter(a => a.department_id !== deptId)
  )
}
```

---

### Submit handler

This is the critical step. Calls TWO SAR endpoints in sequence:

```ts
const handleSubmitCycle = async () => {
  // Validate
  const incomplete = assignedDepartments.filter(a => !a.assigned_user_id)
  if (incomplete.length > 0) {
    toast.error("Every assigned department must have a responsible user")
    return
  }
  if (assignedDepartments.length === 0) {
    toast.error("Assign at least one department before submitting")
    return
  }
  
  try {
    setSubmitting(true)
    
    // Step 1 — Assign departments (bulk)
    await sarCycles.assignDepartments(cycle.id, {
      assignments: assignedDepartments.map(a => ({
        department_id: a.department_id,
        user_id:       a.assigned_user_id!,
      }))
    })
    
    // Step 2 — Activate the cycle (generates questions)
    await sarCycles.activate(cycle.id)
    
    toast.success("Cycle activated. AI-generated questions are being prepared.")
    await refetchCycle()  // status will now be "active"
  } catch (err) {
    toast.error(err.message ?? "Failed to activate cycle")
  } finally {
    setSubmitting(false)
  }
}
```

---

### API additions in `src/lib/api.ts`

Add to existing `sarCycles` namespace:

```ts
export const sarCycles = {
  // ... existing ...
  
  assignDepartments: (
    cycleId: string,
    body: {
      assignments: Array<{
        department_id: string
        user_id:       string
      }>
    }
  ) =>
    sarRequest<{
      success:              boolean
      message:              string
      assignments_created:  number
      assignments:          Array<{
        id:               string
        cycle_id:         string
        department_id:    string
        department_name:  string
        user_id:          string
        user_name:        string
        user_email:       string
        assigned_by:      string
        assigned_at:      string
      }>
    }>(`/api/v1/admin/cycles/${cycleId}/assign-departments`, {
      method: "POST",
      body
    }),
  
  activate: (cycleId: string) =>
    sarRequest(`/api/v1/admin/cycles/${cycleId}/activate`, {
      method: "POST"
    }),
}
```

---

### Stat tiles in draft state

The 4 stat tiles still appear but show:
- **Total Departments** — `assignedDepartments.length` (live count from local state)
- **Submitted** — 0
- **In Progress** — 0
- **Completion Rate** — 0%

Once submitted and cycle becomes active, these come from `sarCycles.overview()` as before.

---

### Error handling

SAR returns 400 for:
- Cycle not in draft (race condition — admin already submitted, now refresh)
- Insert errors
- Wrong company (broad catch)

Handle gracefully:
```ts
catch (err: any) {
  if (err.status === 400 && err.message?.includes("draft")) {
    toast.error("This cycle is no longer in draft. Refreshing...")
    await refetchCycle()
  } else {
    toast.error(err.message ?? "Failed to assign departments")
  }
}
```

---

## Done Criteria

1. Draft cycle detail page shows "Assign Departments" section instead of Department Sessions table
2. Search field filters departments (only shows unassigned)
3. Adding a department creates a row with empty user assignment
4. User dropdown per row only shows department_users assigned to that department
5. Removing a department clears it from state immediately
6. Submit button is disabled when no departments OR any department has no user
7. Clicking Submit calls `POST /admin/cycles/{id}/assign-departments` THEN `POST /admin/cycles/{id}/activate` in sequence
8. On success, cycle status flips to `active` and the page re-renders showing Department Sessions table
9. Stat tiles in draft show live count of assigned departments
10. Race condition handled: if cycle is already activated by another admin, show error and refresh
11. Warning shown when a department has no available users
12. Each "Edit" still works in draft state for changing basic cycle info

