// When a logged-in user's permissions are asked for again, so a plan bought (or
// changed) while they're logged in reaches them without a reload. The admin
// who pays already gets them at once; this is for everyone else in the company.
// Plan: Centrion_Frontend/.claude/plans/subscription-refresh-and-banner.md

import type { AuthUser } from "@/types/auth";

/** Every 5 minutes while the tab is visible. */
export const REFRESH_EVERY_MS = 5 * 60 * 1000;

/** Coming back to the tab asks again, but not more than once a minute. */
export const MIN_GAP_ON_FOCUS_MS = 60 * 1000;

type PermissionFields = Pick<AuthUser, "permissions" | "visible_features" | "apps" | "default_app">;

/** True when nothing the screens use changed, so the saved user can stay as it is
 *  (replacing it would make every page draw again for nothing). */
export function samePermissions(a: PermissionFields | null | undefined, b: PermissionFields): boolean {
  if (!a) return false;
  return (
    JSON.stringify(a.permissions ?? null) === JSON.stringify(b.permissions ?? null) &&
    JSON.stringify(a.visible_features ?? null) === JSON.stringify(b.visible_features ?? null) &&
    JSON.stringify(a.apps ?? null) === JSON.stringify(b.apps ?? null) &&
    (a.default_app ?? null) === (b.default_app ?? null)
  );
}
