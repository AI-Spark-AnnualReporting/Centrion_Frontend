// SAR workspace app redirect. `project_manager` / `hod` / `department_user` users
// work in the separate SAR frontend app (Next.js, :3000), not in Centriyon — they're
// handed off there with their Centriyon JWT via SAR's token-passthrough page.
//
// NOTE: this is the SAR *app* URL (VITE_SAR_APP_URL), distinct from the SAR
// cycles *API* (VITE_SAR_URL / :8010 used by sarRequest in api.ts).

import { getToken } from "@/lib/api";

const SAR_APP_URL = (
  import.meta.env.VITE_SAR_APP_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");

export const isSarRole = (role?: string | null): boolean =>
  role === "project_manager" || role === "hod" || role === "department_user";

// Hard-redirect to SAR's token-passthrough page. Returns false (no-op) when the
// URL or token is missing so callers can fall through to normal navigation.
export function redirectToSar(): boolean {
  const token = getToken();
  if (!SAR_APP_URL || !token) return false;
  window.location.href = `${SAR_APP_URL}/auth/token?token=${encodeURIComponent(token)}`;
  return true;
}
