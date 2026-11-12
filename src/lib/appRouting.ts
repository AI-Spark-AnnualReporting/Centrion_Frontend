// Cross-app routing. Which app(s) a user can land in — this app ("Centriton"/
// "Centriyon") vs. the separate external workspace app the backend calls
// "spark_studio" — is now computed per-user by the backend (`apps`/
// `default_app`), not derived from `role`. Successor to the old role-string
// check in src/lib/sar.ts (isSarRole/redirectToSar), now retired.
//
// NOTE: VITE_SAR_APP_URL is the spark_studio *app* URL, distinct from the SAR
// cycles *API* (VITE_SAR_URL / sarRequest in api.ts) — that's a separate,
// unrelated concern and is untouched by this file.

import { ApiError, auth, getToken } from "@/lib/api";
import type { AppKey } from "@/types/auth";

const APP_URLS: Record<AppKey, string> = {
  spark_studio: (import.meta.env.VITE_SAR_APP_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
  // "" — centriton_dashboard is this app itself; never redirected to externally.
  centriton_dashboard: "",
};

/** True when the server doesn't have the endpoint at all (an older backend). */
function endpointIsMissing(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 405);
}

export interface SarLinkOptions {
  /** The SAR page to land on, e.g. "/pm". */
  next?: string | null;
  /** Spark staff only: the company to act as over there. */
  company?: string | null;
  /** Where SAR's back button returns to. */
  back?: string | null;
}

// Why this is async: the SAR app gets its OWN session. Centriton asks the server
// for a new SAR refresh token and puts it after `#` in the link — the part after
// `#` is never sent to any server, so it stays out of server and proxy logs. SAR
// swaps it for a new one the moment it opens, so the copy left in browser
// history no longer works. Plan: Centriton/.claude/plans/refresh-token.md
//
// Returns null when there is no session to hand over (or the server couldn't
// make one), so the caller can do nothing rather than open a login page.
export async function buildSarHandoffUrl(options: SarLinkOptions = {}): Promise<string | null> {
  const url = APP_URLS.spark_studio;
  const accessToken = getToken();
  if (!url || !accessToken) return null;

  const qs = new URLSearchParams();
  if (options.next) qs.set("next", options.next);
  if (options.company) qs.set("company", options.company);
  if (options.back) qs.set("back", options.back);

  let sarRefreshToken: string;
  try {
    sarRefreshToken = (await auth.handoff("sar")).refresh_token;
  } catch (err) {
    // ROLLOUT ONLY — remove one release after both backends ship (plan step 6).
    // A backend without /auth/handoff yet answers 404/405: fall back to the old
    // hand-off, the access token in the query string. Any other failure (network,
    // 5xx) must NOT fall back — that would put the token back into the URL.
    if (endpointIsMissing(err)) {
      qs.set("token", accessToken);
      return `${url}/auth/token?${qs.toString()}`;
    }
    return null;
  }

  const fragment = new URLSearchParams({ refresh_token: sarRefreshToken });
  const query = qs.toString();
  return `${url}/auth/token${query ? `?${query}` : ""}#${fragment.toString()}`;
}

/** Open a SAR page in a new tab.
 *
 *  The blank tab is opened straight away, inside the click, and filled in once
 *  the link is ready — a tab opened only after waiting for the server is
 *  blocked by popup blockers. If the browser blocks it anyway, use this tab. */
export async function openSarInNewTab(options: SarLinkOptions): Promise<void> {
  const tab = window.open("", "_blank");
  if (tab) tab.opener = null;
  const link = await buildSarHandoffUrl(options);
  if (!link) {
    tab?.close();
    return;
  }
  if (tab) tab.location.href = link;
  else window.location.href = link;
}

// ProtectedRoute calls redirectToApp while rendering, so it can run several
// times before the page actually leaves. Without this every render would ask the
// server for another SAR session.
let leavingForOtherApp = false;

// Hard-redirect to the target app's hand-off page. Resolves false (no-op) when
// the target is this app itself, or the URL/session is missing, so callers can
// fall through to normal in-app navigation.
export async function redirectToApp(app: AppKey): Promise<boolean> {
  if (app === "centriton_dashboard") return false;
  if (leavingForOtherApp) return true;
  leavingForOtherApp = true;
  const link = await buildSarHandoffUrl();
  if (!link) {
    leavingForOtherApp = false;
    return false;
  }
  window.location.href = link;
  return true;
}

/** Test helper: forget that a redirect is already under way. */
export function resetRedirectGuardForTests(): void {
  leavingForOtherApp = false;
}

// A hand-off link to one page of the spark_studio app, e.g. the Annual Report
// Validator. `back` is this page, so that app's back button returns here.
export function sparkStudioUrl(path: string): Promise<string | null> {
  return buildSarHandoffUrl({ next: path, back: window.location.href });
}

// Whether this user's default_app keeps them in Centriton. Defaults to
// staying in-app when default_app is missing (e.g. a pre-migration cached
// session) rather than bouncing them out.
export function shouldStayInCentriton(user: { default_app?: AppKey | null }): boolean {
  return (user.default_app ?? "centriton_dashboard") === "centriton_dashboard";
}

/** Where to go after login: the page a logged-out visitor asked for, but only
 *  an address inside this app ("/spark/quotes"). "//other.site", "https://…",
 *  "/login" itself, or nothing → home ("/"), so a link can't send someone
 *  off-site or back to the login page. */
export function safeReturnPath(from: string | null | undefined): string {
  if (!from || !from.startsWith("/") || from.startsWith("//") || from.startsWith("/\\")) return "/";
  if (from === "/login" || from.startsWith("/login?")) return "/";
  return from;
}
