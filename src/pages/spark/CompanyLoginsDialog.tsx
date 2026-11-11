// The Logins dialog: every admin, project manager and department-lead login of
// one company that Spark created, with the temporary password, a per-row Reset password, and
// "Create missing leads" for departments added after setup.
//
// Spark-only. It opens from two places:
//   - the key button on a /companies row (only on rows Spark created);
//   - by itself on the Annual Report landing, right after the setup wizard
//     made the lead logins (CyclesListPage reads the one-shot sessionStorage
//     record and passes it in as `origin`).
//
// It ALWAYS loads GET /logins, whichever way it opened. The sessionStorage
// record only picks the header ("Logins created" or the failure callout), so
// there is one rendering path and the table always matches the server.
//
// Rules for the test mocks around it: no `Link` / `useLocation` (the directory
// test mocks react-router-dom with useNavigate only), and nothing from
// `@/lib/api` is touched until the dialog opens.

import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  sparkInternal,
  type SparkCreateLeadsResult,
  type SparkLogin,
  type SparkLoginsResponse,
} from '@/lib/api';
import { TempPasswordPlate } from '@/components/shared/TempPasswordPlate';
import { colorFor } from '@/lib/departmentColors';
import {
  COMPANY_SLUG_MAX_LENGTH,
  isSparkPlaceholderEmail,
  makeSlug,
  type NewLoginsRecord,
} from '@/lib/sparkLogins';
import { downloadText } from '@/lib/utils';

// Above the wizard (`.auth`, z-index 100) and above any other modal overlay
// (10001). Inline, because `.modal-overlay` sets its own z-index in CSS.
const DIALOG_Z_INDEX = 10002;
const COPIED_MS = 1800;
const FLASH_ANIMATION = 'section-flash 1.1s ease-out';

interface CompanyLoginsDialogProps {
  companyId: string;
  companyName: string;
  /** The lead-creation result the wizard left behind, when it opened by itself. */
  origin?: NewLoginsRecord | null;
  onClose: () => void;
}

type LoadState = 'loading' | 'error' | 'ready';

/** What the top of the dialog shows about the temporary password. */
type PasswordView =
  | { kind: 'none' }
  | { kind: 'shared'; password: string }
  | { kind: 'all-set' }
  | { kind: 'unreadable' }
  | { kind: 'mixed'; someUnreadable: boolean };

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

/** The temporary password to show for a login: a fresh reset wins over the server copy. */
function passwordFor(login: SparkLogin, resetPasswords: Record<string, string>): string | null {
  const fromReset = resetPasswords[login.user_id];
  if (fromReset) return fromReset;
  return login.temp_password;
}

/**
 * Decide how to show the temporary password.
 *
 * One shared plate only when every Spark-made login still waiting has the SAME
 * readable password (decision D2). The client admin can regenerate one user's
 * password in Users & Roles, so passwords can differ: then each row gets Show
 * instead. Real people the client admin invited are left out: the server never
 * sends their password, and that is not "unreadable", it is private.
 */
function choosePasswordView(logins: SparkLogin[], resetPasswords: Record<string, string>): PasswordView {
  if (logins.length === 0) return { kind: 'none' };

  const waiting = waitingLogins(logins);
  if (waiting.length === 0) {
    // Only real colleagues still waiting: there is no Spark password to show,
    // and "Everyone has set their own password" would not be true.
    if (anyoneWaiting(logins)) return { kind: 'none' };
    return { kind: 'all-set' };
  }

  const readable: string[] = [];
  for (const login of waiting) {
    const password = passwordFor(login, resetPasswords);
    if (password) readable.push(password);
  }
  if (readable.length === 0) return { kind: 'unreadable' };

  const distinct = new Set(readable);
  const everyoneReadable = readable.length === waiting.length;
  if (distinct.size === 1 && everyoneReadable) {
    return { kind: 'shared', password: readable[0] };
  }
  return { kind: 'mixed', someUnreadable: !everyoneReadable };
}

/**
 * True when Spark made this login (@admin.com / @pm.com / @hod.com), so its temporary
 * password may be shown and reset here. Anyone else is a real person the client
 * admin invited: the server hides their password and refuses a reset (403).
 */
function isSparkMadeLogin(login: SparkLogin): boolean {
  return isSparkPlaceholderEmail(login.email);
}

/**
 * The Spark-made logins still waiting for their first sign-in. Only these share
 * the temporary password on the sign-in sheet: someone who already set their
 * own password can't use it any more, and a real invited colleague never had it.
 */
function waitingLogins(logins: SparkLogin[]): SparkLogin[] {
  return logins.filter((login) => login.must_change_password && isSparkMadeLogin(login));
}

/** True when any login at all (Spark-made or real) has not signed in yet. */
function anyoneWaiting(logins: SparkLogin[]): boolean {
  return logins.some((login) => login.must_change_password);
}

/** "Admin", "PM" or "Lead · FIN" — the role text used in the .txt file. */
function roleText(login: SparkLogin): string {
  if (login.role === 'admin') return 'Admin';
  if (login.role === 'project_manager') return 'PM';
  return `Lead · ${login.department_code ?? '—'}`;
}

/** Where a role sits in the list: admin first, then the PM, then the leads. */
function roleRank(login: SparkLogin): number {
  if (login.role === 'admin') return 0;
  if (login.role === 'project_manager') return 1;
  return 2;
}

/**
 * The logins in admin -> PM -> leads order. The server already sends them this
 * way; sorting again here keeps the order right whatever it sends. The sort is
 * stable, so the leads keep the server's department-code order.
 */
function sortLoginsByRole(logins: SparkLogin[]): SparkLogin[] {
  return [...logins].sort((first, second) => roleRank(first) - roleRank(second));
}

/** Build the body of the downloadable sign-in sheet (format from the -ui.md spec). */
function buildLoginsText(companyName: string, password: string, logins: SparkLogin[]): string {
  const lines: string[] = [
    `Centriyon: sign-in details for ${companyName}`,
    '',
    `Sign in at ${window.location.origin}/login`,
    `Temporary password: ${password}`,
    'Everyone sets their own password the first time they sign in.',
    '',
  ];
  for (const login of logins) {
    lines.push(`${roleText(login).padEnd(13)}${login.email}`);
  }
  return lines.join('\n') + '\n';
}

/** "1 department has no lead" / "3 departments have no lead". */
function missingLeadsText(count: number): string {
  if (count === 1) return '1 department has no lead';
  return `${count} departments have no lead`;
}

/** "3 lead logins created." with ", 1 skipped" when some were skipped. */
function createdNoticeText(result: SparkCreateLeadsResult): string {
  const created = result.created.length;
  const skipped = result.skipped.length;
  let text = created === 1 ? '1 lead login created' : `${created} lead logins created`;
  if (skipped > 0) text += `, ${skipped} skipped`;
  return text + '.';
}

/** True when the user asked the OS for less motion. Safe where matchMedia is missing. */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Turn any thrown value into a sentence for a callout. */
function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

// ---------------------------------------------------------------------------
// Small pieces of UI
// ---------------------------------------------------------------------------

const ERROR_CALLOUT: React.CSSProperties = {
  fontSize: 11,
  color: '#DC2626',
  background: 'rgba(239,68,68,.08)',
  border: '1px solid rgba(239,68,68,.2)',
  borderRadius: 8,
  padding: '8px 12px',
  marginTop: 12,
};

const SUCCESS_CALLOUT: React.CSSProperties = {
  fontSize: 11,
  color: '#16A34A',
  background: 'rgba(34,197,94,.08)',
  border: '1px solid rgba(34,197,94,.2)',
  borderRadius: 8,
  padding: '8px 12px',
  marginTop: 12,
};

const AMBER_CALLOUT: React.CSSProperties = {
  fontSize: 11,
  color: '#B45309',
  background: 'rgba(245,158,11,.1)',
  borderRadius: 8,
  padding: '8px 10px',
  lineHeight: 1.5,
};

const TH: React.CSSProperties = {
  fontSize: 9.5,
  fontWeight: 700,
  color: '#9BA3C4',
  textTransform: 'uppercase',
  letterSpacing: '.5px',
  textAlign: 'left',
  padding: '9px 14px',
  background: '#FAFBFE',
  position: 'sticky',
  top: 0,
  zIndex: 1,
};

const TD: React.CSSProperties = {
  padding: '9px 14px',
  fontSize: 12,
  color: '#1A1D2E',
  borderBottom: '1px solid #F4F5FB',
  verticalAlign: 'middle',
};

// The last column only holds the 28px Reset icon: 28 + 4 left + 12 right padding.
const ACTION_COLUMN_WIDTH = 44;
// In mixed-password mode it also holds a text "Show" / "Hide" (btn bs bsm,
// about 52px) next to the icon: 52 + 4 gap + 28 + 16 padding.
const ACTION_COLUMN_WIDTH_WITH_SHOW = 100;
const ACTION_CELL_PADDING = '9px 12px 9px 4px';
const REAL_ACCOUNT_RESET_TITLE = 'Real account: recovers through Forgot password';

const ICON_BUTTON_CLASS = 'text-[#5A6080] hover:text-[#4040C8] focus-visible:text-[#4040C8] disabled:opacity-50';

const ICON_BUTTON: React.CSSProperties = {
  width: 28,
  height: 28,
  border: '1.5px solid #E2E4F0',
  borderRadius: 8,
  background: '#fff',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
};

/** Circular-arrow icon for Reset password. Spins while the reset runs. */
function ResetIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      className={spinning ? 'animate-spin' : undefined}
    >
      <path d="M13.5 8a5.5 5.5 0 11-1.6-3.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M12.5 1.8v2.6H9.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The 16px green check circle shown before "Logins created". */
function DoneCheck() {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 16,
        height: 16,
        borderRadius: '50%',
        background: '#22C55E',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 8,
        verticalAlign: '-2px',
      }}
    >
      <svg viewBox="0 0 10 10" width="9" height="9" fill="none">
        <path d="M2 5.2l2 2L8 3" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/**
 * Role badge: "Admin" in the brand badge, "PM" in teal (no department uses
 * that exact colour, so it never reads as a lead), or "Lead · FIN" in the
 * department colour.
 */
function RoleBadge({ login }: { login: SparkLogin }) {
  if (login.role === 'admin') {
    return <span className="badge b-or">Admin</span>;
  }
  if (login.role === 'project_manager') {
    return (
      <span className="badge b-tl" title="Project manager">
        PM
      </span>
    );
  }
  const code = login.department_code ?? '—';
  const color = colorFor(code);
  return (
    <span className="badge" style={{ color, background: `${color}1A` }} title={login.department_name ?? undefined}>
      Lead ·{' '}
      <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 800 }}>{code}</span>
    </span>
  );
}

/** A 22×22 icon button that copies an email and shows a green tick for 1.8 s. */
function CopyEmailButton({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  /** Copy the email. If the browser refuses, nothing happens: the email is selectable text. */
  async function copyEmail(): Promise<void> {
    try {
      await navigator.clipboard.writeText(email);
    } catch {
      return;
    }
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), COPIED_MS);
  }

  return (
    <button
      type="button"
      aria-label={`Copy ${email}`}
      title="Copy email"
      onClick={copyEmail}
      className="text-[#9BA3C4] hover:text-[#4040C8] focus-visible:text-[#4040C8]"
      style={{
        width: 22,
        height: 22,
        flexShrink: 0,
        border: 'none',
        background: 'none',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 6,
        padding: 0,
      }}
    >
      {copied ? (
        <svg viewBox="0 0 12 12" width="12" height="12" fill="none" style={{ color: '#16A34A' }}>
          <path d="M2.5 6.2l2.3 2.3L9.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 12 12" width="12" height="12" fill="none">
          <rect x="4" y="4" width="6.5" height="6.5" rx="1.3" stroke="currentColor" strokeWidth="1.2" />
          <path d="M8 2.5V2.2A1.2 1.2 0 006.8 1H2.2A1.2 1.2 0 001 2.2v4.6A1.2 1.2 0 002.2 8h.3" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      )}
    </button>
  );
}

/**
 * One row's revealed temporary password: a small DM Mono 13px chip plus Copy
 * (the TempPasswordControls look from Users & Roles). Used only in
 * mixed-password mode, where there is no shared plate.
 */
function RevealedPasswordChip({ password, disabled }: { password: string; disabled: boolean }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  /** Copy the password. If the browser refuses, the chip text is still selectable. */
  async function copyPassword(): Promise<void> {
    try {
      await navigator.clipboard.writeText(password);
    } catch {
      return;
    }
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), COPIED_MS);
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
      <code
        data-testid="login-password-code"
        aria-label="Temporary password"
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: '#1A1D2E',
          fontFamily: "'DM Mono', monospace",
          letterSpacing: '.5px',
          background: '#F2F3FA',
          border: '1px solid #E2E4F0',
          borderRadius: 6,
          padding: '5px 9px',
          wordBreak: 'break-all',
          userSelect: 'all',
        }}
      >
        {password}
      </code>
      <button type="button" className="btn bs bsm" onClick={copyPassword} disabled={disabled}>
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}

/** Status badge: amber while the temporary password is unused, green once it was changed. */
function StatusBadge({ login }: { login: SparkLogin }) {
  if (login.must_change_password) {
    return <span className="badge b-am">Waiting for first sign-in</span>;
  }
  return <span className="badge b-gn">Password set</span>;
}

/** The loading state: a plate-sized block and three row-sized blocks. */
function LoadingSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading logins">
      <div className="skel" style={{ height: 56, borderRadius: 12 }} />
      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="skel" style={{ height: 32 }} />
        <div className="skel" style={{ height: 32 }} />
        <div className="skel" style={{ height: 32 }} />
      </div>
    </div>
  );
}

/** The small "are you sure" before a password reset. Nothing is emailed (decision D1). */
function ResetPasswordConfirm({
  email,
  onCancel,
  onConfirm,
}: {
  email: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" style={{ zIndex: DIALOG_Z_INDEX + 1 }}>
          <Dialog.Content
            className="modal-content analysis-pop"
            style={{ width: 400, padding: 24 }}
          >
            <Dialog.Title style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E', margin: 0 }}>
              Reset password?
            </Dialog.Title>
            <Dialog.Description style={{ fontSize: 12, color: '#5A6080', marginTop: 8, lineHeight: 1.6 }}>
              <strong>{email}</strong> gets a new temporary password. Their current one stops working
              right away. Nothing is emailed, so share the new one yourself.
            </Dialog.Description>
            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn bs" onClick={onCancel}>
                Cancel
              </button>
              <button type="button" className="btn bp" onClick={onConfirm}>
                Reset password
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ---------------------------------------------------------------------------
// The dialog
// ---------------------------------------------------------------------------

/** Shows a Spark-created company's logins. Always reads them fresh from the server. */
export default function CompanyLoginsDialog({ companyId, companyName, origin = null, onClose }: CompanyLoginsDialogProps) {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [data, setData] = useState<SparkLoginsResponse | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<SparkCreateLeadsResult | null>(null);
  const [createError, setCreateError] = useState('');

  const [confirmReset, setConfirmReset] = useState<SparkLogin | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetError, setResetError] = useState('');
  const [resetNotice, setResetNotice] = useState('');
  // A password from a reset is kept here too, so it can be shown even when the
  // server can't decrypt stored copies (TEMP_PASSWORD_KEY missing).
  const [resetPasswords, setResetPasswords] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  // The wizard's "couldn't create the leads" error stays up until Create
  // missing leads works here; then only the green notice should show.
  const [wizardErrorDismissed, setWizardErrorDismissed] = useState(false);

  // Rows to flash once: the leads the wizard just made, then any made here.
  const [flashIds, setFlashIds] = useState<string[]>(() => {
    if (origin && origin.ok) return origin.created.map((lead) => lead.user_id);
    return [];
  });

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const busy = creating || resettingId !== null;
  const shownName = companyName || data?.company.name || 'this company';

  // Load (and reload) the logins. `live` drops an answer that arrives after
  // the dialog closed or after a newer reload started.
  useEffect(() => {
    let live = true;
    setLoadState((previous) => (previous === 'ready' ? 'ready' : 'loading'));
    sparkInternal
      .logins(companyId)
      .then((response) => {
        if (!live) return;
        setData(response);
        setLoadState('ready');
      })
      .catch(() => {
        if (live) setLoadState('error');
      });
    return () => {
      live = false;
    };
  }, [companyId, reloadTick]);

  /** Load the list again (Retry, and after creating or resetting). */
  function reload(): void {
    setReloadTick((tick) => tick + 1);
  }

  /** Retry from the error state: show the skeleton again while it loads. */
  function retryLoad(): void {
    setLoadState('loading');
    reload();
  }

  /** Create a lead login for every department that has none, then refresh. */
  async function createMissingLeads(): Promise<void> {
    setCreating(true);
    setCreateError('');
    setCreateResult(null);
    try {
      // Every new lead gets the fixed Spark temporary password on the server.
      const result = await sparkInternal.createLeads(companyId);
      setCreateResult(result);
      setFlashIds(result.created.map((lead) => lead.user_id));
      setWizardErrorDismissed(true);
      reload();
    } catch (error) {
      setCreateError(errorMessage(error, "Couldn't create the lead logins."));
    } finally {
      setCreating(false);
    }
  }

  /** Give one login a new temporary password, then show it on that row. */
  async function resetPassword(login: SparkLogin): Promise<void> {
    setConfirmReset(null);
    setResettingId(login.user_id);
    setResetError('');
    setResetNotice('');
    try {
      const result = await sparkInternal.resetPassword(companyId, login.user_id);
      setResetPasswords((previous) => ({ ...previous, [result.user_id]: result.temp_password }));
      setRevealed((previous) => ({ ...previous, [result.user_id]: true }));
      setResetNotice(`New temporary password made for ${result.email}.`);
      reload();
    } catch (error) {
      setResetError(errorMessage(error, "Couldn't reset the password."));
    } finally {
      setResettingId(null);
    }
  }

  /** Flip the inline password of one row (mixed-password mode only). */
  function toggleReveal(userId: string): void {
    setRevealed((previous) => ({ ...previous, [userId]: !previous[userId] }));
  }

  /** Save the shared password and every email as a plain-text sheet. */
  function downloadSheet(password: string): void {
    if (!data) return;
    const slug = makeSlug(shownName, COMPANY_SLUG_MAX_LENGTH, 'company');
    downloadText(`centriyon-logins-${slug}.txt`, buildLoginsText(shownName, password, waitingLogins(sortLoginsByRole(data.logins))));
  }

  /** Radix close request (Escape, backdrop). Blocked while a request is running. */
  function handleOpenChange(open: boolean): void {
    if (open) return;
    if (busy) return;
    onClose();
  }

  const logins = sortLoginsByRole(data?.logins ?? []);
  const missingCount = data?.departments_without_lead ?? 0;
  const passwordView = choosePasswordView(logins, resetPasswords);
  const fromWizardOk = origin !== null && origin.ok;
  let wizardError: string | null = null;
  if (origin && origin.ok === false && !wizardErrorDismissed) wizardError = origin.error;
  const fromWizardFailed = wizardError !== null;
  const reduceMotion = prefersReducedMotion();

  let subtitle = "Sign-in details for this company's admin, project manager and leads.";
  if (fromWizardOk) {
    subtitle = 'Share these sign-in details with your team. Each person sets their own password the first time.';
  }

  return (
    <Dialog.Root open onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" style={{ zIndex: DIALOG_Z_INDEX }}>
          <Dialog.Content
            className="modal-content analysis-pop"
            data-testid="logins-dialog"
            style={{ width: 600, maxWidth: '96vw' }}
            onOpenAutoFocus={(event) => {
              // Land on ✕, not on the first Copy button.
              event.preventDefault();
              closeButtonRef.current?.focus();
            }}
            onEscapeKeyDown={(event) => {
              if (busy) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (busy) event.preventDefault();
            }}
          >
            {/* Header */}
            <div style={{ padding: '20px 24px 6px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Dialog.Title style={{ fontSize: 16, fontWeight: 800, color: '#1A1D2E', margin: 0 }}>
                  {fromWizardOk ? (
                    <>
                      <DoneCheck />
                      Logins created
                    </>
                  ) : (
                    `Logins · ${shownName}`
                  )}
                </Dialog.Title>
                <Dialog.Description style={{ fontSize: 12, color: '#5A6080', marginTop: 4 }}>
                  {subtitle}
                </Dialog.Description>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="Close"
                onClick={onClose}
                disabled={busy}
                style={{
                  width: 28,
                  height: 28,
                  flexShrink: 0,
                  borderRadius: '50%',
                  border: '1.5px solid #E2E4F0',
                  background: '#fff',
                  cursor: busy ? 'not-allowed' : 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '8px 24px 4px' }}>
              {fromWizardFailed && (
                <div role="alert" style={{ ...ERROR_CALLOUT, marginTop: 4, marginBottom: 12 }}>
                  We couldn't create the department lead logins. {wizardError}
                </div>
              )}

              {loadState === 'loading' && <LoadingSkeleton />}

              {loadState === 'error' && (
                <div style={{ padding: 24, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: '#DC2626', marginBottom: 10 }}>Couldn't load the logins.</div>
                  <button type="button" className="btn bs bsm" onClick={retryLoad}>
                    Retry
                  </button>
                </div>
              )}

              {loadState === 'ready' && (
                <>
                  <PasswordSection view={passwordView} onDownload={downloadSheet} disabled={busy} />

                  {createResult && (
                    <div role="status" style={SUCCESS_CALLOUT}>
                      {createdNoticeText(createResult)}
                    </div>
                  )}
                  {createError && (
                    <div role="alert" style={ERROR_CALLOUT}>
                      {createError}
                    </div>
                  )}
                  {resetNotice && (
                    <div role="status" style={SUCCESS_CALLOUT}>
                      {resetNotice}
                    </div>
                  )}
                  {resetError && (
                    <div role="alert" style={ERROR_CALLOUT}>
                      {resetError}
                    </div>
                  )}

                  {logins.length === 0 ? (
                    <div style={{ padding: '28px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1D2E' }}>
                        No logins for this company yet.
                      </div>
                      <div style={{ fontSize: 12, color: '#9BA3C4', marginTop: 4 }}>
                        {missingCount > 0
                          ? 'Create lead logins for its departments below.'
                          : 'Admin and project manager logins can only be made when you add a company.'}
                      </div>
                    </div>
                  ) : (
                    <LoginsTable
                      logins={logins}
                      mixed={passwordView.kind === 'mixed'}
                      resetPasswords={resetPasswords}
                      revealed={revealed}
                      flashIds={reduceMotion ? [] : flashIds}
                      resettingId={resettingId}
                      busy={busy}
                      onToggleReveal={toggleReveal}
                      onAskReset={(login) => {
                        setResetError('');
                        setConfirmReset(login);
                      }}
                    />
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '14px 24px 18px',
                borderTop: '1px solid #ECEEF8',
                marginTop: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              {loadState === 'ready' && missingCount > 0 && (
                <>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: '#B45309' }}>
                    {missingLeadsText(missingCount)}
                  </span>
                  <button
                    type="button"
                    className={fromWizardFailed ? 'btn bp bsm' : 'btn bs bsm'}
                    onClick={createMissingLeads}
                    disabled={busy}
                  >
                    {creating ? 'Creating…' : 'Create missing leads'}
                  </button>
                </>
              )}
              <button
                type="button"
                className="btn bp"
                style={{ marginLeft: 'auto' }}
                onClick={onClose}
                disabled={busy || loadState === 'loading'}
              >
                Done
              </button>
            </div>

            {confirmReset && (
              <ResetPasswordConfirm
                email={confirmReset.email}
                onCancel={() => setConfirmReset(null)}
                onConfirm={() => resetPassword(confirmReset)}
              />
            )}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** The block above the table: the shared plate, or a line saying why there isn't one. */
function PasswordSection({
  view,
  onDownload,
  disabled,
}: {
  view: PasswordView;
  onDownload: (password: string) => void;
  disabled: boolean;
}) {
  if (view.kind === 'none') return null;

  if (view.kind === 'shared') {
    return (
      <div>
        <div className="fl-label">Temporary password</div>
        <TempPasswordPlate
          password={view.password}
          size="lg"
          disabled={disabled}
          extraActions={
            <button type="button" className="btn bs bsm" onClick={() => onDownload(view.password)} disabled={disabled}>
              Download .txt
            </button>
          }
        />
        <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 6 }}>
          Each person sets their own password the first time they sign in.
        </div>
      </div>
    );
  }

  if (view.kind === 'all-set') {
    return (
      <div style={{ fontSize: 12, color: '#5A6080', background: '#F2F3FA', borderRadius: 10, padding: '10px 12px' }}>
        Everyone has set their own password.
      </div>
    );
  }

  if (view.kind === 'unreadable') {
    return <div style={AMBER_CALLOUT}>The temporary password can't be shown again on this server.</div>;
  }

  // Mixed: passwords differ, so each waiting row gets its own Show.
  return (
    <div style={{ fontSize: 12, color: '#5A6080', background: '#F2F3FA', borderRadius: 10, padding: '10px 12px' }}>
      These logins have different temporary passwords. Use Show on a row to see its one.
      {view.someUnreadable && (
        <div style={{ ...AMBER_CALLOUT, marginTop: 8 }}>
          Some temporary passwords can't be shown again on this server.
        </div>
      )}
    </div>
  );
}

/** The logins table. Its body is the dialog's only scroller; the header sticks. */
function LoginsTable({
  logins,
  mixed,
  resetPasswords,
  revealed,
  flashIds,
  resettingId,
  busy,
  onToggleReveal,
  onAskReset,
}: {
  logins: SparkLogin[];
  mixed: boolean;
  resetPasswords: Record<string, string>;
  revealed: Record<string, boolean>;
  flashIds: string[];
  resettingId: string | null;
  busy: boolean;
  onToggleReveal: (userId: string) => void;
  onAskReset: (login: SparkLogin) => void;
}) {
  // Wider only when some row has a text Show button.
  const actionColumnWidth = mixed ? ACTION_COLUMN_WIDTH_WITH_SHOW : ACTION_COLUMN_WIDTH;
  return (
    <div style={{ border: '1px solid #ECEEF8', borderRadius: 12, overflow: 'hidden', marginTop: 14 }}>
      <div style={{ maxHeight: 'min(360px, calc(90vh - 340px))', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <caption className="sr-only">Logins</caption>
          <thead>
            <tr>
              {/* ui.md widths (role 130, status 160). The Reset action is a 28px
                  icon in a narrow last column, so the email, which is what this
                  dialog is for, keeps the room. */}
              <th style={{ ...TH, width: 130 }}>Role</th>
              <th style={TH}>Email</th>
              <th style={{ ...TH, width: 160 }}>Status</th>
              <th style={{ ...TH, width: actionColumnWidth, padding: ACTION_CELL_PADDING }}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {logins.map((login) => {
              const sparkMade = isSparkMadeLogin(login);
              const password = passwordFor(login, resetPasswords);
              const canShow = mixed && sparkMade && login.must_change_password && password !== null;
              const isRevealed = canShow && revealed[login.user_id] === true;
              const flash = flashIds.includes(login.user_id);
              return (
                <LoginRow
                  key={login.user_id}
                  login={login}
                  sparkMade={sparkMade}
                  password={password}
                  canShow={canShow}
                  isRevealed={isRevealed}
                  flash={flash}
                  resetting={resettingId === login.user_id}
                  busy={busy}
                  onToggleReveal={() => onToggleReveal(login.user_id)}
                  onAskReset={() => onAskReset(login)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * One login. In mixed-password mode a Spark-made waiting row gets a text Show
 * button, and its password appears as a small chip under the email.
 * A real invited colleague gets no Show, and a disabled Reset that says why.
 */
function LoginRow({
  login,
  sparkMade,
  password,
  canShow,
  isRevealed,
  flash,
  resetting,
  busy,
  onToggleReveal,
  onAskReset,
}: {
  login: SparkLogin;
  sparkMade: boolean;
  password: string | null;
  canShow: boolean;
  isRevealed: boolean;
  flash: boolean;
  resetting: boolean;
  busy: boolean;
  onToggleReveal: () => void;
  onAskReset: () => void;
}) {
  const rowStyle: React.CSSProperties = flash ? { animation: FLASH_ANIMATION } : {};
  return (
    <tr data-testid={`login-row-${login.user_id}`} data-flash={flash ? 'true' : undefined} style={rowStyle}>
      <td style={TD}>
        <RoleBadge login={login} />
      </td>
      <td style={TD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
          <span
            title={login.email}
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
          >
            {login.email}
          </span>
          <CopyEmailButton email={login.email} />
        </div>
        {isRevealed && password && <RevealedPasswordChip password={password} disabled={busy} />}
      </td>
      <td style={TD}>
        <StatusBadge login={login} />
      </td>
      <td style={{ ...TD, padding: ACTION_CELL_PADDING, textAlign: 'right' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
          {canShow && (
            <button
              type="button"
              className="btn bs bsm"
              aria-label={`${isRevealed ? 'Hide' : 'Show'} password for ${login.email}`}
              aria-pressed={isRevealed}
              onClick={onToggleReveal}
              disabled={busy}
            >
              {isRevealed ? 'Hide' : 'Show'}
            </button>
          )}
          {sparkMade ? (
            <button
              type="button"
              aria-label={`Reset password for ${login.email}`}
              aria-busy={resetting}
              title={resetting ? 'Resetting…' : 'Reset password'}
              className={ICON_BUTTON_CLASS}
              onClick={onAskReset}
              disabled={busy}
              style={ICON_BUTTON}
            >
              <ResetIcon spinning={resetting} />
            </button>
          ) : (
            // The title sits on a wrapper because some browsers show no tooltip
            // on a disabled button. The server refuses this reset anyway (403).
            <span title={REAL_ACCOUNT_RESET_TITLE} style={{ display: 'inline-flex' }}>
              <button
                type="button"
                aria-label={`Reset password for ${login.email} is not available. ${REAL_ACCOUNT_RESET_TITLE}`}
                className={ICON_BUTTON_CLASS}
                disabled
                style={{ ...ICON_BUTTON, cursor: 'not-allowed' }}
              >
                <ResetIcon spinning={false} />
              </button>
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}
