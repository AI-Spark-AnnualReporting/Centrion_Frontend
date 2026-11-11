# License card: clearer when locked

**Date:** 2026-11-10
**Status:** Built 2026-11-10 (approved the same day). Licensing tests 31 passed (3 new). Not committed.
**Repo:** frontend only

## The problem (seen while testing the clock guard on-prem)

When an on-prem license is locked, the License card shows **two paste boxes**:
"License key from Centriyon" + "Activate license" AND "Unlock code from Centriyon" + "Unlock".
The admin can't tell which one to use. And the red message always says *"The license data on
this server was changed"*, even when the real reason is the server clock.

## What I checked

- Backend `activate_license_key`: pasting a new license key while locked **keeps the lock**
  ("a lock stays until an unlock code clears it"). So while locked the key box can't help.
- The API already sends `lock_reason` (`routes/license_routes.py:101`); the frontend ignores it.
  Reasons the backend can give: "Server clock was moved back", "Server clock is not moving",
  "License usage record is missing", "License usage record was changed",
  "License usage record belongs to another company".

## Changes

1. **`src/components/license/LicenseCard.tsx`** — on-prem, while `status === 'locked'`:
   show only the **Unlock code** box (hide the License key box). Not locked: as today
   (License key box only). Cloud: unchanged.
2. **`src/components/license/LicenseBanner.tsx`** — the locked message depends on the reason:
   - Clock reasons: *"The server's date and time look wrong, so new work is paused. Your reports
     stay open. Set the server clock to the correct time, then send the Lock ID to Centriyon to
     get an unlock code."*
   - Any other reason: today's text ("The license data on this server was changed, …").
   Same message on the banner and inside the card (the card reuses `pickBanner`).
3. **`src/test/licensing.test.tsx`** — 3 tests: locked on-prem shows only the unlock box;
   not locked shows only the key box; clock reason shows the clock message.

## What could break

- Nothing on the backend. A locked admin can't paste a new key from the card any more — it
  never cleared the lock anyway. After unlocking, the key box comes back.
- The on-prem frontend image (`D:\onprem-test`) needs a rebuild to show it:
  `docker compose up -d --build frontend`.

## Notes to update when done

- `Centriyon Notes/Features/Company Licensing.md`, `Current Status.md`.
