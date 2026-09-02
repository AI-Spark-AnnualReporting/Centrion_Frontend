// Board report · step 1 — the meetings picker behind a `kind: "meetings"` slot.
//
// BR35 (board & committee) and BR36 (general assembly) aren't filled by
// uploading anything: the meetings are already on the platform, so the operator
// ticks which of them the section is built from. PUT replaces the whole list —
// there is no add/remove endpoint — and the Sources screen refetches afterwards
// exactly as it does after an upload.

import { useCallback, useEffect, useState } from 'react';
import { ApiError, boardReports } from '@/lib/api';
import { Spinner } from '@/components/shared/Spinner';
import type { BoardMeetingFilters, BoardMeetingsResponse } from '@/types/board';
import { errorMessage } from './board-helpers';
import { ACCENT, BORDER, BORDER_SOFT, FAINT, INK, MONO, MUTED, RED } from './board-ui';

// Omitting a date doesn't widen the range — the server falls back to the
// report's fiscal year — so "every date" has to be asked for explicitly.
const ALL_DATES = { date_from: '1990-01-01', date_to: '2100-12-31' };

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

const label = (t: string) => t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

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
  // default and displayed from the `filters` it echoes back.
  //
  // `meeting_type` is overridden from the start: the server defaults to
  // `board_meeting`, which is the wrong list for BR36 (a general assembly is not
  // a board meeting, so that row opened on an empty list every time). Start wide
  // and let the operator narrow.
  const [filters, setFilters] = useState<BoardMeetingFilters>({ meeting_type: 'all' });
  const [data, setData] = useState<BoardMeetingsResponse | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    async (f: BoardMeetingFilters) => {
      setError(null);
      try {
        const res = await boardReports.getSectionMeetings(reportId, sectionCode, f);
        setData(res);
        // The server's selection is the truth on every load — a stale local tick
        // would silently un-select a meeting on the next save.
        setTicked(new Set(res.selected_ids ?? []));
      } catch (err: unknown) {
        setError(errorMessage(err, 'Could not load the meetings.'));
      }
    },
    [reportId, sectionCode],
  );

  useEffect(() => {
    void load(filters);
  }, [load, filters]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await boardReports.setSectionMeetings(reportId, sectionCode, [...ticked]);
      onSaved();
    } catch (err: unknown) {
      // 404 — one of the ids isn't this company's meeting any more. Reloading is
      // the fix; retrying the same list would just 404 again.
      if (err instanceof ApiError && err.status === 404) {
        setError('One of those meetings is no longer available — the list has been refreshed.');
        await load(filters);
      } else {
        setError(errorMessage(err, 'Could not save that selection.'));
      }
    } finally {
      setSaving(false);
    }
  };

  const toggle = (id: string) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const types = data?.meeting_types ?? [];
  // What a control shows: the operator's own value where they set one, otherwise
  // whatever the server said it filtered on. Never the raw echo — the server
  // re-asserts its defaults, so a cleared date would spring back on the reload.
  const shown = <K extends keyof BoardMeetingFilters>(k: K): string =>
    (k in filters ? filters[k] : data?.filters?.[k]) ?? '';

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
        <select
          className="inp"
          value={shown('meeting_type') || 'all'}
          onChange={(e) => setFilters((f) => ({ ...f, meeting_type: e.target.value }))}
          style={{ fontSize: 12, padding: '6px 8px', width: 'auto' }}
        >
          <option value="all">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {label(t)}
            </option>
          ))}
        </select>
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
        <span style={{ fontSize: 11, color: FAINT }}>{ticked.size} selected</span>
        <button className="btn bp bsm" disabled={disabled || saving || !data} onClick={save}>
          {saving ? 'Saving…' : 'Save selection'}
        </button>
      </div>

      {error && (
        <div style={{ padding: '8px 12px', fontSize: 11.5, color: RED }}>{error}</div>
      )}

      {/* Filtering stays live so the selection can still be read — but nothing
          can be changed, and a dead checkbox with no explanation reads as a bug. */}
      {disabled && (
        <div style={{ padding: '8px 12px', fontSize: 11.5, color: MUTED }}>
          This report is approved, so its meeting selection is read-only.
        </div>
      )}

      {!data ? (
        <Spinner pad={24} />
      ) : data.meetings.length === 0 ? (
        // The dates default to the report's fiscal year, so a company whose
        // meetings sit outside it opens on an empty list with no obvious way
        // out. One click drops every filter.
        <div
          style={{
            padding: '16px 12px',
            fontSize: 12,
            color: MUTED,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span>No meetings match those filters.</span>
          <button
            className="btn bs bsm"
            onClick={() => setFilters({ meeting_type: 'all', ...ALL_DATES })}
          >
            Show all meetings
          </button>
        </div>
      ) : (
        <div style={{ maxHeight: 260, overflowY: 'auto' }}>
          {data.meetings.map((m) => (
            <label
              key={m.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '9px 12px',
                borderBottom: `1px solid ${BORDER_SOFT}`,
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={ticked.has(m.id)}
                disabled={disabled}
                onChange={() => toggle(m.id)}
                style={{ marginTop: 2 }}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>{m.title}</span>
                <span style={{ display: 'block', fontSize: 11, color: FAINT, marginTop: 2 }}>
                  <span style={{ fontFamily: MONO }}>{m.meeting_date}</span> · {label(m.meeting_type)} ·{' '}
                  {m.participant_count} participant{m.participant_count === 1 ? '' : 's'}
                  {m.attendance_recorded ? ' · attendance recorded' : ''}
                </span>
              </span>
              {/* The one thing worth seeing before ticking: a meeting with no
                  minutes adds a line to the register and nothing else. */}
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: m.has_minutes ? ACCENT : FAINT,
                  flexShrink: 0,
                }}
                title={m.minutes_attachment_name ?? undefined}
              >
                {m.has_minutes ? m.minutes_attachment_name || 'Minutes' : 'No minutes'}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
