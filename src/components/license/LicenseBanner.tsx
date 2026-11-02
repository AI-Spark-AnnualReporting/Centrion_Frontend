// A banner above every page for the client admin, saying what's wrong with the
// license, what it means, which modules it affects, and what to do.
//
//   red    expired, locked (with its Lock ID), a key that doesn't match
//   amber  no license yet, not started yet, a limit is full
//   blue   the license ends within 30 days
//
// One banner at a time — the most serious one wins. The two warnings that can
// show while the license is still active (limit full, ending soon) can be
// closed with ✕ and come back the next day. Other roles never call the
// license endpoint (it's admin-only); if they try something the license
// blocks, the backend's message tells them.
//
// While the license isn't active the banner checks again every 30 s. The
// moment it turns active it refreshes the login, so the licensed modules
// appear without logging out. It also re-checks on every page change, so a
// limit that just filled up shows straight away.
//
// Mockup agreed 2026-11-02. Plan: Centriton/.claude/plans/company-licensing.md

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { license } from '@/lib/api';
import type { CompanyLicense } from '@/types/license';

const RECHECK_MS = 30_000;
const ENDING_SOON_DAYS = 30;
const ADMIN_CONSOLE = '/admin-console';
const CLOSED_KEY_PREFIX = 'license-banner-closed:';

// Where the banner's buttons send the admin: ids on the License card.
export const LICENSE_CARD_ID = 'license-card';
export const LICENSE_KEY_BOX_ID = 'license-key-box';
export const LICENSE_UNLOCK_BOX_ID = 'license-unlock-box';

type Tone = 'red' | 'amber' | 'blue';
type Action = 'open' | 'copyServer' | 'copyLock' | 'pasteKey' | 'pasteUnlock' | 'renew' | 'upgrade' | 'close';
type Closable = 'limit' | 'ending';

interface ModuleRow {
  label: string;
  items: string[];
  emphasis?: boolean; // the "Full:" row is drawn outlined
}

interface Banner {
  tone: Tone;
  icon: string;
  title: React.ReactNode;
  text: React.ReactNode;
  rows: ModuleRow[];
  actions: Action[];
  closable?: Closable;
}

const TONE_STYLE: Record<Tone, { background: string; color: string }> = {
  red: { background: 'rgba(239,68,68,.10)', color: '#B91C1C' },
  amber: { background: 'rgba(245,158,11,.12)', color: '#92400E' },
  blue: { background: 'rgba(79,70,229,.08)', color: '#3730A3' },
};

const MONO = { fontFamily: "'DM Mono', monospace", fontWeight: 700 } as const;

// ── Dates ───────────────────────────────────────────────────────────

function todayText(): string {
  return new Date().toISOString().slice(0, 10);
}

/** '2026-12-31' → '31 Dec 2026'. */
export function formatLicenseDate(isoDate: string | null): string {
  if (!isoDate) return '';
  const date = new Date(`${isoDate}T00:00:00Z`);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Whole days from today (UTC) to the license's last day; 0 = ends today. */
export function daysUntil(isoDate: string, today: string = todayText()): number {
  const ms = Date.parse(`${isoDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

// ── What the license says ───────────────────────────────────────────

function moduleLabels(data: CompanyLicense): string[] {
  return data.modules.map((key) => data.modules_catalogue.find((m) => m.key === key)?.label ?? key);
}

function allModuleLabels(data: CompanyLicense): string[] {
  return data.modules_catalogue.map((m) => m.label);
}

function reportLabel(data: CompanyLicense, reportType: string): string {
  return data.modules_catalogue.find((m) => m.report_type === reportType)?.label ?? reportType;
}

/** Everything with a number limit, split into full and still free, e.g.
 *  full: ['Board Report 10 / 10', 'Users 25 / 25']. Unlimited ones are left out. */
export function limitUsage(data: CompanyLicense): { full: string[]; free: string[]; fullNames: string[] } {
  const full: string[] = [];
  const free: string[] = [];
  const fullNames: string[] = [];
  for (const [reportType, limit] of Object.entries(data.report_limits)) {
    if (limit == null) continue;
    const used = data.reports_used[reportType];
    if (used == null) continue; // module not in the key
    const label = reportLabel(data, reportType);
    const line = `${label} ${used} / ${limit}`;
    if (used >= limit) {
      full.push(line);
      fullNames.push(label);
    } else {
      free.push(line);
    }
  }
  if (data.max_seats != null) {
    const line = `Users ${data.seats_used} / ${data.max_seats}`;
    if (data.seats_used >= data.max_seats) {
      full.push(line);
      fullNames.push('users');
    } else {
      free.push(line);
    }
  }
  return { full, free, fullNames };
}

/** 'A', 'A or B', 'A, B or C' — for "You can't create more … ". */
function joinWithOr(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

function limitSentence(fullNames: string[]): string {
  const reports = fullNames.filter((name) => name !== 'users');
  const parts: string[] = [];
  if (reports.length) parts.push(`create more ${joinWithOr(reports)}`);
  if (fullNames.includes('users')) parts.push('add users');
  return `You can't ${parts.join(' or ')} until Centriyon raises the limit.`;
}

// ── Which banner ────────────────────────────────────────────────────

/** The one banner to show for this license, or null. `closed` = the warnings
 *  the admin closed today. */
export function pickBanner(data: CompanyLicense, closed: Set<Closable>, today: string = todayText()): Banner | null {
  const cloud = data.deployment === 'cloud';
  const licensed = moduleLabels(data);

  switch (data.status) {
    case 'none':
      return cloud
        ? {
            tone: 'amber', icon: '!',
            title: "Your company doesn't have a license yet.",
            text: "Modules are switched off, and you can't create reports or invite users. Contact Centriyon to set up your license.",
            rows: [{ label: 'Switched off until licensed:', items: allModuleLabels(data) }],
            actions: ['open'],
          }
        : {
            tone: 'amber', icon: '!',
            title: "This server doesn't have a license yet.",
            text: (
              <>Send your Server ID <span style={MONO}>{data.server_id ?? ''}</span> to Centriyon, then paste the license key you get back.</>
            ),
            rows: [{ label: 'Switched off until licensed:', items: allModuleLabels(data) }],
            actions: data.server_id ? ['copyServer', 'pasteKey'] : ['pasteKey'],
          };
    case 'locked':
      return {
        tone: 'red', icon: '🔒',
        title: <>License check failed — Lock ID <span style={MONO}>{data.lock_id ?? ''}</span></>,
        text: 'The license data on this server was changed, so new work is paused. Your reports stay open. Send the Lock ID to Centriyon to get an unlock code.',
        rows: [{ label: 'Read-only now:', items: licensed }],
        actions: ['copyLock', 'pasteUnlock'],
      };
    case 'expired':
      return {
        tone: 'red', icon: '⏱',
        title: `Your license expired on ${formatLicenseDate(data.expires_at)}.`,
        text: "You can still open and download your reports and use AI Copilot, but you can't create new reports or add users. Contact Centriyon to renew.",
        rows: [{ label: 'Read-only now:', items: licensed }],
        actions: cloud ? ['renew', 'open'] : ['open'],
      };
    case 'invalid':
      return {
        tone: 'red', icon: '!',
        title: "This license key isn't for this company or server.",
        text: 'Your reports stay open, but new work is paused. Contact Centriyon for a new key.',
        rows: [{ label: 'Read-only now:', items: licensed }],
        actions: cloud ? ['open'] : ['copyServer', 'pasteKey'],
      };
    case 'not_started':
      return {
        tone: 'amber', icon: '⏱',
        title: `Your license starts on ${formatLicenseDate(data.starts_at)}.`,
        text: "Until then you can't create reports or add users.",
        rows: [{ label: 'Starts with:', items: licensed }],
        actions: ['open'],
      };
    default:
      break;
  }

  // Active: a full limit first (it blocks work today), then "ending soon".
  const { full, free, fullNames } = limitUsage(data);
  if (full.length && !closed.has('limit')) {
    return {
      tone: 'amber', icon: '!',
      title: "You've reached a license limit.",
      text: limitSentence(fullNames),
      rows: [
        { label: 'Full:', items: full, emphasis: true },
        ...(free.length ? [{ label: 'Still free:', items: free }] : []),
      ],
      actions: cloud ? ['upgrade', 'close'] : ['open', 'close'],
      closable: 'limit',
    };
  }
  if (data.expires_at && !closed.has('ending')) {
    const days = daysUntil(data.expires_at, today);
    if (days >= 0 && days <= ENDING_SOON_DAYS) {
      const when = days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`;
      return {
        tone: 'blue', icon: '⏱',
        title: `Your license ends on ${formatLicenseDate(data.expires_at)} — ${when}.`,
        text: "After that you can still open your reports, but you can't create new ones or add users. Contact Centriyon to renew.",
        rows: [{ label: 'Your modules:', items: licensed }],
        actions: cloud ? ['renew', 'close'] : ['open', 'close'],
        closable: 'ending',
      };
    }
  }
  return null;
}

// ── Closing a warning until tomorrow ────────────────────────────────

function readClosed(): Set<Closable> {
  const closed = new Set<Closable>();
  for (const kind of ['limit', 'ending'] as Closable[]) {
    try {
      if (localStorage.getItem(CLOSED_KEY_PREFIX + kind) === todayText()) closed.add(kind);
    } catch {
      // Storage blocked: the warning just stays.
    }
  }
  return closed;
}

function rememberClosed(kind: Closable): void {
  try {
    localStorage.setItem(CLOSED_KEY_PREFIX + kind, todayText());
  } catch {
    // Storage blocked: closed for this page view only.
  }
}

// ── The banner ──────────────────────────────────────────────────────

export function LicenseBanner() {
  const { user, refreshPermissions } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState<CompanyLicense | null>(null);
  const [closed, setClosed] = useState<Set<Closable>>(readClosed);
  const [done, setDone] = useState<Partial<Record<Action, string>>>({});
  const wasActive = useRef<boolean | null>(null);
  const isClientAdmin = user?.role === 'admin' && !!user.company_id;

  const check = useCallback(async () => {
    try {
      const next = await license.get();
      const nowActive = next.status === 'active';
      // Turned active since the last check (Spark issued or unlocked it).
      if (wasActive.current === false && nowActive) {
        await refreshPermissions().catch(() => undefined);
      }
      wasActive.current = nowActive;
      setData(next);
    } catch {
      // Banner is a hint; a failed check just leaves it as it was.
    }
  }, [refreshPermissions]);

  useEffect(() => {
    if (!isClientAdmin) return;
    const timer = window.setInterval(() => {
      if (wasActive.current === false) check();
    }, RECHECK_MS);
    return () => window.clearInterval(timer);
  }, [isClientAdmin, check]);

  // Every page change: a report or user just added may have filled a limit.
  useEffect(() => {
    if (isClientAdmin) check();
  }, [isClientAdmin, check, location.pathname]);

  if (!isClientAdmin || !data) return null;
  const banner = pickBanner(data, closed);
  if (!banner) return null;

  // Go to the License card (and its paste box). Already on the Admin
  // Console: scroll there instead of navigating to the same page.
  const goToLicense = (targetId: string) => {
    if (location.pathname === ADMIN_CONSOLE) {
      const target = document.getElementById(targetId) ?? document.getElementById(LICENSE_CARD_ID);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (target instanceof HTMLTextAreaElement) target.focus({ preventScroll: true });
      return;
    }
    navigate(`${ADMIN_CONSOLE}#${targetId}`);
  };

  const flash = (action: Action, text: string) => {
    setDone((prev) => ({ ...prev, [action]: text }));
    window.setTimeout(() => setDone((prev) => ({ ...prev, [action]: undefined })), 2000);
  };

  const copy = async (action: Action, value: string | null) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      flash(action, 'Copied');
    } catch {
      goToLicense(LICENSE_CARD_ID); // clipboard blocked: the card shows it to select
    }
  };

  const sendRequest = async (action: Action, note: string) => {
    try {
      await license.requestUpgrade({ note });
      await check();
    } catch (err) {
      flash(action, err instanceof Error ? err.message : 'Could not send');
    }
  };

  const close = (kind: Closable) => {
    rememberClosed(kind);
    setClosed((prev) => new Set(prev).add(kind));
  };

  const run: Record<Action, () => void> = {
    open: () => goToLicense(LICENSE_CARD_ID),
    copyServer: () => copy('copyServer', data.server_id),
    copyLock: () => copy('copyLock', data.lock_id),
    pasteKey: () => goToLicense(LICENSE_KEY_BOX_ID),
    pasteUnlock: () => goToLicense(LICENSE_UNLOCK_BOX_ID),
    renew: () => sendRequest('renew', `Please renew our license (ends ${formatLicenseDate(data.expires_at)}).`),
    upgrade: () => sendRequest('upgrade', `Limit reached: ${limitUsage(data).full.join(', ')}.`),
    close: () => banner.closable && close(banner.closable),
  };

  const LABEL: Record<Action, string> = {
    open: 'Open license',
    copyServer: 'Copy Server ID',
    copyLock: 'Copy Lock ID',
    pasteKey: 'Paste key',
    pasteUnlock: 'Paste unlock code',
    renew: 'Request renewal',
    upgrade: 'Request upgrade',
    close: '✕',
  };

  const tone = TONE_STYLE[banner.tone];
  const requestSentOn = data.upgrade_requested_at?.slice(0, 10);

  return (
    <div
      role="status"
      style={{
        margin: '0 0 12px', padding: '12px 16px', borderRadius: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        ...tone,
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, flex: 'none', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 15, background: 'rgba(255,255,255,.7)' }}>
          {banner.icon}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 2 }}>{banner.title}</div>
          <div style={{ fontSize: 12, lineHeight: 1.5, opacity: 0.92 }}>{banner.text}</div>
          {banner.rows.filter((row) => row.items.length > 0).map((row) => (
            <div key={row.label} style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7, alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, marginRight: 2 }}>{row.label}</span>
              {row.items.map((item) => (
                <span
                  key={item}
                  style={{
                    fontSize: 11, fontWeight: 600, borderRadius: 999, padding: '2px 9px',
                    background: row.emphasis ? '#fff' : 'rgba(255,255,255,.75)',
                    outline: row.emphasis ? '1px solid currentColor' : undefined,
                  }}
                >
                  {item}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div style={{ flex: 'none', display: 'flex', gap: 6, alignItems: 'center' }}>
        {banner.actions.map((action) => {
          // One open request per company: show when it was sent instead.
          if ((action === 'renew' || action === 'upgrade') && requestSentOn) {
            return <span key={action} style={{ fontSize: 11, fontWeight: 700 }}>Request sent {requestSentOn}</span>;
          }
          return (
            <button
              key={action}
              type="button"
              className="btn bs bsm"
              aria-label={action === 'close' ? 'Close until tomorrow' : undefined}
              onClick={run[action]}
            >
              {done[action] ?? LABEL[action]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
