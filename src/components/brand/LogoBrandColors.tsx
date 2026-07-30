import { useRef, useState } from 'react';
import { auth } from '@/lib/api';
import type { BrandColors } from '@/types/brand';

// Auto-filling the brand colors from an uploaded logo, shared by the onboarding
// Brand step and the Brand Identity page so the two behave identically.
//
// The hexes come from the logo's real pixels server-side (see
// Centriton/logo_colors.py) — the model only decides which sampled color is the
// primary and which is the secondary.

/** Drives detection for one screen. Never throws and never blocks: this is a
 * convenience on top of a picker that already works by hand.
 */
export function useLogoBrandColors(onChange: (next: BrandColors) => void) {
  const [detecting, setDetecting] = useState(false);
  // The colors that were in the picker before we replaced them — doubles as the
  // "we changed these" flag, so there's no second piece of state to keep in sync.
  const [previous, setPrevious] = useState<BrandColors | null>(null);

  // Bumped to invalidate an in-flight detection. Two things need this: picking a
  // second logo quickly (the first response must not win), and the user choosing
  // a color by hand (a deliberate choice must not be overwritten a second later).
  const runRef = useRef(0);
  // Read through a ref so a resolved promise can never call a stale handler.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const detectFrom = (dataUri: string, current: BrandColors) => {
    const run = ++runRef.current;
    setDetecting(true);
    // Promise.resolve().then() rather than calling straight through, so a
    // SYNCHRONOUS throw becomes a rejection this function handles instead of
    // escaping into the caller's promise chain. Without it, the upload handler's
    // own .catch() reports a detection bug as "we couldn't read that image".
    Promise.resolve()
      .then(() => auth.detectLogoColors(dataUri))
      .then((res) => {
        if (run !== runRef.current) return;
        // source === "none" (a white/black-only logo) means change nothing,
        // which is different from having failed.
        if (!res.primary || !res.secondary) return;
        setPrevious(current);
        onChangeRef.current({
          primary: res.primary,
          secondary: res.secondary,
          palette_key: res.palette_key || 'custom',
        });
      })
      .catch(() => {
        /* Swallowed on purpose. The logo is already accepted and the colors are
           still editable by hand, so an error here has nothing to tell the user. */
      })
      .finally(() => {
        if (run === runRef.current) setDetecting(false);
      });
  };

  const undo = () => {
    if (!previous) return;
    onChangeRef.current(previous);
    setPrevious(null);
  };

  /** Called when the user picks colors themselves, or clears the logo. Drops the
   * note and cancels any in-flight detection so it can't overwrite them. */
  const forget = () => {
    runRef.current++;
    setDetecting(false);
    setPrevious(null);
  };

  return { detecting, applied: previous !== null, detectFrom, undo, forget };
}

/** The one-line status under the logo field. Renders nothing when idle. */
export function LogoColorNote({
  detecting, applied, onUndo,
}: { detecting: boolean; applied: boolean; onUndo: () => void }) {
  if (!detecting && !applied) return null;

  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginTop: 8, fontSize: 11.5, color: '#5A6080',
      }}
    >
      {detecting ? (
        <>
          <span className="proc-ring" style={{ width: 12, height: 12, borderWidth: 2 }} />
          Reading your logo’s colors…
        </>
      ) : (
        <>
          <span aria-hidden>🎨</span>
          Brand colors set from your logo.
          <button
            type="button"
            onClick={onUndo}
            style={{
              padding: 0, border: 'none', background: 'none', cursor: 'pointer',
              font: 'inherit', fontWeight: 700, color: '#4040C8',
              textDecoration: 'underline',
            }}
          >
            Undo
          </button>
        </>
      )}
    </div>
  );
}
