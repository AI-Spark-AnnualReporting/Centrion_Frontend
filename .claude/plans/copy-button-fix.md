# Copy buttons — make them work everywhere (Server ID / Client ID and the rest)

**Date:** 2026-11-26
**Repo:** frontend only
**Status:** Done (2026-11-26) — all tests pass, not committed

## The problem in plain words

Every Copy button in the app uses `navigator.clipboard.writeText(...)`.
Browsers only give pages `navigator.clipboard` on a **secure page**: `https://...` or `http://localhost`.

An on-premises client opens the app as `http://<server-ip>:8081` (plain http, not localhost).
On that page `navigator.clipboard` is `undefined`, so:

- **Client ID / Server ID "Copy" box on the License card** (`CopyBox`) — the error is caught and nothing happens. No "Copied", nothing in the clipboard. This is the bug you saw.
- **"Copy Client ID" / "Copy Lock ID" in the License banner** — instead of copying, it just scrolls to the License card. Looks like the button is broken.
- Most other Copy buttons fail the same silent way.

Example: Admin opens `http://192.168.1.20:8081`, clicks Copy next to the Client ID → nothing happens. On `https://app.centriyon...` the same button works fine.

## Audit — every copy button in the app

| # | Where | File | Today on http (non-secure) |
|---|-------|------|----------------------------|
| 1 | License card — Client ID, license key, unlock code boxes | `src/components/spark/CopyBox.tsx` | Silent, nothing copied |
| 2 | License banner — Copy Client ID / Copy Lock ID | `src/components/license/LicenseBanner.tsx:288` | Scrolls to card instead of copying |
| 3 | Spark — generated license key | `src/pages/spark/SparkLicenseKeyPage.tsx:384` | Silent. Also "Copied" never resets back to "Copy" |
| 4 | Spark — company logins email chip | `src/pages/spark/CompanyLoginsDialog.tsx:353` | Silent |
| 5 | Spark — company logins password chip | `src/pages/spark/CompanyLoginsDialog.tsx:415` | Silent |
| 6 | Add person — undelivered temp password | `src/components/AddPersonDialog.tsx:201` | Silent (`?.` skips it) |
| 7 | Stakeholders — credential banner password | `src/pages/StakeholdersPage.tsx:713` | Silent |
| 8 | Admin users — invite result temp password | `src/pages/admin/AdminUsersPage.tsx:393` | Silent |
| 9 | Admin users — row temp password | `src/pages/admin/AdminUsersPage.tsx:533` | Silent |
| 10 | Admin users — "Copy invite link" | `src/pages/admin/AdminUsersPage.tsx:1317` | Silent, and never shows "Copied" even when it works |
| 11 | Shared temp password plate | `src/components/shared/TempPasswordPlate.tsx` | Already handles it (selects text + "Press Ctrl+C") — but still can't copy by itself |

(`RichTextEditor.tsx` uses `execCommand` for bold/italic — not a copy button, not touched.)

## The fix

### Step 1 — New small helper: `src/lib/copyText.ts`

One function: `copyTextToClipboard(text: string): Promise<boolean>`

1. If `navigator.clipboard.writeText` exists, try it. If it works → return `true`.
2. Otherwise (or if it fails), use the old method that **works on plain http**: put the text in a hidden `<textarea>`, select it, run `document.execCommand('copy')`, remove the textarea. Return `true` if the browser says it copied.
3. If both fail → return `false` (caller decides what to show).

Small helper functions inside it, each with a docstring:
- `copyWithClipboardApi(text)` — step 1
- `copyWithHiddenTextarea(text)` — step 2
- `copyTextToClipboard(text)` — the one everyone calls

Why the old method: `execCommand('copy')` is marked "deprecated" but every browser still supports it, and it is the only way to copy on a non-https page. It must run inside the click, which all these buttons do.

### Step 2 — Use the helper in every copy button (rows 1–11)

Each button changes from `navigator.clipboard.writeText(x)` to `const ok = await copyTextToClipboard(x)`, then:
- `ok` → show "Copied" for ~2 seconds (same as today)
- not `ok` → keep today's fallback for that spot (CopyBox selects the textarea text; banner scrolls to card; TempPasswordPlate shows "Press Ctrl+C")

Small extra fixes found during the audit:
- Row 3 (Spark license key): reset "Copied" back to "Copy" after 2 seconds like the others.
- Row 10 (Copy invite link): show "Copied" for 2 seconds so the admin knows it worked. Needs a tiny bit of state on that row.
- Row 1 (CopyBox): when copy fails, select the text in the box so the user can press Ctrl+C.

### Step 3 — Tests

- New `src/test/copy-text.test.tsx`: clipboard API works → true; clipboard API missing → falls back to execCommand → true; both fail → false.
- Run the existing tests that touch copy (`temp-password-plate.test.tsx`, `licensing.test.tsx`, `spark-license-key-page.test.tsx`) and the full test suite + `tsc` to make sure nothing broke. `temp-password-plate.test.tsx` mocks a failing clipboard — those tests may need `document.execCommand` mocked to fail too, so they still test the "Press Ctrl+C" path.

### Step 4 — Notes

- New `../notes/Features/Copy Buttons.md` (feature template), update `../notes/Current Status.md`, add one line to `../notes/Decisions.md` ("use one copy helper with an execCommand fallback because on-prem runs on plain http").
- Mark this plan as Done.

## Ripple effects / what could break

- **No backend, DB, or endpoint changes.** No Postman update needed.
- On https / localhost nothing changes for the user — the clipboard API is still tried first.
- On plain http copy now actually works instead of silently failing.
- The License banner will no longer jump to the License card on http, because the copy now succeeds. It only jumps if both methods fail.
- The hidden textarea briefly steals focus; the helper puts focus back on the button so dialogs (Radix) don't close or lose focus. Copy buttons inside dialogs (Company logins, Add person, invite result) are the ones to check by hand.
- Tests that fake a broken clipboard may now pass through the fallback — handled in Step 3.

## How to check by hand after the change

Open the on-prem build on `http://<your-PC-IP>:8081` (not localhost), click every button in the table above, paste into Notepad.
