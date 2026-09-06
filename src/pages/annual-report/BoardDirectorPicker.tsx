// Board report · step 1 — the board members behind the profiles/CVs slot.
//
// BR32 is built from the director records already on the platform, so this
// shows who those are and saves them as the section's source. Like the meetings
// picker there is no per-person judgement to make: everyone on the board goes
// in, and a director with no CV still gets a row with an empty CV cell.

import { useCallback, useEffect, useState } from 'react';
import { ApiError, boardReports } from '@/lib/api';
import { Spinner } from '@/components/shared/Spinner';
import type { BoardDirectorsResponse } from '@/types/board';
import { errorMessage } from './board-helpers';
import { ACCENT, BORDER, BORDER_SOFT, FAINT, INK, MONO, MUTED, RED } from './board-ui';

export default function BoardDirectorPicker({
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
  const [data, setData] = useState<BoardDirectorsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await boardReports.getSectionDirectors(reportId, sectionCode));
    } catch (err: unknown) {
      // 404 here is "no such report, or not yours" — every board endpoint hides
      // which. It is never "this server has no picker".
      setError(errorMessage(err, 'Could not load the board members.'));
    }
  }, [reportId, sectionCode]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!data) return;
    setSaving(true);
    setError(null);
    try {
      await boardReports.setSectionDirectors(
        reportId,
        sectionCode,
        data.directors.map((d) => d.id),
      );
      onSaved();
    } catch (err: unknown) {
      // 404 — someone here is no longer on this company. Reloading is the fix;
      // retrying the same list would just 404 again.
      if (err instanceof ApiError && err.status === 404) {
        setError('One of those people is no longer on the board — the list has been refreshed.');
        await load();
      } else {
        setError(errorMessage(err, 'Could not save that selection.'));
      }
    } finally {
      setSaving(false);
    }
  };

  const total = data?.directors.length ?? 0;
  const saved = data?.selected_ids?.length ?? 0;

  const frame = {
    marginTop: 10,
    border: `1px solid ${BORDER}`,
    borderRadius: 10,
    background: '#FAFBFE',
    overflow: 'hidden' as const,
  };

  return (
    <div style={frame}>
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
        <span style={{ fontSize: 11.5, fontWeight: 700, color: INK }}>Board members on file</span>
        <span style={{ flex: 1 }} />
        <button
          className="btn bp bsm"
          disabled={disabled || saving || !data || total === 0}
          title={data && total === 0 ? 'No board members on file' : undefined}
          onClick={save}
        >
          {saving ? 'Saving…' : 'Include these'}
        </button>
      </div>

      {error && <div style={{ padding: '8px 12px', fontSize: 11.5, color: RED }}>{error}</div>}

      {disabled && (
        <div style={{ padding: '8px 12px', fontSize: 11.5, color: MUTED }}>
          This report is approved, so its board member selection is read-only.
        </div>
      )}

      {!data ? (
        <Spinner pad={24} />
      ) : total === 0 ? (
        <div style={{ padding: '14px 12px', fontSize: 12, color: MUTED }}>
          No board members are on file for this company. Add them on the Team screen, or close this
          and choose Upload file instead.
        </div>
      ) : (
        // No list: there is no per-person judgement to make, so the count is
        // the whole story. Who they are is the Team screen's job.
        <div style={{ padding: '14px 12px', fontSize: 12, color: MUTED }}>
          <span style={{ fontFamily: MONO, fontWeight: 700, color: ACCENT }}>{total}</span> board
          member{total === 1 ? '' : 's'} go into this section.{' '}
          {saved > 0 && <span style={{ color: FAINT }}>{saved} already included.</span>}
        </div>
      )}
    </div>
  );
}
