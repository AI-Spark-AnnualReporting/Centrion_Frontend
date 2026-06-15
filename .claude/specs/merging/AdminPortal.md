
# Part 5 — Admin Portal
## Centriton Spec for Claude Code (Backend + Frontend)
 
---
 
### Context
 
Build the Admin Console shown in the three UI designs. It is a separate
section of the Centriton frontend accessible only to users with
`role = 'admin'`. It has its own navigation, its own routes, and a
"Back to platform" button that returns to the main dashboard.
 
The three screens to build:
1. **Overview** — stats, activity feed, system health, 


 attention
2. **Users & Roles** — user list with invite + role management
3. **Permission Matrix** — capability grid per role (toggle view of Users & Roles)
A fourth screen — **Departments** — is in scope but the UI design is not
provided. Build it as a simple list + create/edit/delete.
 
---
 
### Role Display Names
 
Backend role names stay unchanged. The frontend maps them to display names:
 
| Backend role | Display name | Description | Badge color |
|---|---|---|---|
| `admin` | Admin | Full platform & user control | Dark/black |
| `project_manager` | Analyst | Builds and generates reports | Teal |
| `department_user` | Reviewer | Reviews, edits, approves content | Purple |
| `ir` | Viewer | Read-only access to published reports | Light gray |
 
Store this mapping in a constants file. Never hardcode display names inline.
 
---
### Frontend Changes
 
---
 
#### 1. Sidebar — Admin Console entry point
 
In `src/components/layout/Sidebar.tsx`, add an "Admin Console" button
visible only when `user.role === 'admin'`. Place it at the bottom of the
sidebar above the user profile section, separated by a divider.
 
```tsx
{user.role === 'admin' && (
  <>
    <div className="sb-divider" />
    <button
      onClick={() => navigate('/admin-console')}
      className={`sb-item ${location.pathname.startsWith('/admin-console') ? 'act' : ''}`}
    >
      <Settings size={18} />
      <span className="sb-lname">Admin Console</span>
    </button>
  </>
)}
```
 
---
 
#### 2. New routes in `src/App.tsx`
 
The admin console has its own layout (no AppLayout — it has its own
top bar and sidebar). Add these routes outside the AppLayout wrapper:
 
```tsx
<Route path="/admin-console" element={
  <ProtectedRoute requiredRole="admin">
    <AdminConsoleLayout />
  </ProtectedRoute>
}>
  <Route index element={<AdminOverviewPage />} />
  <Route path="users" element={<AdminUsersPage />} />
  <Route path="departments" element={<AdminDepartmentsPage />} />
</Route>
```
 
---
 
#### 3. `src/components/admin/AdminConsoleLayout.tsx` (new)
 
The shell for the admin console. Has its own sidebar and topbar.
 
**Top bar:**
- Left: "Admin Console" title + current sub-page name
- Right: "← Back to platform" button (navigates to `/dashboard`) + notifications bell + user avatar showing "Super admin" label
**Left sidebar (narrow, ~200px):**
- Overview
- Users & Roles
- Departments
The sidebar collapses when inside admin console and shows only these items.
Regular Centriton nav is hidden. Use `<Outlet />` for the content area.
 
---
 
#### 4. `src/pages/admin/AdminOverviewPage.tsx` (new)
 
Calls `GET /admin/overview` on mount. Renders:
 
**4 stat cards (top row):**
- Active users: "9 of 12 seats" with "+2 this month" in green
- Reports this quarter: count with "+18% QoQ" in green
- Document storage: "142 GB of 500 GB · 28% used"
- Pending actions: count with "2 invites · 2 onboarding · Needs review" in amber
**Reports generated chart (left, ~60% width):**
- Bar chart using recharts
- X axis: last 12 quarter labels (Q4'23 … Q3'26)
- Y axis: report count
- Latest bar highlighted in teal, rest in primary indigo
- Title: "Reports generated" + "Trailing 12 quarters" subtitle
- Top right chip: "+18% QoQ" green badge
**System health panel (right, ~40% width):**
- Title: "System health"
- List of integration items with name, uptime %, status badge
- Status badge: "Operational" (green), "Degraded" (amber), "Down" (red)
- "View integrations →" link at bottom
- For now, hardcode 4 items matching the design. Make it data-driven later.
**Recent activity feed (left, ~60% width):**
- Title: "Recent activity" + "Full audit log →" link
- Each row: colored dot + user name + action text + type badge (USER/REPORT/SYSTEM) + timestamp
- Type badge colors: USER=indigo, REPORT=teal, SYSTEM=gray
- Show last 10 items
**Needs attention panel (right, ~40% width):**
- Title: "Needs attention"
- Clickable rows with icon + title + description + chevron
- Items: invites pending, companies onboarding, integration failures, seat usage
- Each row navigates to the relevant section on click
---
 
#### 5. `src/pages/admin/AdminUsersPage.tsx` (new)
 
Two views toggled by buttons in the top right:
- **Users view** (default) — Image 2
- **Permission matrix view** — Image 3
**Users view:**
 
Top section — 4 role summary cards in a row:
```
Admin (1)              Analyst (3)           Reviewer (3)          Viewer (3)
Full platform...       Builds and generates  Reviews, edits...     Read-only...
```
Each card is clickable and filters the table below to that role.
 
Filter tabs: All | Active | Invited | Suspended (with counts)
 
Search input: "Search name or email"
 
Table columns: USER | ROLE | COMPANY | LAST ACTIVE | REPORTS | (chevron)
 
- USER: avatar with initials + full name + email
- ROLE: colored badge using the display name mapping
- COMPANY: company name (all users belong to the same company — show company name or "—")
- LAST ACTIVE: relative time ("Active now", "12 min ago", "Yesterday", "2 days ago") or "—"
- REPORTS: count or "—"
- Status override badges: "Invited" (orange) or "Suspended" (red) replace LAST ACTIVE when applicable
- Chevron: clicking a row opens a slide-out panel or expands inline with user details + actions
**Row actions (accessible from chevron/expanded row):**
- Change role — dropdown of all roles except admin (admin role cannot be assigned to others)
- Suspend user / Reactivate user
- Copy invite link (for invited users)
**Invite user modal** (opened by "+ Invite user" button):
- Fields: Full name (required), Email (required), Role (required — dropdown)
- Submit → POST /admin/users/invite
- On success: show a modal with the temp password — large, copyable, clear warning "This password will only be shown once"
**Permission matrix view:**
 
Top section — same 4 role summary cards (clicking highlights the column)
 
Matrix table:
- Rows grouped by section (REPORTING, DATA, ADMINISTRATION)
- Columns: CAPABILITY | Admin | Analyst | Reviewer | Viewer
- Admin column: all checked with a grey non-interactive checkbox (locked)
- Other columns: interactive checkboxes (teal when checked, light gray × when unchecked)
- Footer note: "Admin retains all capabilities and can't be restricted. Changes apply to every user with that role."
- Auto-save on checkbox toggle (PUT /admin/permissions after each change, debounced 500ms)
---
 
#### 6. `src/pages/admin/AdminDepartmentsPage.tsx` (new)
 
Simple list page (no specific design provided — use existing Centriton card style):
 
- Page title: "Departments"
- "+ New Department" button top right
- Table/card list: department code, name, description, member count, active status, edit/delete actions
- Create/edit: inline form or slide-out panel with fields: code (uppercase, max 10 chars), name, description
- Delete: confirm dialog
---
 
#### 7. API client additions in `src/lib/api.ts`
 
Add an `adminConsole` namespace:
 
```ts
export const adminConsole = {
  overview:           () => request("/api/v1/admin/overview"),
  listUsers:          (params?) => request("/api/v1/admin/users", { query: params }),
  inviteUser:         (payload) => request("/api/v1/admin/users/invite", { method: "POST", body: payload }),
  updateRole:         (userId, role) => request(`/api/v1/admin/users/${userId}/role`, { method: "PATCH", body: { role } }),
  updateStatus:       (userId, status) => request(`/api/v1/admin/users/${userId}/status`, { method: "PATCH", body: { status } }),
  getPermissions:     () => request("/api/v1/admin/permissions"),
  savePermissions:    (payload) => request("/api/v1/admin/permissions", { method: "PUT", body: payload }),
  listDepartments:    () => request("/api/v1/admin/departments"),
  createDepartment:   (payload) => request("/api/v1/admin/departments", { method: "POST", body: payload }),
  updateDepartment:   (id, payload) => request(`/api/v1/admin/departments/${id}`, { method: "PATCH", body: payload }),
}
```
 
---
 
### What Must NOT Change
 
- The existing `admin.*` functions in `src/lib/api.ts` — they are used by
  existing Centriton pages. Add the new `adminConsole` namespace alongside them.
- Centriton's flat architecture — `admin_routes.py` calls `db.table()` directly
- Existing `GET /admin/users`, `PATCH /admin/users/{id}/role`,
  `PATCH /admin/users/{id}/status` endpoints — if they already exist and work,
  update them to match the new response shape rather than replacing them
- `roles_permissions` table structure — only add rows, never change the schema
---
 
### Done Criteria
 
1. "Admin Console" button appears in sidebar only for `role = 'admin'`
2. Clicking it opens the admin console overview (Image 1 layout)
3. "Back to platform" returns to `/dashboard`
4. Overview stats are real data from the DB — not hardcoded
5. Recent activity shows last 10 audit log entries for the company
6. Users & Roles page lists all company users with correct role badges
7. Filter tabs (All/Active/Invited/Suspended) filter the table correctly
8. "+ Invite user" creates a user and shows the temp password exactly once
9. Changing a user's role updates the DB and refreshes the table
10. Suspending a user sets `status = 'suspended'`
11. Admin cannot change their own role
12. Permission matrix loads the saved permissions (or defaults on first load)
13. Toggling a checkbox saves to `roles_permissions` within 500ms
14. Admin checkboxes are always checked and not interactive
15. Departments page lists, creates, and edits departments scoped to the company
16. Non-admin users navigating to `/admin-console` are redirected to `/dashboard`
