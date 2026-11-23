import { getAuthToken, reports as reportsApi } from '@/lib/api';

/* ══════════════════════════════════════════════════════════════════════
   Shared loaders for the Command Center (Home + ESG tabs).

   Home's Disclosure Timeline, Active Reports and ESG Comparisons cards and the
   ESG tab each fetched the same reports list: 4-5 identical ~1-2 s requests
   per Home → ESG trip, run one after another, with the ESG tab's copy last.
   And every switch back to the ESG tab re-fetched its coverage (~2 s)
   (QA audit CC-02).

   So: one request at a time per company, the list reused for 30 s. Same
   small pattern as lib/license-cache.ts.
   Only the dashboard uses these; report pages still fetch fresh.

   The key includes the login token, so a different user on the same browser
   never sees another login's data (the company id is already in the key).
═══════════════════════════════════════════════════════════════════════ */

export const REPORT_LIST_FRESH_FOR_MS = 30_000;

interface CacheEntry {
  request: Promise<unknown>;
  storedAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Returns the shared request for `key`, starting a new one when missing or older than `freshForMs`. */
function loadShared<T>(key: string, freshForMs: number, start: () => Promise<T>): Promise<T> {
  const fullKey = `${getAuthToken() ?? ''}|${key}`;
  const hit = cache.get(fullKey);
  if (hit && Date.now() - hit.storedAt < freshForMs) return hit.request as Promise<T>;

  const request = start();
  cache.set(fullKey, { request, storedAt: Date.now() });
  request.catch(() => {
    // Forget the failure (unless a newer request has replaced it already).
    if (cache.get(fullKey)?.request === request) cache.delete(fullKey);
  });
  return request;
}

/** The company's reports list (GET /reports/{companyId}), shared by the dashboard cards. */
export function loadDashboardReportList<T>(companyId: string): Promise<T> {
  return loadShared(`list|${companyId}`, REPORT_LIST_FRESH_FOR_MS, () => reportsApi.list<T>(companyId));
}

/** Forget everything, so the next read asks the server. */
export function clearDashboardCache(): void {
  cache.clear();
}
