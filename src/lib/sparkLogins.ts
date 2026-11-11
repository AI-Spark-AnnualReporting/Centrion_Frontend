// Small pure helpers shared by the Spark "company admin, project manager and
// department lead logins" screens: the Add company modal, the wizard's Departments step, the
// end-of-wizard lead creation and the Logins dialog.
//
// Spark-only. Nothing here talks to the API; the screens do that.

import type { SparkCreateLeadsResult } from '@/lib/api';

// ---------------------------------------------------------------------------
// Email slugs
// ---------------------------------------------------------------------------

/** The domain every Spark-made company admin login uses. The server never emails it. */
export const ADMIN_EMAIL_DOMAIN = 'admin.com';

/** The domain every Spark-made department lead login uses. The server never emails it. */
export const LEAD_EMAIL_DOMAIN = 'hod.com';

/** The domain every Spark-made project manager login uses. The server never
 *  emails it: pm.com is very likely someone else's real domain. */
export const PM_EMAIL_DOMAIN = 'pm.com';

/** Longest company part of a login email. Matches the backend cap. */
export const COMPANY_SLUG_MAX_LENGTH = 40;

/**
 * Turn free text into the slug used inside login emails.
 *
 * Mirrors the backend rule (spec section 1) so the email the modal suggests is
 * the one the server would pick:
 *   lower-case; `&` becomes `and`; anything that isn't a-z or 0-9 becomes `-`;
 *   repeated `-` collapse into one; leading and trailing `-` are trimmed;
 *   capped at `maxLength`; empty falls back to `fallback`.
 *
 * Returns the slug, e.g. "Bank Al Jazeera" -> "bank-al-jazeera".
 */
export function makeSlug(text: string, maxLength: number, fallback: string): string {
  let slug = text.toLowerCase();
  // Plain "and", as spec section 1 says and the backend's make_slug does, so
  // "R&D" becomes "randd" on both sides and the prefilled email matches the server's.
  slug = slug.replace(/&/g, 'and');
  slug = slug.replace(/[^a-z0-9]/g, '-');
  slug = slug.replace(/-+/g, '-');
  slug = trimDashes(slug);
  slug = slug.slice(0, maxLength);
  // Cutting can leave a dash at the end ("bank-al-" at 8), so trim again.
  slug = trimDashes(slug);
  if (slug === '') return fallback;
  return slug;
}

/** Remove `-` from both ends of a string. Returns the trimmed string. */
function trimDashes(text: string): string {
  return text.replace(/^-+/, '').replace(/-+$/, '');
}

/**
 * The admin email the modal suggests for a company name: `<slug>@admin.com`.
 * Only a starting point — the server check may offer `<slug>-2@admin.com`.
 */
export function suggestAdminEmail(companyName: string): string {
  const slug = makeSlug(companyName, COMPANY_SLUG_MAX_LENGTH, 'company');
  return `${slug}@${ADMIN_EMAIL_DOMAIN}`;
}

/**
 * The project manager email the Add company modal mentions: `<slug>@pm.com`.
 * The server makes this login by itself (no field for it), and may pick
 * `<slug>-2@pm.com` when the first one is taken, so this is only a preview.
 */
export function suggestPmEmail(companyName: string): string {
  const slug = makeSlug(companyName, COMPANY_SLUG_MAX_LENGTH, 'company');
  return `${slug}@${PM_EMAIL_DOMAIN}`;
}

/**
 * True when the email is one of Spark's own placeholder logins (@admin.com,
 * @pm.com or @hod.com). Same test as the backend's is_spark_placeholder_email.
 *
 * Only these logins share the temporary password and can be reset from the
 * Logins dialog. Any other address belongs to a real person the client admin
 * invited: the server hides their password and refuses to reset it (403),
 * because they recover through Forgot password.
 */
export function isSparkPlaceholderEmail(email: string | null | undefined): boolean {
  const normalised = (email ?? '').trim().toLowerCase();
  const parts = normalised.split('@');
  if (parts.length !== 2) return false;
  const domain = parts[1];
  return domain === ADMIN_EMAIL_DOMAIN || domain === PM_EMAIL_DOMAIN || domain === LEAD_EMAIL_DOMAIN;
}

// ---------------------------------------------------------------------------
// Temporary password
// ---------------------------------------------------------------------------

/**
 * The temporary password every Spark-made login starts on (the company admin,
 * the project manager and the department leads). The server sets it; this copy is only for showing
 * it. Boss's decision, 2026-11-10. Client invites still get a random one.
 */
export const SPARK_TEMP_PASSWORD = '1234';

// ---------------------------------------------------------------------------
// sessionStorage hand-off between screens (this tab only)
// ---------------------------------------------------------------------------
//
// sessionStorage can throw (private windows, blocked storage), so every access
// is wrapped: a failure only means the next screen doesn't get the hint.

const NEW_LOGINS_KEY_PREFIX = 'spark:newLogins:';

/** What the wizard leaves for the Annual Report landing after creating leads.
 *  Never holds a password. */
export type NewLoginsRecord =
  | { ok: true; created: SparkCreateLeadsResult['created']; skipped: SparkCreateLeadsResult['skipped'] }
  | { ok: false; error: string };

/** Key holding the result of creating the company's lead logins. */
function newLoginsKey(companyId: string): string {
  return NEW_LOGINS_KEY_PREFIX + companyId;
}

/** Remember the lead-creation result for the Logins dialog. Never pass a password. */
export function saveNewLogins(companyId: string, record: NewLoginsRecord): void {
  try {
    sessionStorage.setItem(newLoginsKey(companyId), JSON.stringify(record));
  } catch {
    // Storage blocked: the dialog just won't open by itself.
  }
}

/**
 * Read the lead-creation result for this company and remove it, so a page
 * refresh doesn't open the Logins dialog again.
 *
 * Returns the record, or null when there is none or it can't be read.
 */
export function readAndClearNewLogins(companyId: string): NewLoginsRecord | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(newLoginsKey(companyId));
    sessionStorage.removeItem(newLoginsKey(companyId));
  } catch {
    return null;
  }
  if (raw === null) return null;
  return parseNewLoginsRecord(raw);
}

/** Parse a stored record, or return null if it is corrupt or the wrong shape. */
function parseNewLoginsRecord(raw: string): NewLoginsRecord | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.ok === true) {
    const created = Array.isArray(record.created) ? record.created : [];
    const skipped = Array.isArray(record.skipped) ? record.skipped : [];
    return { ok: true, created, skipped } as NewLoginsRecord;
  }
  if (record.ok === false) {
    const error = typeof record.error === 'string' ? record.error : 'Something went wrong.';
    return { ok: false, error };
  }
  return null;
}

/**
 * Remove every `spark:newLogins:*` key in this tab. Called on logout and when
 * leaving a company, so one company's hand-off never shows for another.
 */
export function clearAllSparkLoginKeys(): void {
  try {
    const keysToRemove: string[] = [];
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (key === null) continue;
      if (key.startsWith(NEW_LOGINS_KEY_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    // Removed after the loop: removing while looping shifts the indexes.
    for (const key of keysToRemove) {
      sessionStorage.removeItem(key);
    }
  } catch {
    // Storage blocked: there is nothing stored to clear.
  }
}
