import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { companies } from '@/lib/api';
import {
  addSuggestedDepartments,
  type AddState,
  type AddSuggestedResult,
} from '@/lib/add-suggested-departments';
import {
  refreshDepartmentSuggestions,
  useDepartmentSuggestions,
} from '@/lib/department-suggestions';
import type { DepartmentSuggestion, DepartmentSuggestionsResponse } from '@/types/company';

/* ══════════════════════════════════════════════════════════════════════
   "From your last annual report, these departments shape your reporting."

   The list is the whole picture, not just the gaps: every department the
   report implied, where the STATUS IS THE STYLING. Ones they already have
   sit quiet in grey with a check; ones they don't are indigo and active.
   That way the row reads as "here's what your reporting involves, and
   here's what's missing from it" in one pass, instead of printing the
   same names twice under two headings.

   Two ways to act, both of them the user's own decision — we suggest, we
   never provision on our own:
     • pick one name  → opens the normal Add Department form, filled in,
                        and they submit it themselves.
     • "Add all"      → creates exactly the missing names shown, on that
                        click. Each chip reports its own progress, and a
                        refusal leaves that one chip actionable rather
                        than failing the batch (see
                        lib/add-suggested-departments.ts).

   Two shapes:
     full    — the departments page. Both actions, and dismissible.
     compact — the annual-cycle department picker. Read-only, with a link
               out; they're mid-task setting up a cycle.

   Renders NOTHING when there is nothing worth saying: no annual report
   analysed yet, nothing missing, dismissed, or the fetch failed. Silent
   failure is the house rule for non-critical fetches (see
   CycleDetailPage's `.catch(() => setAllDepartments([]))`). The one
   exception is the moment right after "Add all": nothing is missing any
   more, but vanishing mid-click would leave them wondering whether it
   worked, so the banner stays to say what it did.
═══════════════════════════════════════════════════════════════════════ */

const PRIMARY = '#4040C8';
const TINT_BG = 'rgba(64,64,200,.06)';
const TINT_BORDER = '1px solid rgba(64,64,200,.18)';
const BODY = '#3A3F5C';
const MUTED = '#5A6080';
const FAINT = '#9BA3C4';
const DANGER = '#DC2626';

const DEPARTMENTS_ROUTE = '/admin-console/departments';

export interface DepartmentSuggestionsBannerProps {
  /** Fetches for this company when `data` is not supplied. */
  companyId?: string | null;
  /** Pre-fetched payload, for a parent that already has it (the picker case). */
  data?: DepartmentSuggestionsResponse | null;
  variant?: 'full' | 'compact';
  /** Full variant: user picked ONE missing department to create. The description is the
   *  report's own sentence about that department, so the form and "Add all" fill in the
   *  same thing. */
  onCreate?: (name: string, description?: string) => void;
  /** Full variant: "Add all" finished. The caller reloads its department list. */
  onAdded?: (result: AddSuggestedResult) => void;
}

const COUNT_WORDS = ['no', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}

function lower(n: number): string {
  return countWord(n).toLowerCase();
}

/** Small counter-clockwise ring, matching the app's inline spinners (KpiCards). */
function MiniSpinner({ color = PRIMARY }: { color?: string }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ animation: 'spin .8s linear infinite', flexShrink: 0 }}
    >
      <circle cx="12" cy="12" r="9" stroke={color} strokeOpacity=".22" strokeWidth="3" />
      <path d="M12 3a9 9 0 0 1 9 9" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** A department the report named. `present` is the whole visual difference; `state` is
 *  the live one, only ever set while "Add all" is working through the list. */
function Chip({
  label,
  present,
  state,
  onClick,
}: {
  label: string;
  present: boolean;
  state?: AddState;
  onClick?: () => void;
}) {
  const done = present || state === 'added';
  const failed = state === 'failed';
  const working = state === 'adding';

  const border = failed
    ? 'rgba(220,38,38,.35)'
    : done
      ? '#EDEFF7'
      : 'rgba(64,64,200,.32)';
  const color = failed ? DANGER : done ? '#8A92B2' : PRIMARY;

  const style: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '3px 9px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: done ? 500 : 700,
    lineHeight: 1.6,
    border: `1px solid ${border}`,
    background: done && !failed ? 'transparent' : '#FFF',
    color,
    cursor: onClick && !working ? 'pointer' : 'default',
    opacity: working ? 0.75 : 1,
    // The chip flips from indigo "+" to grey "✓" as its department lands; without this
    // a batch reads as a row of things blinking rather than a list being worked through.
    transition: 'color .18s ease, border-color .18s ease, opacity .18s ease',
  };

  const mark = working ? (
    <MiniSpinner />
  ) : (
    <span aria-hidden style={{ fontSize: done ? 9 : 11, color: failed ? DANGER : done ? '#C3C9DE' : PRIMARY }}>
      {failed ? '!' : done ? '✓' : '+'}
    </span>
  );

  if (!onClick || working) {
    return (
      <span style={style}>
        {mark}
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={failed ? `Add "${label}" yourself` : `Add "${label}" as a department`}
      style={style}
    >
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
  onAdded,
}: DepartmentSuggestionsBannerProps) {
  const [hidden, setHidden] = useState(false);

  // Per-department progress during "Add all", keyed by name.
  const [states, setStates] = useState<Record<string, AddState>>({});
  const [busy, setBusy] = useState(false);
  // How many this batch set out to create, fixed at the click. Counting the live `states`
  // map instead would say "1 of 3" on a six-department batch, because only three are ever
  // in flight at once.
  const [batchSize, setBatchSize] = useState(0);
  const [result, setResult] = useState<AddSuggestedResult | null>(null);
  const live = useRef(true);

  const provided = data !== undefined;

  // Shared with the top bar's button, so one request answers both and a dismiss
  // here reaches there. A parent that already has the payload passes it in.
  const fetched = useDepartmentSuggestions(provided ? undefined : companyId);
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

  // What "Add all" would create right now: still missing, and not already added in this
  // session (the payload refresh lands a moment after the last one is created).
  const pending = useMemo(
    () => rows.filter((r) => !r.present && states[r.name] !== 'added'),
    [rows, states],
  );

  const dismiss = useCallback(() => {
    setHidden(true); // optimistic — the banner is advisory, a failed write costs nothing
    if (!companyId) return;
    companies
      .dismissDepartmentSuggestions(companyId)
      // Re-read so the top bar's button goes with it, rather than lingering
      // until the next reload.
      .then(() => refreshDepartmentSuggestions(companyId))
      .catch(() => {});
  }, [companyId]);

  const addAll = useCallback(async () => {
    if (busy || !pending.length) return;
    setBusy(true);
    setResult(null);
    setBatchSize(pending.length);
    // Clear any earlier failures so a retry doesn't show last time's red chips.
    setStates({});
    const batch = await addSuggestedDepartments(pending, {
      companyId,
      onState: (name, state) => {
        if (live.current) setStates((prev) => ({ ...prev, [name]: state }));
      },
    });
    if (!live.current) return;
    setBusy(false);
    setResult(batch);
    onAdded?.(batch);
  }, [busy, pending, companyId, onAdded]);

  // Unmount guard: the batch keeps running (the departments are being created either
  // way), it just stops talking to a component that is gone.
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  if (hidden || !payload || payload.dismissed) return null;

  const missingCount = payload.missing?.length ?? 0;
  // Nothing missing means they already have everything the report implied — saying so
  // would be noise on a page they visit for other reasons. Unless "Add all" just ran,
  // in which case that IS the news.
  if (!rows.length || (!missingCount && !result)) return null;

  const canAct = variant === 'full' && !!onCreate;
  const addedCount = result?.added.length ?? 0;
  const failedCount = result?.failed.length ?? 0;
  const doneCount = Object.values(states).filter((s) => s === 'added' || s === 'failed').length;

  const lead = 'From your last annual report, we learnt that these departments shape your reporting.';

  // One line under the chips, saying the only thing that matters at this moment.
  let status: React.ReactNode;
  if (busy) {
    status = (
      <span>
        Adding {Math.min(doneCount + 1, batchSize)} of {batchSize}…{' '}
        <span style={{ color: FAINT }}>this takes a few seconds each.</span>
      </span>
    );
  } else if (result && !failedCount) {
    status = (
      <span style={{ fontWeight: 600 }}>
        All set — {lower(addedCount)} {addedCount === 1 ? 'department' : 'departments'} added.
      </span>
    );
  } else if (result) {
    status = (
      <span>
        {addedCount ? `${countWord(addedCount)} added. ` : ''}
        <span style={{ color: DANGER }}>
          {countWord(failedCount)} couldn&rsquo;t be added
        </span>
        <span style={{ color: FAINT }}>
          {' '}— try again, or pick {failedCount === 1 ? 'it' : 'them'} to add by hand.
        </span>
      </span>
    );
  } else {
    status = (
      <span>
        {missingCount === 1
          ? "One of them isn't set up yet."
          : `${countWord(missingCount)} of them aren't set up yet.`}
        {canAct ? <span style={{ color: FAINT }}> Pick one, or add them all.</span> : null}
      </span>
    );
  }

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
            state={states[r.name]}
            onClick={
              !r.present && canAct && !busy
                ? () => onCreate?.(r.name, r.reason ?? undefined)
                : undefined
            }
          />
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginTop: 10,
          fontSize: 11,
          color: MUTED,
        }}
      >
        {status}

        {canAct && pending.length > 0 && (
          <button
            type="button"
            onClick={addAll}
            disabled={busy}
            title={
              pending.length === 1
                ? `Add "${pending[0].name}"`
                : `Add all ${pending.length} missing departments`
            }
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 12px',
              fontSize: 11,
              fontWeight: 700,
              color: '#FFF',
              background: busy ? '#8D8DDC' : PRIMARY,
              border: 'none',
              borderRadius: 6,
              cursor: busy ? 'default' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {busy && <MiniSpinner color="#FFF" />}
            {busy
              ? 'Adding…'
              : pending.length === 1
                ? 'Add it'
                : `Add all ${pending.length}`}
          </button>
        )}

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

      {/* The backend's own words for the first refusal — without it a red chip is a
          dead end, and "already exists" vs "not allowed" need different answers. */}
      {!busy && failedCount > 0 && result?.failed[0]?.error && (
        <div style={{ marginTop: 6, fontSize: 10.5, color: FAINT }}>{result.failed[0].error}</div>
      )}

      {variant === 'full' && !busy && (
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
