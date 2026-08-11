// Cross-app routing. Which app(s) a user can land in — this app ("Centriton"/
// "Centriyon") vs. the separate external workspace app the backend calls
// "spark_studio" — is now computed per-user by the backend (`apps`/
// `default_app`), not derived from `role`. Successor to the old role-string
// check in src/lib/sar.ts (isSarRole/redirectToSar), now retired.
//
// NOTE: VITE_SAR_APP_URL is the spark_studio *app* URL, distinct from the SAR
// cycles *API* (VITE_SAR_URL / sarRequest in api.ts) — that's a separate,
// unrelated concern and is untouched by this file.

import { getToken } from "@/lib/api";
import type { AppKey } from "@/types/auth";

const APP_URLS: Record<AppKey, string> = {
  spark_studio: (import.meta.env.VITE_SAR_APP_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
  // "" — centriton_dashboard is this app itself; never redirected to externally.
  centriton_dashboard: "",
};

// Hard-redirect to the target app's token-passthrough page. Returns false
// (no-op) when the target is this app itself, or the URL/token is missing, so
// callers can fall through to normal in-app navigation.
export function redirectToApp(app: AppKey): boolean {
  if (app === "centriton_dashboard") return false;
  const url = APP_URLS[app];
  const token = getToken();
  if (!url || !token) return false;
  window.location.href = `${url}/auth/token?token=${encodeURIComponent(token)}`;
  return true;
}

// Whether this user's default_app keeps them in Centriton. Defaults to
// staying in-app when default_app is missing (e.g. a pre-migration cached
// session) rather than bouncing them out.
export function shouldStayInCentriton(user: { default_app?: AppKey | null }): boolean {
  return (user.default_app ?? "centriton_dashboard") === "centriton_dashboard";
}
