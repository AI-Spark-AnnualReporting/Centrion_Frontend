// Board report · step 1 — the meetings behind a `kind: "meetings"` slot.
//
// BR35 (board & committee) and BR36 (general assembly) aren't filled by
// uploading anything: the meetings are already on the platform. The operator
// picks a period and every meeting held in it goes into the section — there is
// no per-meeting judgement to make, so no list is offered. Saving PUTs the
// window itself; the server resolves it, drops the meetings with no minutes and
// answers with what will print. The Sources screen refetches afterwards exactly
// as it does after an upload.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, boardReports } from '@/lib/api';
import { Spinner } from '@/components/shared/Spinner';
import type { BoardMeetingFilters, BoardMeetingsResponse } from '@/types/board';
import { errorMessage } from './board-helpers';
import { ACCENT, BORDER, BORDER_SOFT, FAINT, INK, MONO, MUTED, RED } from './board-ui';

/**
 * Set or clear one date bound. Clearing drops the key entirely rather than
 * sending null: an omitted date means "the server's default" (the report's
 * fiscal year), so the control goes back to showing that default too.
 */
function setDate(
  f: BoardMeetingFilters,
  key: 'date_from' | 'date_to',
  value: string,
): BoardMeetingFilters {
  const next = { ...f };
  if (value) next[key] = value;
  else delete next[key];
  return next;
}

export default function BoardMeetingPicker({
  reportId,
  sectionCode,
  disabled,
  onSaved,
}: {
  reportId: string;
  sectionCode: string;
  disabled: boolean;
  /** Saved — the Sources screen refetches its slots. */
  onSaved: () => void;
}) {
  // The user's overrides only — a key that isn't here is left to the server's
  // default and displayed from the `filters` it echoes back. `meeting_type` is
  // always `all`: the section decides what it accepts, and the server's
  // `board_meeting` default is the wrong list for BR36.
  const [filters, setFilters] = useState<BoardMeetingFilters>({ meeting_type: 'all' });
  const [data, setData] = useState<BoardMeetingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // What the last save actually stored, until the next load says otherwise.
  const [justSaved, setJustSaved] = useState<number | null>(null);
  const seeded = useRef(false);

  const load = useCallback(
    async (f: BoardMeetingFilters) => {
      setError(null);
      try {
        const res = await boardReports.getSectionMeetings(reportId, sectionCode, f);
        setData(res);
        // Adopt the saved period once, so the dates on screen are the ones the
        // section is actually built from — and the preview below matches them.
        if (!seeded.current) {
          seeded.current = true;
          if (res.saved_period) setFilters((prev) => ({ ...prev, ...res.saved_period }));
        }
      } catch (err: unknown) {
        setError(errorMessage(err, 'Could not load the meetings.'));
      }
    },
    [reportId, sectionCode],
  );

  useEffect(() => {
    void load(filters);
  }, [load, filters]);

  // The period itself is the selection. Never called on an empty one — the
  // button is off, so a mis-typed date can't wipe a saved selection.
  const save = async () => {
    if (!data) return;
    setSaving(true);
    setError(null);
    try {
      const res = await boardReports.setSectionMeetings(reportId, sectionCode, {
        date_from: from,
        date_to: to,
      });
      setJustSaved(res.count);
      onSaved();
    } catch (err: unknown) {
      // 400 — the server wouldn't take that window. Reloading shows what it does
      // hold; retrying the same dates would just 400 again.
      if (err instanceof ApiError && err.status === 400) {
        setError('The server would not accept that period — check the dates.');
        await load(filters);
      } else {
        setError(errorMessage(err, 'Could not save that selection.'));
      }
    } finally {
      setSaving(false);
    }
  };

  // What a control shows: the operator's own value where they set one, otherwise
  // whatever the server said it filtered on. Never the raw echo — the server
  // re-asserts its defaults, so a cleared date would spring back on the reload.
  const shown = <K extends keyof BoardMeetingFilters>(k: K): string =>
    (k in filters ? filters[k] : data?.filters?.[k]) ?? '';

  const from = shown('date_from');
  const to = shown('date_to');
  const inPeriod = data?.meetings.length ?? 0;
  // Meetings with no minutes are dropped server-side, so this — not the window
  // size — is what the section will contain.
  const willPrint = data?.with_minutes_count ?? inPeriod;
  const saved = justSaved ?? data?.selected_ids?.length ?? 0;

  return (
    <div
      style={{
        marginTop: 10,
        border: `1px solid ${BORDER}`,
        borderRadius: 10,
        background: '#FAFBFE',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          padding: '10px 12px',
          borderBottom: `1px solid ${BORDER_SOFT}`,
        }}
      >
        <span style={{ fontSize: 11.5, fontWeight: 700, color: INK }}>Pick duration</span>
        {/* Native date inputs — no picker library for two dates. */}
        <input
          type="date"
          className="inp"
          value={shown('date_from')}
          onChange={(e) => setFilters((f) => setDate(f, 'date_from', e.target.value))}
          style={{ fontSize: 12, padding: '6px 8px', width: 'auto' }}
        />
        <span style={{ fontSize: 11, color: FAINT }}>to</span>
        <input
          type="date"
          className="inp"
          value={shown('date_to')}
          onChange={(e) => setFilters((f) => setDate(f, 'date_to', e.target.value))}
          style={{ fontSize: 12, padding: '6px 8px', width: 'auto' }}
        />
        <span style={{ flex: 1 }} />
        <button
          className="btn bp bsm"
          disabled={disabled || saving || !data || willPrint === 0 || !from || !to}
          title={data && willPrint === 0 ? 'No minutes in this period' : undefined}
          onClick={save}
        >
          {saving ? 'Saving…' : 'Save selection'}
        </button>
      </div>

      {error && <div style={{ padding: '8px 12px', fontSize: 11.5, color: RED }}>{error}</div>}

      {/* Dates stay live so the period can still be read — but nothing can be
          changed, and a dead Save button with no explanation reads as a bug. */}
      {disabled && (
        <div style={{ padding: '8px 12px', fontSize: 11.5, color: MUTED }}>
          This report is approved, so its meeting selection is read-only.
        </div>
      )}

      {!data ? (
        <Spinner pad={24} />
      ) : (
        <div style={{ padding: '14px 12px', fontSize: 12, color: MUTED }}>
          {willPrint > 0 ? (
            <>
              <span style={{ fontFamily: MONO, fontWeight: 700, color: ACCENT }}>{willPrint}</span>{' '}
              meeting{willPrint === 1 ? '' : 's'} will be included.{' '}
              {inPeriod > willPrint && (
                <span style={{ color: FAINT }}>
                  {inPeriod - willPrint} other{inPeriod - willPrint === 1 ? '' : 's'} in this period
                  have no minutes.{' '}
                </span>
              )}
              {saved > 0 && (
                <span style={{ color: FAINT }}>
                  {saved} currently saved — Save selection replaces it.
                </span>
              )}
            </>
          ) : (
            <span>
              No minutes in this period. Widen the dates, or close this and upload the minutes
              instead.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
