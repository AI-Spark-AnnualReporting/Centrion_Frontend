// Meeting links (Zoom / Teams / Google Meet). The input is `type="url"`, but
// the browser only checks that on a real <form> submit — these popups have no
// form — and even then it accepts any "something:something", including
// `javascript:alert(1)`. The link is shown to board members as a clickable
// <a href>, so it must be a real http(s) web address (QA audit BM-03).
//
// Uses the browser's own URL parser (new URL), plus two rules on top:
// http/https only, and a real domain with a dot in it.

import type { MeetingPlatform } from '@/types/meeting';

// Longest link we accept. Real meeting links are well under this; it stops
// a pasted wall of text from being saved as a "link".
const MAX_LINK_LENGTH = 2048;

export const MEETING_LINK_ERROR = 'Enter a full meeting link, for example https://zoom.us/j/123456789';

// "https://" or "http://" at the start, any letter case.
const WEB_SCHEME = /^https?:\/\//i;

// Any other scheme: "mailto:", "javascript:", "zoom:abc", "ftp://".
// The (?!\d) keeps "zoom.us:8443/j/1" (a host with a port) from counting.
const OTHER_SCHEME = /^[a-z][a-z0-9+.-]*:(?!\d)/i;

/** Adds "https://" when the user pasted a bare address like "zoom.us/j/123". */
function addMissingScheme(value: string): string | null {
  if (WEB_SCHEME.test(value)) return value;
  if (OTHER_SCHEME.test(value)) return null; // javascript:, mailto:, zoom:abc …
  return `https://${value}`;
}

/** True when the hostname looks like a real domain: has a dot, no empty labels. */
function hasRealDomain(hostname: string): boolean {
  if (!hostname.includes('.')) return false; // "localhost", "meet"
  if (hostname.startsWith('.') || hostname.endsWith('.')) return false;
  return !hostname.includes('..');
}

/**
 * The cleaned-up meeting link, or null when the text isn't a usable web link.
 * "zoom.us/j/1" → "https://zoom.us/j/1"; "not a url", "javascript:…" → null.
 */
export function normalizeMeetingLink(raw: string): string | null {
  const value = raw.trim();
  if (value === '' || value.length > MAX_LINK_LENGTH) return null;
  // A space inside means it's a sentence, not a link ("not a url").
  if (/\s/.test(value)) return null;

  const withScheme = addMissingScheme(value);
  if (withScheme === null) return null;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (!hasRealDomain(parsed.hostname)) return null;
  // Credentials in a link ("https://user:pass@host") are a phishing pattern.
  if (parsed.username || parsed.password) return null;

  // Keep the user's own text when it was already complete, so a link isn't
  // silently rewritten (new URL would add a trailing slash, lowercase the host…).
  return withScheme;
}

/** True when the text is a usable meeting link. */
export function isValidMeetingLink(raw: string): boolean {
  return normalizeMeetingLink(raw) !== null;
}

/**
 * The problem with the Meeting URL / Location field, or null if it's fine.
 * In person → any non-empty text (a room or an address).
 * Online → a real http(s) web link (the rules in normalizeMeetingLink above).
 */
export function getMeetingLinkError(platform: MeetingPlatform, value: string): string | null {
  const isInPerson = platform === 'in_person';
  if (value.trim() === '') {
    return isInPerson ? 'A location is required.' : 'A meeting URL is required.';
  }
  if (isInPerson) return null;
  return normalizeMeetingLink(value) === null ? MEETING_LINK_ERROR : null;
}

/**
 * The text to save: the cleaned-up link for online meetings
 * ("zoom.us/j/1" → "https://zoom.us/j/1"), the trimmed text for in person.
 * Only call after getMeetingLinkError returned null.
 */
export function getMeetingLinkToSave(platform: MeetingPlatform, value: string): string {
  if (platform === 'in_person') return value.trim();
  return normalizeMeetingLink(value) ?? value.trim();
}
