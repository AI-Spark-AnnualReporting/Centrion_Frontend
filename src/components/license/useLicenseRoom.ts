// How much room the company's license has left for one kind of thing — users
// ("seats") or one report type — so a create button can warn and grey itself
// out before the server refuses.
//
// The server still checks every create (licensing.py). This is only an early
// warning, so it fails OPEN: while loading, or if GET /license/usage fails,
// nothing is blocked and the server's own message still shows if it refuses.
//
// Plan: Centriton/.claude/plans/company-licensing.md (round 16)

import { useCallback, useEffect, useState } from 'react';
import { license } from '@/lib/api';
import type { LicenseStatus, LicenseUsage, PeopleUsage } from '@/types/license';

export type RoomTone = 'ok' | 'low' | 'full';

export interface LicenseRoom {
  blocked: boolean;
  tone: RoomTone | null;  // null = nothing to show
  hint: string;           // the small tag, e.g. "2 seats left (14 of 16)"
  reason: string;         // hover text on a greyed-out button
  canRequest: boolean;    // cloud admin: show "Request more"
  askAdmin: boolean;      // not an admin: show "Ask your admin"
  limitReached?: string;  // set only when a number limit is full: "used / limit", e.g. "1 / 1"
  requestSentOn?: string; // an upgrade request is already open: its date, e.g. "2026-11-03"
}

const NOTHING: LicenseRoom = { blocked: false, tone: null, hint: '', reason: '', canRequest: false, askAdmin: false };

// "Almost full" for users: this many seats left or fewer.
const FEW_SEATS_LEFT = 3;

const NOT_ACTIVE_HINT: Record<Exclude<LicenseStatus, 'active'>, string> = {
  none: 'No license yet',
  expired: 'License expired',
  locked: 'License locked',
  invalid: 'License key not valid',
  not_started: 'License not started',
};

const NOT_ACTIVE_REASON: Record<Exclude<LicenseStatus, 'active'>, string> = {
  none: "Your company doesn't have a license yet. Contact Centriyon.",
  expired: 'Your license has expired. Existing work stays open; new work needs a renewed license. Contact Centriyon.',
  locked: 'The license check failed, so new work is paused. Existing work stays open. Contact Centriyon.',
  invalid: "This license key isn't for this company or server. Existing work stays open. Contact Centriyon.",
  not_started: "Your license hasn't started yet.",
};

const PEOPLE_NAMES: [keyof PeopleUsage, string][] = [
  ['pms', 'PMs'], ['ir_users', 'IR users'], ['departments', 'Departments'], ['department_users', 'Department users'],
];

/** "PMs 1/2 · IR users 1/1 · Departments 2/3 · Department users 5/8" — room per limit. */
export function peopleHint(people: PeopleUsage): string {
  const parts: string[] = [];
  for (const [key, name] of PEOPLE_NAMES) {
    const { used, max } = people[key];
    if (max != null) parts.push(`${name} ${used}/${max}`);
  }
  return parts.join(' · ');
}

/** True when any one people limit (PMs, IR users, …) is full. */
function anyPeopleLimitFull(people: PeopleUsage): boolean {
  return PEOPLE_NAMES.some(([key]) => people[key].max != null && people[key].used >= (people[key].max as number));
}

/** The users limit. The total decides whether Invite is blocked; with the
 *  per-role numbers the tag shows each one (the server refuses a full role). */
function seatsRoom(usage: LicenseUsage): Omit<LicenseRoom, 'askAdmin'> {
  const seats = usage.seats;
  if (!seats || seats.max == null) return NOTHING;
  const { used, max } = seats;
  const canRequest = !!usage.can_request;
  if (used >= max) {
    return {
      blocked: true, tone: 'full', canRequest, limitReached: `${used} / ${max}`,
      hint: `User limit reached (${used} / ${max})`,
      reason: `Your license allows ${max} users and all ${max} are in use. Deactivate a user or ask Centriyon for more.`,
    };
  }
  const left = max - used;
  if (usage.people) {
    const tone = left <= FEW_SEATS_LEFT || anyPeopleLimitFull(usage.people) ? 'low' : 'ok';
    return { blocked: false, tone, canRequest, reason: '', hint: peopleHint(usage.people) };
  }
  if (left <= FEW_SEATS_LEFT) {
    return {
      blocked: false, tone: 'low', canRequest, reason: '',
      hint: `${left} seat${left === 1 ? '' : 's'} left (${used} of ${max})`,
    };
  }
  return { blocked: false, tone: 'ok', canRequest, reason: '', hint: `${used} of ${max} users` };
}

/** One report type's limit. `label` is how the type is named, e.g. "Board Report". */
function reportRoom(usage: LicenseUsage, reportType: string, label: string): Omit<LicenseRoom, 'askAdmin'> {
  const entry = usage.reports?.[reportType];
  if (!entry) return NOTHING;
  const canRequest = !!usage.can_request;
  if (!entry.module_on) {
    return {
      blocked: true, tone: 'full', canRequest,
      hint: 'Not in your license',
      reason: `${label} isn't in your license. Contact Centriyon.`,
    };
  }
  if (entry.limit == null) {
    return { blocked: false, tone: 'ok', canRequest, reason: '', hint: 'Unlimited' };
  }
  const { used, limit } = entry;
  if (used >= limit) {
    return {
      blocked: true, tone: 'full', canRequest, limitReached: `${used} / ${limit}`,
      hint: `Limit reached (${used} / ${limit})`,
      reason: `Your license allows ${limit} ${label} this period and all ${limit} are used. Existing ones stay open. Ask Centriyon to raise the limit.`,
    };
  }
  if (limit - used === 1) {
    return { blocked: false, tone: 'low', canRequest, reason: '', hint: `Last one left (${used} of ${limit})` };
  }
  return { blocked: false, tone: 'ok', canRequest, reason: '', hint: `${used} of ${limit} used` };
}

/** Room left for `kind` ("seats" or a report type). Pure, so it's easy to test. */
export function roomFor(usage: LicenseUsage | null, kind: string, label = ''): LicenseRoom {
  if (!usage || usage.unlimited) return NOTHING;
  return {
    ...roomForLicensed(usage, kind, label),
    askAdmin: usage.is_admin === false,
    requestSentOn: usage.upgrade_requested_at ? usage.upgrade_requested_at.slice(0, 10) : undefined,
  };
}

function roomForLicensed(usage: LicenseUsage, kind: string, label: string): Omit<LicenseRoom, 'askAdmin'> {
  const status = usage.status ?? 'active';
  if (status !== 'active') {
    return {
      blocked: true, tone: 'full', canRequest: !!usage.can_request,
      hint: NOT_ACTIVE_HINT[status],
      reason: usage.message || NOT_ACTIVE_REASON[status],
    };
  }
  return kind === 'seats' ? seatsRoom(usage) : reportRoom(usage, kind, label);
}

/** Load the license usage once when the page opens; `refresh()` after a
 *  successful create so the count moves on. */
export function useLicenseRoom(kind: string, label = ''): LicenseRoom & { refresh: () => void } {
  const [usage, setUsage] = useState<LicenseUsage | null>(null);

  const refresh = useCallback(() => {
    let request: Promise<LicenseUsage | undefined>;
    try {
      // Promise.resolve: a test mock may return nothing at all.
      request = Promise.resolve(license.usage());
    } catch {
      return; // no usage call available (e.g. a test mock): fail open
    }
    request.then((next) => setUsage(next ?? null)).catch(() => setUsage(null));
  }, []);

  useEffect(refresh, [refresh]);

  // Back to this tab (e.g. after reading Centriyon's reply): check again, so a
  // raised limit shows without a refresh.
  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshWhenVisible);
    return () => {
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshWhenVisible);
    };
  }, [refresh]);

  return { ...roomFor(usage, kind, label), refresh };
}
