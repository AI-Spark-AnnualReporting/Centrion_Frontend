import { useCallback, useEffect, useState } from 'react';
import { companies } from '@/lib/api';
import type { DepartmentSuggestionsResponse } from '@/types/company';

/* ══════════════════════════════════════════════════════════════════════
   "Based on your annual report you should have these departments."

   Advice only. Nothing here creates a department — picking a missing one
   opens the normal Add Department form with the name filled in, and the
   user still submits it themselves.

   Two shapes:
     full    — the departments page. Both lists + a dismiss button.
     compact — the annual-cycle department picker. One line, no dismiss;
               the user is mid-task setting up a cycle and shouldn't be
               pulled away.

   Renders NOTHING when there is nothing worth saying: no annual report
   analysed yet, nothing missing, dismissed, or the fetch failed. Silent
   failure is the house rule for non-critical fetches (see
   CycleDetailPage's `.catch(() => setAllDepartments([]))`).
═══════════════════════════════════════════════════════════════════════ */

const PRIMARY = '#4040C8';
const TINT_BG = 'rgba(64,64,200,.06)';
const TINT_BORDER = '1px solid rgba(64,64,200,.18)';
const INK = '#1A1D2E';
const BODY = '#3A3F5C';

export interface DepartmentSuggestionsBannerProps {
  /** Fetches for this company when `data` is not supplied. */
  companyId?: string | null;
  /** Pre-fetched payload, for a parent that already has it (the picker case). */
  data?: DepartmentSuggestionsResponse | null;
  variant?: 'full' | 'compact';
  /** Full variant: user picked a missing department to create. */
  onCreate?: (name: string) => void;
  /** Change this to refetch — e.g. after a department is created. */
  refreshKey?: number;
}

function Chip({ label, onClick }: { label: string; onClick?: () => void }) {
  const base: React.CSSProperties = {
    display: 'inline-block',
    padding: '3px 9px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1.6,
    border: '1px solid rgba(64,64,200,.25)',
    background: '#FFF',
    color: PRIMARY,
  };
  if (!onClick) return <span style={base}>{label}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Add "${label}" as a department`}
      style={{ ...base, cursor: 'pointer' }}
    >
      {label} +
    </button>
  );
}

export function DepartmentSuggestionsBanner({
  companyId,
  data,
  variant = 'full',
  onCreate,
  refreshKey = 0,
}: DepartmentSuggestionsBannerProps) {
  const [fetched, setFetched] = useState<DepartmentSuggestionsResponse | null>(null);
  const [hidden, setHidden] = useState(false);

  const provided = data !== undefined;

  useEffect(() => {
    if (provided || !companyId) return;
    let cancelled = false;
    companies
      .getDepartmentSuggestions(companyId)
      .then((res) => {
        if (!cancelled) setFetched(res);
      })
      // Advice is not worth an error state — if it fails, show nothing at all.
      .catch(() => {
        if (!cancelled) setFetched(null);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, provided, refreshKey]);

  const payload = provided ? data : fetched;

  const dismiss = useCallback(() => {
    setHidden(true); // optimistic — the banner is advisory, a failed write costs nothing
    if (companyId) companies.dismissDepartmentSuggestions(companyId).catch(() => {});
  }, [companyId]);

  if (hidden || !payload || payload.dismissed) return null;

  const suggested = payload.suggested ?? [];
  const missing = payload.missing ?? [];
  // Nothing missing means they already have everything the report implied — saying so
  // would be noise on a page they visit for other reasons.
  if (!suggested.length || !missing.length) return null;

  if (variant === 'compact') {
    return (
      <div
        role="status"
        style={{
          display: 'flex',
          gap: 8,
          padding: '10px 12px',
          borderRadius: 10,
          background: TINT_BG,
          border: TINT_BORDER,
          fontSize: 11.5,
          color: BODY,
          lineHeight: 1.5,
          marginBottom: 14,
        }}
      >
        <span aria-hidden style={{ color: PRIMARY, fontWeight: 800 }}>i</span>
        <span>
          Your annual report also points to{' '}
          <strong style={{ color: INK }}>{missing.map((m) => m.name).join(', ')}</strong>
          {missing.length === 1 ? ' — not set up yet.' : ' — not set up yet.'}
        </span>
      </div>
    );
  }

  return (
    <div
      role="status"
      style={{
        position: 'relative',
        padding: '12px 14px',
        paddingRight: 44,
        borderRadius: 10,
        background: TINT_BG,
        border: TINT_BORDER,
        marginBottom: 14,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: INK, marginBottom: 8 }}>
        Based on your previous reports, we think you should have these departments
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {suggested.map((s) => (
          <Chip key={s.name} label={s.name} />
        ))}
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: BODY, marginBottom: 6 }}>
        You're currently missing these ones
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {missing.map((m) => (
          <Chip
            key={m.name}
            label={m.name}
            onClick={onCreate ? () => onCreate(m.name) : undefined}
          />
        ))}
      </div>

      {onCreate && (
        <div style={{ fontSize: 10.5, color: '#9BA3C4', marginTop: 8 }}>
          Pick one to add it — you'll review the details before it's created.
        </div>
      )}

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          width: 26,
          height: 26,
          display: 'grid',
          placeItems: 'center',
          borderRadius: 999,
          border: 'none',
          background: 'transparent',
          color: '#9BA3C4',
          cursor: 'pointer',
          fontSize: 14,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}

export default DepartmentSuggestionsBanner;
