import { useEffect, useState } from 'react';
import { companies } from '@/lib/api';
import type { DepartmentSuggestionsResponse } from '@/types/company';

/* ══════════════════════════════════════════════════════════════════════
   Shared loader for a company's department suggestions.

   Three places want this: the banner on the departments page, the
   annual-cycle department picker, and the top bar's button. Each fetching
   independently would mean three requests for one answer — and, worse, the
   top-bar button could not disappear when the banner is dismissed, because
   they sit in different trees with no state between them.

   So: one promise per company, cached, plus a notify so a mutation in one
   place reaches every consumer. Small on purpose — this is not a provider,
   and nothing here needs to be mounted.

   The server does the expensive part once and persists it, so re-reading is
   cheap; caching here is about not asking twice in the same session.
═══════════════════════════════════════════════════════════════════════ */

const cache = new Map<string, Promise<DepartmentSuggestionsResponse | null>>();
const listeners = new Set<() => void>();

/** The company's suggestions, fetched at most once per company per session.
 *  Resolves to null on failure — this is advice, never worth an error state. */
export function loadDepartmentSuggestions(
  companyId: string,
): Promise<DepartmentSuggestionsResponse | null> {
  const hit = cache.get(companyId);
  if (hit) return hit;

  const pending = companies.getDepartmentSuggestions(companyId).catch(() => {
    // Evict, so a transient failure isn't cached for the rest of the session.
    cache.delete(companyId);
    return null;
  });
  cache.set(companyId, pending);
  return pending;
}

/** Drop the cached answer and tell every consumer to re-read. Call after
 *  anything that changes it: dismissing the banner, creating a department. */
export function refreshDepartmentSuggestions(companyId?: string): void {
  if (companyId) cache.delete(companyId);
  else cache.clear();
  listeners.forEach((fn) => fn());
}

/** Subscribe to refreshes. Returns an unsubscribe. */
export function subscribeDepartmentSuggestions(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** What every consumer uses. `null` while loading, on failure, or with no company. */
export function useDepartmentSuggestions(
  companyId?: string | null,
): DepartmentSuggestionsResponse | null {
  const [data, setData] = useState<DepartmentSuggestionsResponse | null>(null);

  useEffect(() => {
    if (!companyId) {
      setData(null);
      return;
    }
    let cancelled = false;
    const read = () => {
      loadDepartmentSuggestions(companyId).then((res) => {
        if (!cancelled) setData(res);
      });
    };
    read();
    const unsubscribe = subscribeDepartmentSuggestions(read);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [companyId]);

  return data;
}

/** True when there is something worth showing a user: an analysed annual report,
 *  departments still missing from it, and not dismissed. The banner and the
 *  top-bar button must agree on this, so it lives in one place. */
export function hasDepartmentSuggestions(
  data: DepartmentSuggestionsResponse | null | undefined,
): boolean {
  if (!data || data.dismissed) return false;
  return (data.suggested?.length ?? 0) > 0 && (data.missing?.length ?? 0) > 0;
}
