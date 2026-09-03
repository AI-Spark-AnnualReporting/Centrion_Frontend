import { useEffect, useMemo, useRef, useState } from 'react';
import { meetings as meetingsApi, team } from '@/lib/api';
import type { AttendanceStatus, Meeting, MeetingMinutes } from '@/types/meeting';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/context/AuthContext';
import { gradientFor, initialsOf } from '@/lib/avatar';

/**
 * Minutes of a meeting that has already happened — notes (typed, attached, or
 * both), the three decision buckets, and who actually turned up.
 *
 * Attendance is keyed by the meeting's current `participants` list rather than
 * by whatever the minutes record happens to hold: if the organiser edits the
 * invitee list afterwards, the roster shown here follows the meeting, and the
 * stale entries fall away on the next save.
 */

const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
// Matches what the backend accepts — anything else is a 422. Images, .doc and
// .xlsx are all out; the backend reads text out of these, and those have none
// it can reach.
const ACCEPT = '.pdf,.docx,.txt,.csv';
const ACCEPT_HINT = 'PDF, DOCX, TXT or CSV · up to 50 MB';

const SECTIONS = [
  { key: 'decision_taken', label: 'Decision Taken', placeholder: 'Decisions the board agreed on…' },
  { key: 'decision_under_review', label: 'Decision Under Review', placeholder: 'Decisions deferred for further review…' },
  { key: 'decision_abandoned', label: 'Decision Abandoned', placeholder: 'Decisions dropped or rejected…' },
] as const;

type SectionKey = (typeof SECTIONS)[number]['key'];

interface Draft {
  notes: string;
  decision_taken: string;
  decision_under_review: string;
  decision_abandoned: string;
  // As read from the server: words, or booleans on records written before the
  // switch. Always goes back out as words.
  attendance: Record<string, AttendanceStatus | boolean>;
}

const emptyDraft = (): Draft => ({
  notes: '',
  decision_taken: '',
  decision_under_review: '',
  decision_abandoned: '',
  attendance: {},
});

const draftFrom = (m: MeetingMinutes): Draft => ({
  notes: m.notes ?? '',
  decision_taken: m.decision_taken ?? '',
  decision_under_review: m.decision_under_review ?? '',
  decision_abandoned: m.decision_abandoned ?? '',
  attendance: m.attendance ?? {},
});

// One reader for every attendance value, so a legacy boolean and a current
// word can't be handled differently in two places.
const isPresent = (v: AttendanceStatus | boolean | undefined) => v !== 'absent' && v !== false;

// Participants are stored as bare addresses. A real name off the team list is
// better, but "ahsan.raza@…" → "Ahsan Raza" is a decent stand-in for anyone who
// isn't on it (external guests, people removed since the meeting).
function nameFromEmail(email: string): string {
  return (email.split('@')[0] || email)
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

function formatBytes(n: number): string {
  return n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 800, color: '#5A6080', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 7 }}>
      {children}
    </div>
  );
}

function ReadOnlyText({ value }: { value: string }) {
  return value.trim() ? (
    <div style={{ fontSize: 12, color: '#1A1D2E', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{value}</div>
  ) : (
    <div style={{ fontSize: 12, color: '#9BA3C4' }}>Nothing recorded.</div>
  );
}

export default function MeetingMinutesPanel({
  meeting,
  canEdit,
  onClose,
  onSaved,
}: {
  meeting: Meeting;
  canEdit: boolean;
  onClose: () => void;
  // Fired after a successful save so callers can drop the meeting from any
  // "needs minutes" list without refetching.
  onSaved?: () => void;
}) {
  const [saved, setSaved] = useState<MeetingMinutes | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Picked in this session but not uploaded yet.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [removeAttachment, setRemoveAttachment] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // email → full name, for the attenders roster. Decoration only: the address
  // is always shown too, so a failed lookup costs nothing.
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const companyId = useAuth().user?.company_id ?? null;

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    team
      .list(companyId)
      .then((members) => {
        if (cancelled) return;
        setTeamNames(
          Object.fromEntries(
            members.filter((m) => m.email && m.full_name).map((m) => [m.email, m.full_name]),
          ),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const displayName = (email: string) => teamNames[email]?.trim() || nameFromEmail(email);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    meetingsApi.minutes
      .get(meeting.id)
      .then((res) => {
        if (cancelled) return;
        setSaved(res.minutes);
        setDraft(res.minutes ? draftFrom(res.minutes) : emptyDraft());
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load minutes.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [meeting.id]);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // Unmarked participants count as present — the common case is that everyone
  // invited showed up, and the organiser only toggles off the no-shows.
  const attended = (email: string) => isPresent(draft.attendance[email]);

  const attendedCount = useMemo(
    () => meeting.participants.filter(attended).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meeting.participants, draft.attendance],
  );

  // Rebuilt from the meeting's current roster, so participants dropped from the
  // invite list don't linger in the record.
  const attendancePayload = (): Record<string, AttendanceStatus> => {
    const out: Record<string, AttendanceStatus> = {};
    for (const p of meeting.participants) out[p] = attended(p) ? 'present' : 'absent';
    return out;
  };

  // Nothing to save when nothing has changed. With no record yet, the first
  // save is always meaningful — it creates one.
  const dirty = useMemo(() => {
    if (pendingFile || removeAttachment) return true;
    if (!saved) return true;
    const storedAttendance = saved.attendance ?? {};
    return (
      draft.notes.trim() !== (saved.notes ?? '').trim() ||
      draft.decision_taken.trim() !== (saved.decision_taken ?? '').trim() ||
      draft.decision_under_review.trim() !== (saved.decision_under_review ?? '').trim() ||
      draft.decision_abandoned.trim() !== (saved.decision_abandoned ?? '').trim() ||
      // Compare only the current participants: a stale key left in the stored
      // map would otherwise read as a permanent unsaved change.
      meeting.participants.some((p) => isPresent(storedAttendance[p]) !== attended(p))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, saved, pendingFile, removeAttachment, meeting.participants]);

  const pickFile = (file: File | null) => {
    setError(null);
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError(`Attachment is ${formatBytes(file.size)} — the limit is 50 MB.`);
      return;
    }
    setPendingFile(file);
    setRemoveAttachment(false);
  };

  const save = async () => {
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await meetingsApi.minutes.save(meeting.id, {
        notes: draft.notes.trim(),
        decision_taken: draft.decision_taken.trim(),
        decision_under_review: draft.decision_under_review.trim(),
        decision_abandoned: draft.decision_abandoned.trim(),
        attendance: attendancePayload(),
        attachment: pendingFile,
        remove_attachment: removeAttachment,
      });
      setSaved(res.minutes);
      if (res.minutes) setDraft(draftFrom(res.minutes));
      setPendingFile(null);
      setRemoveAttachment(false);
      if (fileInput.current) fileInput.current.value = '';
      setNotice('Minutes saved.');
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save minutes.');
    } finally {
      setSubmitting(false);
    }
  };

  const storedAttachment = removeAttachment ? null : saved?.attachment_url ? saved : null;

  // A minutes record has to actually record something: typed notes or an
  // attached document — either one alone is enough.
  const hasBody = Boolean(draft.notes.trim() || pendingFile || storedAttachment);

  if (loading) {
    return (
      <div style={{ padding: '46px 0', textAlign: 'center', color: '#9BA3C4', fontSize: 12 }}>
        <div className="proc-ring" style={{ margin: '0 auto 10px', width: 26, height: 26, borderWidth: 2.5 }} />
        Loading minutes…
      </div>
    );
  }

  return (
    <>
      <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 18, maxHeight: '58vh', overflowY: 'auto' }}>
        {/* Minutes body — typed notes, an attached document, or both. */}
        <div>
          <SectionLabel>
            Minutes{canEdit && <span style={{ color: '#E5484D' }}> *</span>}
          </SectionLabel>
          {canEdit ? (
            <textarea
              className="inp"
              rows={5}
              placeholder="What was discussed…"
              value={draft.notes}
              onChange={(e) => update('notes', e.target.value)}
              style={{ resize: 'vertical' }}
            />
          ) : (
            <ReadOnlyText value={draft.notes} />
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 9 }}>
            {pendingFile ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, color: '#1A1D2E', background: '#EEEEFF', border: '1px solid rgba(64,64,200,.18)', borderRadius: 8, padding: '5px 10px' }}>
                {pendingFile.name} <span style={{ color: '#5A6080' }}>({formatBytes(pendingFile.size)})</span>
                <button
                  type="button"
                  onClick={() => {
                    setPendingFile(null);
                    if (fileInput.current) fileInput.current.value = '';
                  }}
                  aria-label="Remove selected file"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5A6080', padding: 0, lineHeight: 1 }}
                >
                  <svg width="9" height="9" viewBox="0 0 11 11" fill="none"><path d="M2 2l7 7M9 2l-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                </button>
              </span>
            ) : storedAttachment ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, background: '#F2F3FA', border: '1px solid #ECEEF8', borderRadius: 8, padding: '5px 10px' }}>
                {/* Signed URL, good for an hour, and already carries the
                    download disposition. Never persist it — a fresh one comes
                    back every time this panel loads. */}
                <a href={storedAttachment.attachment_url!} target="_blank" rel="noreferrer" style={{ color: '#4040C8', fontWeight: 600 }}>
                  {storedAttachment.attachment_name || 'Attachment'}
                </a>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setRemoveAttachment(true)}
                    aria-label="Remove attachment"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5A6080', padding: 0, lineHeight: 1 }}
                  >
                    <svg width="9" height="9" viewBox="0 0 11 11" fill="none"><path d="M2 2l7 7M9 2l-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                  </button>
                )}
              </span>
            ) : !canEdit ? (
              <span style={{ fontSize: 11, color: '#9BA3C4' }}>No attachment.</span>
            ) : null}

            {canEdit && (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  accept={ACCEPT}
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                  style={{ display: 'none' }}
                  id={`minutes-file-${meeting.id}`}
                />
                <label
                  htmlFor={`minutes-file-${meeting.id}`}
                  className="btn bs bsm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '5px 11px' }}
                >
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M8.5 3.5L4.7 7.3a1.4 1.4 0 002 2l3.8-3.8a2.6 2.6 0 00-3.7-3.7L3 5.6a3.8 3.8 0 005.4 5.4l3.1-3.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  {storedAttachment || pendingFile ? 'Replace file' : 'Attach file'}
                </label>
                <span style={{ fontSize: 10, color: '#9BA3C4' }}>{ACCEPT_HINT}</span>
              </>
            )}
          </div>

          {canEdit && !hasBody && (
            <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 7 }}>
              Write the minutes or attach a document — at least one is required.
            </div>
          )}

        </div>

        {SECTIONS.map((s) => (
          <div key={s.key}>
            <SectionLabel>{s.label}</SectionLabel>
            {canEdit ? (
              <textarea
                className="inp"
                rows={3}
                placeholder={s.placeholder}
                value={draft[s.key as SectionKey]}
                onChange={(e) => update(s.key as SectionKey, e.target.value)}
                style={{ resize: 'vertical' }}
              />
            ) : (
              <ReadOnlyText value={draft[s.key as SectionKey]} />
            )}
          </div>
        ))}

        <div>
          <SectionLabel>
            Attenders{' '}
            {meeting.participants.length > 0 && (
              <span style={{ color: '#9BA3C4', fontWeight: 700 }}>
                · {attendedCount} of {meeting.participants.length} attended
              </span>
            )}
          </SectionLabel>
          {meeting.participants.length === 0 ? (
            <div style={{ fontSize: 12, color: '#9BA3C4' }}>No participants were invited to this meeting.</div>
          ) : (
            <div style={{ border: '1px solid #ECEEF8', borderRadius: 10, overflow: 'hidden' }}>
              {meeting.participants.map((p, i) => {
                const on = attended(p);
                return (
                  <div
                    key={p}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                      padding: '9px 12px', background: '#fff',
                      borderTop: i === 0 ? 'none' : '1px solid #ECEEF8',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span style={{
                        width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                        background: gradientFor(p), color: '#fff', fontSize: 10, fontWeight: 800,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        opacity: on ? 1 : 0.45,
                      }}>{initialsOf(displayName(p))}</span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#1A1D2E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {displayName(p)}
                        </span>
                        <span style={{ display: 'block', fontSize: 10.5, color: '#9BA3C4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p}
                        </span>
                      </span>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: on ? '#0F9D6B' : '#9BA3C4', minWidth: 62, textAlign: 'right' }}>
                        {on ? 'Attended' : 'Absent'}
                      </span>
                      <Switch
                        checked={on}
                        disabled={!canEdit}
                        aria-label={`${p} attended`}
                        onCheckedChange={(v) => update('attendance', { ...draft.attendance, [p]: v ? 'present' : 'absent' })}
                        className="data-[state=checked]:bg-[#4040C8] data-[state=unchecked]:bg-[#D8DBEA]"
                      />
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {error && (
          <div style={{ fontSize: 11, color: '#DC2626', background: 'rgba(239,68,68,.08)', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(239,68,68,.2)' }}>
            {error}
          </div>
        )}
        {notice && !error && !dirty && (
          <div style={{ fontSize: 11, color: '#0F9D6B', background: 'rgba(15,157,107,.08)', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(15,157,107,.2)' }}>
            {notice}
          </div>
        )}
      </div>

      <div style={{ padding: '14px 24px 18px', borderTop: '1px solid #ECEEF8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 10, color: '#9BA3C4' }}>
          {saved?.updated_at ? `Last saved ${new Date(saved.updated_at).toLocaleString('en-GB')}` : ''}
        </span>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn bs" onClick={onClose} style={{ padding: '9px 18px' }}>Close</button>
          {canEdit && (
            <button
              className="btn bp"
              onClick={save}
              disabled={submitting || !dirty || !hasBody}
              title={!hasBody ? 'Add minutes or attach a document first' : undefined}
              style={{ padding: '9px 20px', opacity: submitting || !dirty || !hasBody ? 0.5 : 1, cursor: dirty && hasBody && !submitting ? 'pointer' : 'default' }}
            >
              {submitting ? 'Saving…' : dirty || !hasBody ? 'Save minutes' : 'Saved'}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
