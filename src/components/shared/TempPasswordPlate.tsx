import { useEffect, useRef, useState, type ReactNode } from 'react';

// The temporary-password "plate": the password in DM Mono on a grey card with a
// Copy button. Same look as InviteResultModal (AdminUsersPage.tsx), pulled out
// so the Spark Add company modal (size md) and the Logins dialog (size lg)
// share one. InviteResultModal keeps its own copy for now.

/** How long "Copied!" (or the keyboard hint) replaces the Copy label. */
const FEEDBACK_MS = 1800;

type CopyFeedback = 'idle' | 'copied' | 'manual';

interface TempPasswordPlateProps {
  password: string;
  /** md = 16px code, for the 480px modal. lg = 18px code, for the Logins dialog. */
  size: 'md' | 'lg';
  /** Buttons shown after Copy, e.g. "↻ New password" or "Download .txt". */
  extraActions?: ReactNode;
  /** Disables Copy while the parent is saving. */
  disabled?: boolean;
}

const SIZE_STYLES = {
  md: { padding: '12px 14px', fontSize: 16 },
  lg: { padding: 16, fontSize: 18 },
} as const;

/** True on macOS, where the copy shortcut is ⌘C rather than Ctrl+C. */
function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform = navigator.platform || navigator.userAgent || '';
  return /mac/i.test(platform);
}

/** The keyboard hint shown when the browser refuses clipboard access. */
function manualCopyHint(): string {
  if (isMacPlatform()) return 'Press ⌘C to copy';
  return 'Press Ctrl+C to copy';
}

/** Select all the text inside an element, so the user can copy it by keyboard. */
function selectElementText(element: HTMLElement | null): void {
  if (!element) return;
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Shows a temporary password with a Copy button that always gives feedback. */
export function TempPasswordPlate({ password, size, extraActions, disabled = false }: TempPasswordPlateProps) {
  const [feedback, setFeedback] = useState<CopyFeedback>('idle');
  const codeRef = useRef<HTMLElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stop a pending reset from firing after the plate is gone.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  /** Show a feedback state, then go back to the plain Copy label. */
  function showFeedback(next: CopyFeedback): void {
    setFeedback(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setFeedback('idle'), FEEDBACK_MS);
  }

  /** Fallback when the clipboard API is missing or refuses. */
  function fallBackToManualCopy(): void {
    selectElementText(codeRef.current);
    showFeedback('manual');
  }

  // writeText is missing on non-secure origins and rejects when permission is
  // denied. Today's InviteResultModal then shows nothing at all, so here we
  // select the text and tell the user which keys to press instead.
  async function copyPassword(): Promise<void> {
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (!clipboard || typeof clipboard.writeText !== 'function') {
      fallBackToManualCopy();
      return;
    }
    try {
      await clipboard.writeText(password);
      showFeedback('copied');
    } catch {
      fallBackToManualCopy();
    }
  }

  const sizeStyle = SIZE_STYLES[size];
  let copyLabel = 'Copy';
  if (feedback === 'copied') copyLabel = 'Copied!';
  if (feedback === 'manual') copyLabel = manualCopyHint();

  return (
    <div
      data-testid="temp-password-plate"
      style={{
        padding: sizeStyle.padding,
        borderRadius: 12,
        background: '#F2F3FA',
        border: '1px solid #E2E4F0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
      }}
    >
      <code
        ref={codeRef}
        data-testid="temp-password-code"
        aria-label="Temporary password"
        style={{
          fontSize: sizeStyle.fontSize,
          fontWeight: 700,
          color: '#1A1D2E',
          fontFamily: "'DM Mono', monospace",
          letterSpacing: '.5px',
          wordBreak: 'break-all',
          userSelect: 'all',
        }}
      >
        {password}
      </code>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          type="button"
          className="btn bp bsm"
          data-testid="temp-password-copy"
          onClick={copyPassword}
          disabled={disabled}
        >
          {copyLabel}
        </button>
        {extraActions}
      </div>
      {/* Screen readers hear the result of Copy without the button label changing focus. */}
      <span aria-live="polite" className="sr-only">
        {feedback === 'copied' ? 'Copied' : ''}
      </span>
    </div>
  );
}
