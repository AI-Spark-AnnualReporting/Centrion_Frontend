import { getAuthToken, license } from '@/lib/api';
import { getActingCompany } from '@/lib/acting-company';
import type { CompanyLicense } from '@/types/license';

/* ══════════════════════════════════════════════════════════════════════
   Shared loader for the company's license (GET /api/v1/admin/license).

   Three places want it on almost every admin page: the sidebar (which modules
   to show), the license banner, and the Admin Console's License card. Each
   fetched it on its own, so one page view asked for the same answer 3-4 times.
   The request takes ~3-4 s on the deployed backend and the browser runs
   identical requests one after another, so the License card waited ~11 s
   (QA audit AC-04).

   So: one request at a time, reused for FRESH_FOR_MS, and a notify so an
   activate / unlock in one place reaches every consumer at once. Same small
   pattern as lib/department-suggestions.ts — not a provider, nothing to mount.

   The cache key is the login token + the acting company, so a different user
   on the same browser, or Spark staff switching client, never sees another
   company's license. The real limits are always enforced by the server; this
   only decides how often the screens re-ask.
═══════════════════════════════════════════════════════════════════════ */

// How long an answer is reused before the next caller asks the server again.
export const LICENSE_FRESH_FOR_MS = 30_000;

interface CacheEntry {
  request: Promise<CompanyLicense>;
  storedAt: number;
}

const cache = new Map<string, CacheEntry>();
const listeners = new Set<(next: CompanyLicense) => void>();

/** Whose license a request would return: this login, as this acting company. */
function currentCacheKey(): string {
  return `${getAuthToken() ?? ''}|${getActingCompany()?.id ?? ''}`;
}

function notifyListeners(next: CompanyLicense): void {
  listeners.forEach((fn) => fn(next));
}

/**
 * The company's license. Callers within LICENSE_FRESH_FOR_MS share one request
 * (including one still in flight). `fresh: true` always asks the server — used
 * by the banner's "waiting for activation" recheck. A failed request is not
 * kept: the error goes to the caller and the next call tries again.
 */
export function loadCompanyLicense(options: { fresh?: boolean } = {}): Promise<CompanyLicense> {
  const key = currentCacheKey();
  const hit = cache.get(key);
  const stillFresh = hit !== undefined && Date.now() - hit.storedAt < LICENSE_FRESH_FOR_MS;
  if (hit && stillFresh && !options.fresh) return hit.request;

  const request = license.get();
  cache.set(key, { request, storedAt: Date.now() });
  request.then(notifyListeners, () => {
    // Forget the failure (unless a newer request has replaced it already).
    if (cache.get(key)?.request === request) cache.delete(key);
  });
  return request;
}

/** Store a license the server just returned (after activate / unlock) and show it everywhere. */
export function setCompanyLicense(next: CompanyLicense): void {
  cache.set(currentCacheKey(), { request: Promise.resolve(next), storedAt: Date.now() });
  notifyListeners(next);
}

/** Forget every cached license, so the next read asks the server (after a plan payment). */
export function clearCompanyLicense(): void {
  cache.clear();
}

/** Be told whenever a newer license arrives. Returns an unsubscribe. */
export function subscribeCompanyLicense(fn: (next: CompanyLicense) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
