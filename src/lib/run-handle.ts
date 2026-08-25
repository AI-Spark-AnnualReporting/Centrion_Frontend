// A pure guard, deliberately NOT in @/lib/api.
//
// Every screen test mocks that module wholesale, so anything living there is
// undefined unless each test file remembers to re-export it -- and a guard that
// silently becomes undefined is worse than no guard, because the call throws into
// a catch and the screen quietly takes the failure path. This has no dependencies
// and nothing to mock, so it stays real in every test.

/**
 * The live run behind a produce handle, or null when the server started nothing.
 *
 * A "nothing to do" answer comes back as a handle with null fields, and storing
 * that as if it were a run is what put a loading screen over a job that did not
 * exist. Two of three earnings call sites had already forgotten the check, and
 * the board pages never had one, so it lives here now: a caller either gets a run
 * it can watch, or null and an obligation to move on.
 *
 * Runtime, not a type. This project builds with strictNullChecks off, so a type
 * here would be documentation rather than enforcement -- which is exactly how the
 * null flowed into a field declared `string` in the first place.
 */
export function startedRun(
  handle: { run_id?: string | null; poll_url?: string | null } | null | undefined,
): { run_id: string; poll_url: string } | null {
  if (!handle?.run_id || !handle?.poll_url) return null;
  return { run_id: handle.run_id, poll_url: handle.poll_url };
}
