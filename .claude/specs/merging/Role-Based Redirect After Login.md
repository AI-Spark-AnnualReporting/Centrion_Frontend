
# Frontend — Role-Based Redirect After Login

## Scope

After successful login, `project_manager` and `department_user` roles must be automatically redirected to SAR with their JWT. They should never land on Centriton's dashboard. `admin` and `ir` roles continue to Centriton normally.

## Implementation

### File: `src/context/AuthContext.tsx`

In the `login()` function — after the JWT is received and user is set — check the role and redirect if needed.

```ts
const login = async (email: string, password: string) => {
  const response = await auth.login({ email, password })
  
  const token = response.access_token
  const userData = response.user
  
  // Store token and user
  localStorage.setItem("centriton_token", token)
  setUser(userData)
  
  // Role-based redirect for PM and department_user
  if (userData.role === "project_manager" || userData.role === "department_user") {
    const sarUrl = (import.meta.env.VITE_SAR_URL ?? "").replace(/\/+$/, "")
    if (sarUrl) {
      window.location.href = `${sarUrl}?token=${token}`
      return  // Stop further execution — page is navigating away
    }
  }
  
  // admin and ir continue normally
  navigate("/dashboard")
}
```

### File: `src/pages/auth/AuthPages.tsx` (or wherever the login submit handler is)

If there's a `navigate("/dashboard")` call AFTER `login()` resolves, remove it — the redirect now happens inside `login()` itself. Keep the navigation only for the post-onboarding and post-change-password flows.

### Edge case 1 — Token passthrough on first time

When PM/dept_user is redirected to SAR with `?token=<jwt>`, SAR's `app/auth/token/page.tsx` (built in Part 2) takes that token, stores it in SAR's localStorage, calls `/auth/me`, and lands them on their SAR dashboard.

This is already wired up. No SAR changes needed.

### Edge case 2 — Direct URL access

If a PM or dept_user has a Centriton URL bookmarked (e.g. `/dashboard`), `ProtectedRoute` should also bounce them to SAR — not just login.

In `src/components/ProtectedRoute.tsx`, add this check before the existing onboarding and role guards:

```tsx
// After user is loaded, before any other checks:
if (user && (user.role === "project_manager" || user.role === "department_user")) {
  const sarUrl = (import.meta.env.VITE_SAR_URL ?? "").replace(/\/+$/, "")
  const token = localStorage.getItem("centriton_token")
  if (sarUrl && token) {
    window.location.href = `${sarUrl}?token=${token}`
    return null  // Render nothing while redirect happens
  }
}
```

This ensures PM/dept_user can never view Centriton's main interface, regardless of how they got there.

### Edge case 3 — Change password flow

When a newly invited PM/dept_user logs in with their temp password, they need to change it first. Do NOT redirect them to SAR until after they've changed their password.

The existing `must_change_password` flow already handles this — `AuthPages.tsx` redirects to `/change-password`, and `ProtectedRoute` locks them there until they update it.

So the redirect logic should also check `must_change_password`:

```ts
// Inside login() function:
if (userData.role === "project_manager" || userData.role === "department_user") {
  // Don't redirect if they need to change password first
  if (userData.must_change_password) {
    navigate("/change-password")
    return
  }
  
  const sarUrl = (import.meta.env.VITE_SAR_URL ?? "").replace(/\/+$/, "")
  if (sarUrl) {
    window.location.href = `${sarUrl}?token=${token}`
    return
  }
}
```

After they change their password, the `/change-password` page should also do the same check before redirecting them somewhere — but cleaner to just navigate to `/dashboard` and let `ProtectedRoute` bounce them to SAR from there (using the Edge case 2 logic).

### Edge case 4 — Already on dashboard, logged in

If a PM/dept_user is already logged in and lands on `/dashboard` directly (refresh, bookmark, etc.), `ProtectedRoute` will catch it (Edge case 2) and bounce them. Same path.

## Environment

Make sure `VITE_SAR_URL` is set in Centriton's `.env.local`:

```env
VITE_SAR_URL=http://localhost:3000
```

For production, point this at the deployed SAR URL.

## Done Criteria

1. PM logs in to Centriton → automatically lands in SAR PM dashboard, never sees Centriton UI
2. Department user logs in to Centriton → automatically lands in SAR department dashboard, never sees Centriton UI
3. Admin logs in → stays on Centriton dashboard normally
4. IR user logs in → stays on Centriton dashboard normally
5. PM/dept_user with a Centriton URL bookmarked → bounced to SAR via ProtectedRoute
6. Newly invited PM/dept_user with temp password → goes to `/change-password` first, then to SAR after password change
7. SAR's token passthrough page accepts the JWT and lands them on the correct role dashboard

