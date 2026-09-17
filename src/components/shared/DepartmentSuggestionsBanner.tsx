import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { companies } from '@/lib/api';
import type { DepartmentSuggestion, DepartmentSuggestionsResponse } from '@/types/company';

/* ══════════════════════════════════════════════════════════════════════
   "From your last annual report, these departments shape your reporting."

   Advice only. Nothing here creates a department — picking one opens the
   normal Add Department form with the name filled in, and the user still
   submits it themselves.

   The list is the whole picture, not just the gaps: every department the
   report implied, where the STATUS IS THE STYLING. Ones they already have
   sit quiet in grey with a check; ones they don't are indigo and active.
   That way the row reads as "here's what your reporting involves, and
   here's what's missing from it" in one pass, instead of printing the
   same names twice under two headings.

   Two shapes:
     full    — the departments page. Picking a name starts creating it,
               and it can be dismissed for good.
     compact — the annual-cycle department picker. Read-only, with a link
               out; they're mid-task setting up a cycle.

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
const MUTED = '#5A6080';
const FAINT = '#9BA3C4';

const DEPARTMENTS_ROUTE = '/admin-console/departments';

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

const COUNT_WORDS = ['no', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}

/** A department the report named. `present` is the whole visual difference. */
function Chip({
  label,
  present,
  onClick,
}: {
  label: string;
  present: boolean;
  onClick?: () => void;
}) {
  const style: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '3px 9px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: present ? 500 : 700,
    lineHeight: 1.6,
    border: `1px solid ${present ? '#EDEFF7' : 'rgba(64,64,200,.32)'}`,
    background: present ? 'transparent' : '#FFF',
    color: present ? '#8A92B2' : PRIMARY,
    cursor: onClick ? 'pointer' : 'default',
  };

  const mark = (
    <span aria-hidden style={{ fontSize: present ? 9 : 11, color: present ? '#C3C9DE' : PRIMARY }}>
      {present ? '✓' : '+'}
    </span>
  );

  if (!onClick) {
    return (
      <span style={style}>
        {mark}
        {label}
      </span>
    );
  }
  return (
    <button type="button" onClick={onClick} title={`Add "${label}" as a department`} style={style}>
      {mark}
      {label}
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

  const rows = useMemo(() => {
    const suggested = payload?.suggested ?? [];
    const missing = new Set((payload?.missing ?? []).map((m) => m.name));
    // Missing first: those are the ones worth acting on, and the report's own
    // importance ranking is preserved inside each group.
    return [...suggested]
      .map((s: DepartmentSuggestion) => ({ ...s, present: !missing.has(s.name) }))
      .sort((a, b) => Number(a.present) - Number(b.present));
  }, [payload]);

  const dismiss = useCallback(() => {
    setHidden(true); // optimistic — the banner is advisory, a failed write costs nothing
    if (companyId) companies.dismissDepartmentSuggestions(companyId).catch(() => {});
  }, [companyId]);

  if (hidden || !payload || payload.dismissed) return null;

  const missingCount = payload.missing?.length ?? 0;
  // Nothing missing means they already have everything the report implied — saying so
  // would be noise on a page they visit for other reasons.
  if (!rows.length || !missingCount) return null;

  const lead = 'From your last annual report, we learnt that these departments shape your reporting.';
  const gapLine =
    missingCount === 1
      ? "One of them isn't set up yet."
      : `${countWord(missingCount)} of them aren't set up yet.`;

  return (
    <div
      role="status"
      style={{
        position: 'relative',
        padding: '12px 14px',
        paddingRight: variant === 'full' ? 44 : 14,
        borderRadius: 10,
        background: TINT_BG,
        border: TINT_BORDER,
        marginBottom: 14,
      }}
    >
      <div style={{ fontSize: 11.5, color: BODY, lineHeight: 1.5, marginBottom: 9 }}>{lead}</div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {rows.map((r) => (
          <Chip
            key={r.name}
            label={r.name}
            present={r.present}
            onClick={!r.present && onCreate ? () => onCreate(r.name) : undefined}
          />
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginTop: 10,
          fontSize: 11,
          color: MUTED,
        }}
      >
        <span>
          {gapLine}
          {variant === 'full' && onCreate ? (
            <span style={{ color: FAINT }}> Pick one to add it.</span>
          ) : null}
        </span>

        {variant === 'compact' && (
          <Link
            to={DEPARTMENTS_ROUTE}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              fontWeight: 700,
              color: PRIMARY,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {/* Underline sits on the words only — running it under the arrow reads as a
                stray rule rather than a link. */}
            <span style={{ textDecoration: 'underline', textUnderlineOffset: 2 }}>
              Manage departments
            </span>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
              <path
                d="M2 5h6M5.6 2.4 8.2 5 5.6 7.6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        )}
      </div>

      {variant === 'full' && (
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
            color: FAINT,
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

export default DepartmentSuggestionsBanner;
