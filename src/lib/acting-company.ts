// The company a `spark_internal` (Spark staff) session is currently acting on.
//
// Spark accounts carry no company of their own, so they pick one from the
// directory at /companies and every subsequent request names it in the
// X-Company-Id header. The backend swaps it onto the caller for the duration of
// that request (Centriton auth.py::_acting_company_id, SAR
// app/api/dependencies.py::_acting_company_id) and ignores the header outright
// for every other role — which is the whole security of the feature.
//
// Lives here rather than in a React context because `request()` in lib/api.ts is
// a plain module function with no access to React, and it is the one place every
// call funnels through. AuthContext mirrors this value into state for the UI.
//
// Cleared by logout() alongside the token and user keys.

const ACTING_COMPANY_KEY = "centriton_acting_company";

export interface ActingCompany {
  id: string;
  name: string;
}

/**
 * The company this session is acting on, or null.
 *
 * Reads storage on EVERY call and never memoises. A module-level cache would go
 * stale the moment the user switches company in another tab, and the next write
 * from this tab would land on the wrong tenant.
 */
export function getActingCompany(): ActingCompany | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(ACTING_COMPANY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActingCompany;
    if (!parsed?.id) return null;
    return { id: parsed.id, name: parsed.name ?? "" };
  } catch {
    return null;
  }
}

export function setActingCompany(company: ActingCompany): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(ACTING_COMPANY_KEY, JSON.stringify(company));
  } catch {
    /* storage full / disabled — the switch just won't survive a reload */
  }
}

export function clearActingCompany(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(ACTING_COMPANY_KEY);
  } catch {
    /* ignore */
  }
}
