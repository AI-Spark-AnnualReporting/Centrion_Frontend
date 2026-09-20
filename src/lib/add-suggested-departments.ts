import { adminConsole } from '@/lib/api';
import { codeCandidates } from '@/lib/departmentCode';
import { refreshDepartmentSuggestions } from '@/lib/department-suggestions';
import type { Department } from '@/types/admin';
import type { DepartmentSuggestion } from '@/types/company';

/* ══════════════════════════════════════════════════════════════════════
   "Add all" — create every department the annual report implied that the
   company doesn't have yet, in one click.

   The product rule is unchanged: we never provision a department on our
   own initiative. This runs only when an admin presses the button, and it
   creates exactly the names shown on screen — nothing inferred, nothing
   extra.

   Everything here exists because a batch must not half-fail in a way the
   user can't recover from:

   • CODES COLLIDE, and the departments list does not tell you when.
     A deleted department is only soft-deleted (is_active=false); its row
     keeps the code, GET /admin/departments filters it out, and INSERT
     still rejects it with 400 "Department code already exists". So a code
     is picked against the live list AND retried down a candidate list
     when the server disagrees — see codeCandidates().
   • TWO SUGGESTIONS CAN WANT THE SAME CODE ("Finance", "Financial
     Planning" → both FIN). Codes are reserved in one shared set as each
     item starts, so the second one takes the next free candidate.
   • ONE FAILURE MUST NOT SINK THE REST. Every item is settled
     independently and reported back; the caller keeps the failures on
     screen, still clickable, instead of showing a dead banner.

   Creation is not cheap on the server (each POST generates the
   department's prompts through an LLM), hence the small pool rather than
   a sequential walk or a thundering herd.
═══════════════════════════════════════════════════════════════════════ */

// Parallel creates. Three keeps a 6-department batch under ~10s without firing six
// LLM prompt-generations at the backend at once.
const CONCURRENCY = 3;

// How many codes to try for one department before calling it a failure.
const MAX_ATTEMPTS = 4;

/** Per-department progress, so the caller can animate each chip as it lands. */
export type AddState = 'adding' | 'added' | 'failed';

export interface AddOutcome {
  name: string;
  ok: boolean;
  /** The code that was actually accepted. */
  code?: string;
  /** The backend's own words, when it refused. */
  error?: string;
}

export interface AddSuggestedResult {
  added: AddOutcome[];
  failed: AddOutcome[];
}

/** The backend's wording for a code clash (admin_routes.create_department). Matching on
 *  the message rather than importing ApiError keeps this testable with a mocked api. */
function isCodeTaken(message: string): boolean {
  return /already exists/i.test(message);
}

/** Codes currently in use, best effort. The server is the real authority — it re-checks
 *  on insert — so a failed read just means the first candidate is a guess. */
async function existingCodes(): Promise<string[]> {
  try {
    const res = await adminConsole.listDepartments();
    const list: Department[] = Array.isArray(res) ? res : (res?.departments ?? []);
    return list.map((d) => (d.department_code || '').toUpperCase()).filter(Boolean);
  } catch {
    return [];
  }
}

/** Run `fn` over `items` with at most `limit` in flight, results in input order. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Create every department in `items`. Resolves once they have all settled — never
 * rejects, because a partial batch is a result the caller has to show, not an error.
 *
 * @param items    the suggestions to create (the caller filters to the missing ones)
 * @param onState  per-department progress, called as each one starts and finishes
 */
export async function addSuggestedDepartments(
  items: DepartmentSuggestion[],
  opts: {
    companyId?: string | null;
    onState?: (name: string, state: AddState) => void;
  } = {},
): Promise<AddSuggestedResult> {
  const { companyId, onState } = opts;
  if (!items.length) return { added: [], failed: [] };

  const taken = new Set<string>(await existingCodes());

  // Synchronous, so two in-flight items can never reserve the same code.
  const reserve = (name: string): string => {
    const candidates = codeCandidates(name);
    for (const c of candidates) {
      if (!taken.has(c)) {
        taken.add(c);
        return c;
      }
    }
    const base = candidates[0].slice(0, 8);
    for (let n = 10; n < 100; n += 1) {
      const c = `${base}${n}`;
      if (!taken.has(c)) {
        taken.add(c);
        return c;
      }
    }
    return candidates[0]; // unreachable in practice; let the server have the last word
  };

  const createOne = async (item: DepartmentSuggestion): Promise<AddOutcome> => {
    const name = item.name;
    onState?.(name, 'adding');
    let error = 'Could not add this department.';

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const code = reserve(name);
      try {
        await adminConsole.createDepartment({
          department_code: code,
          department_name: name,
          // What the report said this department contributed — the same sentence the
          // banner is built from, and what the backend writes the department's prompts
          // against. Blank beats nothing invented.
          description: item.reason?.trim() || undefined,
        });
        onState?.(name, 'added');
        return { name, ok: true, code };
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        // Only a code clash is worth another go — a 403 or a dead backend is not.
        if (!isCodeTaken(error)) break;
      }
    }

    onState?.(name, 'failed');
    return { name, ok: false, error };
  };

  const outcomes = await pool(items, CONCURRENCY, createOne);

  // Re-read the suggestions so every consumer agrees on what is still missing: this
  // banner, and the top bar's button, which shares the cache.
  refreshDepartmentSuggestions(companyId ?? undefined);

  return {
    added: outcomes.filter((o) => o.ok),
    failed: outcomes.filter((o) => !o.ok),
  };
}
