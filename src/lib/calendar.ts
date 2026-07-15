// Shared calendar/date helpers + constants. Extracted so the Disclosure Timeline
// card (dashboard) and the IR Calendar page format and place dates identically.
// Bodies mirror the originals in MeetingsPage.tsx, which are left untouched to
// avoid regressing the Meetings screen.

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const SHORT_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
export const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// "YYYY-MM-DD" (+ optional "HH:mm:ss") → local Date. Both fields are treated as
// wall-clock values so calendar placement matches what was entered, regardless of TZ.
export function toLocalDate(dateStr: string, timeStr = '00:00:00'): Date {
  const [y, m, d] = dateStr.split('-').map((x) => parseInt(x, 10));
  const [hh = 0, mm = 0, ss = 0] = (timeStr ?? '00:00:00').split(':').map((x) => parseInt(x, 10));
  return new Date(y, (m || 1) - 1, d || 1, hh, mm, ss);
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map((x) => parseInt(x, 10));
  if (Number.isNaN(h)) return timeStr;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = ((h + 11) % 12) + 1;
  return `${hour12}:${(m || 0).toString().padStart(2, '0')} ${period}`;
}

// Whole-day difference (target − from), ignoring time-of-day.
export function diffDays(target: Date, from: Date): number {
  const a = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const b = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// "12 Dec 2025"
export function formatDayMonth(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Friendly countdown that scales the unit to the distance — days near-term, then
// months, then years — so a disclosure ~1 year out doesn't read as "in 341 days".
export function formatCountdown(target: Date, from: Date): string {
  const days = diffDays(target, from);
  if (days === 0) return 'Today';
  if (days < 0) {
    const past = Math.abs(days);
    if (past < 45) return `${past} days ago`;
    const months = Math.round(past / 30);
    return months < 12 ? `${months} mo ago` : `${Math.round(past / 365)} yr ago`;
  }
  if (days < 45) return `in ${days} days`;
  const months = Math.round(days / 30);
  if (months < 12) return `in ${months} months`;
  const years = Math.floor(days / 365);
  const remMonths = Math.round((days - years * 365) / 30);
  return remMonths > 0 ? `in ${years}y ${remMonths}mo` : `in ${years} year${years === 1 ? '' : 's'}`;
}
