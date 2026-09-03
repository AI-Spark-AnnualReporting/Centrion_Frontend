import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  meetings as meetingsApi,
  reports as reportsApi,
  sarCycles,
  companies as companiesApi,
  ApiError,
} from '@/lib/api';
import type {
  Meeting,
  MeetingPlatform,
  MeetingResponse,
  MeetingType,
} from '@/types/meeting';
import type { Company } from '@/types/company';
import type { Cycle } from '@/types/cycles';
import { useAuth } from '@/context/AuthContext';
import { canCreateFeature } from '@/lib/features';
import { useToast } from '@/hooks/use-toast';
import ScheduleMeetingModal from '@/components/ScheduleMeetingModal';
import ParticipantsPicker from '@/components/ParticipantsPicker';
import MeetingMinutesPanel from '@/components/MeetingMinutesPanel';
import { deriveEvents, type TimelineEvent, type ReportListItem } from '@/lib/disclosure';
import { initials } from '@/components/communications/helpers';
import {
  MONTHS,
  SHORT_MONTHS,
  WEEKDAYS,
  diffDays,
  formatCountdown,
  formatTime,
  isSameDay,
  toIsoDate,
  toLocalDate,
} from '@/lib/calendar';

/**
 * Board & Meetings — the app's single calendar. Two layers on one month grid:
 *
 *   • MEETINGS (`meetings` rows, per-user) — schedulable, editable, cancellable.
 *   • DISCLOSURE events, derived client-side by lib/disclosure.ts from the
 *     company's reports + annual cycles — report due-dates, official cycle
 *     deadlines, and filed reports. Read-only; there is nothing to persist.
 *
 * Absorbed the former standalone IR Calendar page, which showed only the second
 * layer over a copy of this grid.
 */

const MEETING_COLOR = '#4040C8';

const TYPE_OPTIONS: { value: MeetingType; label: string }[] = [
  { value: 'investor_call', label: 'Investor Call' },
  { value: 'esg_briefing', label: 'ESG Briefing' },
  { value: 'one_on_one', label: '1-on-1' },
  { value: 'board_meeting', label: 'Board Meeting' },
  { value: 'roadshow', label: 'Roadshow' },
];

const PLATFORM_OPTIONS: { value: MeetingPlatform; label: string }[] = [
  { value: 'zoom', label: 'Zoom' },
  { value: 'teams', label: 'Microsoft Teams' },
  { value: 'google_meet', label: 'Google Meet' },
  { value: 'in_person', label: 'In-person' },
];

function typeLabel(t: string): string {
  return TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;
}

function platformLabel(p: string): string {
  return PLATFORM_OPTIONS.find((o) => o.value === p)?.label ?? p;
}

function relativeBadgeClass(target: Date, from: Date) {
  const d = diffDays(target, from);
  if (d <= 2) return 'b-rd';
  if (d <= 14) return 'b-am';
  return 'b-or';
}

function statusBadgeClass(status: string): string {
  if (status === 'cancelled') return 'b-rd';
  if (status === 'completed') return 'b-gn';
  return 'b-or';
}

function typeBadgeClass(t: string): string {
  switch (t) {
    case 'investor_call': return 'b-rd';
    case 'esg_briefing': return 'b-gn';
    case 'one_on_one': return 'b-pp';
    case 'board_meeting': return 'b-bl';
    case 'roadshow': return 'b-tl';
    default: return 'b-or';
  }
}

function needsMinutes(m: Meeting, date: Date, now: Date): boolean {
  return !m.has_minutes && m.status !== 'cancelled' && (m.status === 'completed' || date < now);
}

function fullDateTime(d: Date): string {
  const datePart = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const period = d.getHours() >= 12 ? 'PM' : 'AM';
  const hour12 = ((d.getHours() + 11) % 12) + 1;
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${datePart} · ${hour12}:${mm} ${period}`;
}

function meetingMeta(m: Meeting): string {
  const parts = [
    typeLabel(m.meeting_type),
    m.participants.length ? `${m.participants.length} participant${m.participants.length === 1 ? '' : 's'}` : null,
    platformLabel(m.platform),
    formatTime(m.meeting_time),
  ].filter(Boolean);
  return parts.join(' · ');
}

interface ModalState {
  title: string;
  date: string;
  time: string;
  type: MeetingType;
  platform: MeetingPlatform;
  participants: string[];
  agenda: string;
  linkOrLocation: string;
}

// One row of the calendar, whichever layer it came from. `date` is pre-resolved
// so the grid, the day panel, the upcoming rail, and the export can all sort and
// filter on a single field without re-parsing.
type CalItem =
  | { kind: 'meeting'; id: string; date: Date; color: string; meeting: Meeting }
  | { kind: 'disclosure'; id: string; date: Date; color: string; event: TimelineEvent };

// ── Calendar export (.ics) ────────────────────────────────────────────────
// Meetings go out with their real start time; derived disclosure events are
// all-day. Neither carries a timezone — the app treats meeting_date/_time as
// wall-clock values, and a floating VEVENT keeps that promise in the importing
// calendar.

function escapeIcs(s: string): string {
  return (s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function icsDate(d: Date): string {
  return `${d.getFullYear()}${(d.getMonth() + 1).toString().padStart(2, '0')}${d.getDate().toString().padStart(2, '0')}`;
}

function icsDateTime(d: Date): string {
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${icsDate(d)}T${p(d.getHours())}${p(d.getMinutes())}00`;
}

function buildIcs(items: CalItem[]): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Centriyon//Board & Meetings//EN', 'CALSCALE:GREGORIAN'];
  for (const it of items) {
    lines.push('BEGIN:VEVENT', `UID:${it.id}@centriyon`);
    if (it.kind === 'meeting') {
      // No duration on a meeting row, so give the importing calendar an hour
      // rather than a zero-length block it would render as a sliver.
      const end = new Date(it.date.getTime() + 60 * 60 * 1000);
      lines.push(
        `DTSTART:${icsDateTime(it.date)}`,
        `DTEND:${icsDateTime(end)}`,
        `SUMMARY:${escapeIcs(it.meeting.title)}`,
        `DESCRIPTION:${escapeIcs(it.meeting.agenda || meetingMeta(it.meeting))}`,
      );
      if (it.meeting.link_or_location) {
        lines.push(`LOCATION:${escapeIcs(it.meeting.link_or_location)}`);
      }
    } else {
      lines.push(
        `DTSTART;VALUE=DATE:${icsDate(it.date)}`,
        `SUMMARY:${escapeIcs(it.event.title)}`,
        `DESCRIPTION:${escapeIcs(it.event.subtitle)}`,
      );
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

const ICON_CAL = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="3" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" /><path d="M2 6h10M5 1.5v3M9 1.5v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
);
const ICON_CLOCK = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.3" stroke="currentColor" strokeWidth="1.4" /><path d="M7 4v3.2l2 1.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const ICON_PEOPLE = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="5" cy="5" r="2" stroke="currentColor" strokeWidth="1.4" /><circle cx="10.5" cy="5.5" r="1.5" stroke="currentColor" strokeWidth="1.4" /><path d="M1.5 11c.4-1.7 1.9-2.7 3.5-2.7s3.1 1 3.5 2.7M9 8.7c1.4 0 2.7.7 3.2 2.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
);
const ICON_DOC = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 1.5h5l3 3v8a.5.5 0 01-.5.5h-7.5a.5.5 0 01-.5-.5v-10.5a.5.5 0 01.5-.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M8 1.5v3h3M4.5 8h5M4.5 10.5h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
);

// Same swatch for the same person on every render — matches the board cards.
function avatarColor(seed: string): string {
  const palette = ['#4040C8', '#0D9488', '#7C3AED', '#16A34A', '#B45309', '#DC2626', '#2563EB', '#0891B2'];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

function DetailRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8, background: '#EEEEFF', color: '#4040C8',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#9BA3C4', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 12, color: '#1A1D2E', lineHeight: 1.5 }}>{children}</div>
      </div>
    </div>
  );
}

// One meeting in a rail. The Upcoming timeline and the Needs Minutes list show
// the identical row and differ only in what sits at its right edge, so the
// trailing element is the only thing either caller has to supply.
function MeetingRow({
  meeting,
  date,
  onClick,
  trailing,
  last,
}: {
  meeting: Meeting;
  date: Date;
  onClick: () => void;
  trailing: React.ReactNode;
  last: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', gap: 12, padding: '12px 0', cursor: 'pointer',
        borderBottom: last ? 'none' : '1px solid #ECEEF8',
      }}
    >
      <div style={{
        minWidth: 46, height: 46, background: '#EEEEFF',
        border: '1px solid rgba(64,64,200,.15)', borderRadius: 10,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#4040C8', lineHeight: 1 }}>
          {date.getDate().toString().padStart(2, '0')}
        </div>
        <div style={{ fontSize: 8, fontWeight: 800, color: '#4040C8', textTransform: 'uppercase', letterSpacing: '.6px', marginTop: 2 }}>
          {SHORT_MONTHS[date.getMonth()]}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1A1D2E' }}>{meeting.title}</div>
          {meeting.status !== 'scheduled' && (
            <span className={`badge ${statusBadgeClass(meeting.status)}`} style={{ fontSize: 9, padding: '1px 6px' }}>
              {meeting.status}
            </span>
          )}
        </div>
        <div style={{ fontSize: 10, color: '#9BA3C4', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {meetingMeta(meeting)}
        </div>
        {meeting.participants.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {meeting.participants.slice(0, 3).map((p) => (
              <span key={p} className="badge b-gy" style={{ fontSize: 9 }}>{p}</span>
            ))}
            {meeting.participants.length > 3 && (
              <span className="badge b-gy" style={{ fontSize: 9 }}>+{meeting.participants.length - 3}</span>
            )}
          </div>
        )}
      </div>
      {trailing}
    </div>
  );
}

function MeetingDetailModal({
  meeting,
  onClose,
  onUpdated,
  companyId,
  companyName,
  canEdit,
  initialTab = 'details',
}: {
  meeting: Meeting;
  onClose: () => void;
  onUpdated: (m: Meeting) => void;
  companyId: string | null;
  companyName: string;
  canEdit: boolean;
  initialTab?: 'details' | 'minutes';
}) {
  const { toast } = useToast();
  const todayIso = useMemo(() => toIsoDate(new Date()), []);
  const [current, setCurrent] = useState<Meeting>(meeting);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<'details' | 'minutes'>(initialTab);
  const [form, setForm] = useState<ModalState>(() => ({
    title: meeting.title,
    date: meeting.meeting_date,
    time: meeting.meeting_time.slice(0, 5),
    type: meeting.meeting_type as MeetingType,
    platform: meeting.platform as MeetingPlatform,
    participants: meeting.participants,
    agenda: meeting.agenda ?? '',
    linkOrLocation: meeting.link_or_location ?? '',
  }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refresh from server in case the list payload was stale.
  useEffect(() => {
    let cancelled = false;
    meetingsApi
      .get(meeting.id)
      .then((res) => {
        if (cancelled) return;
        setCurrent(res.meeting);
        setForm({
          title: res.meeting.title,
          date: res.meeting.meeting_date,
          time: res.meeting.meeting_time.slice(0, 5),
          type: res.meeting.meeting_type as MeetingType,
          platform: res.meeting.platform as MeetingPlatform,
          participants: res.meeting.participants,
          agenda: res.meeting.agenda ?? '',
          linkOrLocation: res.meeting.link_or_location ?? '',
        });
        onUpdated(res.meeting);
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting.id]);

  const update = <K extends keyof ModalState>(key: K, value: ModalState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Participants the backend can't email. It accepts them (they still show as
  // attendees) but silently can't notify them.
  const unreachable = form.participants.filter((p) => !p.includes('@'));

  // Invitation / cancellation email outcome. Both fields are null when the
  // backend sent nothing at all (no real change, or the meeting is completed),
  // and that's not worth a toast.
  const notifyEmailOutcome = (res: MeetingResponse) => {
    if (res.email_sent == null || !res.email_message) return;
    toast({
      title: res.email_message,
      variant: res.email_sent ? 'success' : 'destructive',
    });
  };

  const save = async () => {
    if (!form.title.trim() || !form.date || !form.time) {
      setError('Title, date, and time are required.');
      return;
    }
    if (form.date < todayIso && form.date !== current.meeting_date) {
      setError('Meeting date cannot be in the past.');
      return;
    }
    // Required: the updated invitation is useless without somewhere to go.
    if (!form.linkOrLocation.trim()) {
      setError(
        form.platform === 'in_person'
          ? 'A location is required.'
          : 'A meeting URL is required.',
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await meetingsApi.update(current.id, {
        title: form.title.trim(),
        meeting_date: form.date,
        meeting_time: form.time.length === 5 ? `${form.time}:00` : form.time,
        meeting_type: form.type,
        platform: form.platform,
        participants: form.participants,
        agenda: form.agenda.trim(),
        link_or_location: form.linkOrLocation.trim(),
      });
      setCurrent(res.meeting);
      onUpdated(res.meeting);
      notifyEmailOutcome(res);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update meeting.');
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async () => {
    setSubmitting(true);
    setError(null);
    try {
      // PATCH rather than DELETE on purpose: DELETE is a bodyless 204, so it
      // can't tell us whether the participants were told.
      const res = await meetingsApi.update(current.id, { status: 'cancelled' });
      setCurrent(res.meeting);
      onUpdated(res.meeting);
      notifyEmailOutcome(res);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to cancel meeting.');
      setSubmitting(false);
    }
  };

  const date = toLocalDate(current.meeting_date, current.meeting_time);

  // Minutes belong to meetings that have actually taken place. The backend
  // never flips `status` to 'completed' today, so a past date counts too.
  const hasHappened =
    current.status !== 'cancelled' &&
    (current.status === 'completed' || date < new Date());

  // Deliberately no backdrop-click close: minutes are typed straight into this
  // modal, and a stray click outside would bin an unsaved draft.
  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ width: 520, padding: 0 }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #ECEEF8', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editing ? (
              <input
                className="inp"
                value={form.title}
                onChange={(e) => update('title', e.target.value)}
                style={{ fontSize: 16, fontWeight: 800 }}
              />
            ) : (
              <div style={{ fontSize: 18, fontWeight: 800, color: '#1A1D2E', letterSpacing: '-.3px', marginBottom: 6 }}>{current.title}</div>
            )}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: editing ? 8 : 0 }}>
              <span className={`badge ${typeBadgeClass(current.meeting_type)}`}>{typeLabel(current.meeting_type)}</span>
              {current.status !== 'scheduled' && (
                <span className={`badge ${statusBadgeClass(current.status)}`}>{current.status}</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 30, height: 30, borderRadius: '50%',
              border: '1.5px solid #E2E4F0', background: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#5A6080', flexShrink: 0,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 2l7 7M9 2l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </div>

        {hasHappened && (
          <div style={{ display: 'flex', gap: 18, padding: '0 24px', borderBottom: '1px solid #ECEEF8' }}>
            {([['details', 'Details'], ['minutes', 'Minutes']] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setTab(key);
                  // Leaving an unsaved edit behind on the Details tab would be
                  // invisible from Minutes, so drop it on the way out.
                  if (key === 'minutes') setEditing(false);
                }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  padding: '11px 0', fontSize: 12, fontWeight: 700,
                  color: tab === key ? '#4040C8' : '#9BA3C4',
                  borderBottom: `2px solid ${tab === key ? '#4040C8' : 'transparent'}`,
                  marginBottom: -1,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {hasHappened && tab === 'minutes' ? (
          <MeetingMinutesPanel
            meeting={current}
            canEdit={canEdit}
            onClose={onClose}
            onSaved={() => onUpdated({ ...current, has_minutes: true })}
          />
        ) : (
        <>
        <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {editing ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <span className="fl-label">Date</span>
                  <input
                    className="inp"
                    type="date"
                    min={current.meeting_date < todayIso ? current.meeting_date : todayIso}
                    value={form.date}
                    onChange={(e) => update('date', e.target.value)}
                  />
                </div>
                <div>
                  <span className="fl-label">Time</span>
                  <input className="inp" type="time" value={form.time} onChange={(e) => update('time', e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <span className="fl-label">Type</span>
                  <select className="inp sel" value={form.type} onChange={(e) => update('type', e.target.value as MeetingType)}>
                    {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <span className="fl-label">Platform</span>
                  <select className="inp sel" value={form.platform} onChange={(e) => update('platform', e.target.value as MeetingPlatform)}>
                    {PLATFORM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <ParticipantsPicker
                  value={form.participants}
                  onChange={(emails) => update('participants', emails)}
                  companyId={companyId}
                  companyName={companyName}
                />
                {/* Only addresses can be invited. Legacy meetings can still
                    carry bare names, so say so rather than letting the
                    organiser find out from the post-save toast. */}
                {unreachable.length > 0 && (
                  <div style={{ fontSize: 11, color: '#B45309', marginTop: 5 }}>
                    No email address for {unreachable.join(', ')} — they won&apos;t be notified.
                  </div>
                )}
              </div>
              <div>
                <span className="fl-label">
                  {form.platform === 'in_person' ? 'Location' : 'Meeting URL'}{' '}
                  <span style={{ color: '#E5484D' }}>*</span>
                </span>
                <input
                  className="inp"
                  type={form.platform === 'in_person' ? 'text' : 'url'}
                  placeholder={
                    form.platform === 'in_person'
                      ? 'Venue / address'
                      : 'https://zoom.us/j/…'
                  }
                  value={form.linkOrLocation}
                  onChange={(e) => update('linkOrLocation', e.target.value)}
                />
              </div>
              <div>
                <span className="fl-label">Agenda</span>
                <textarea className="inp" rows={4} value={form.agenda} onChange={(e) => update('agenda', e.target.value)} style={{ resize: 'vertical' }} />
              </div>
            </>
          ) : (
            <>
              <DetailRow icon={ICON_CAL} label="Date & Time">{fullDateTime(date)}</DetailRow>
              <DetailRow icon={ICON_CLOCK} label="Platform">{platformLabel(current.platform)}</DetailRow>
              <DetailRow
                icon={ICON_PEOPLE}
                label={`Attendees${current.participants.length ? ` · ${current.participants.length}` : ''}`}
              >
                {current.participants.length === 0 ? (
                  <span style={{ color: '#9BA3C4' }}>None</span>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                    {current.participants.map((p) => (
                      <span
                        key={p}
                        title={p}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%',
                          padding: '3px 10px 3px 3px', borderRadius: 999,
                          background: '#F6F7FC', border: '1px solid #ECEEF8',
                        }}
                      >
                        <span style={{
                          width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                          background: avatarColor(p), color: '#fff', fontSize: 8, fontWeight: 800,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>{initials(p)}</span>
                        <span style={{
                          fontSize: 11, fontWeight: 600, color: '#3A4060',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{p.split('@')[0]}</span>
                      </span>
                    ))}
                  </div>
                )}
              </DetailRow>
              {!hasHappened && (
                <DetailRow
                  icon={ICON_DOC}
                  label={current.platform === 'in_person' ? 'Location' : 'Meeting URL'}
                >
                  {current.link_or_location
                    ? current.platform === 'in_person'
                      ? <span style={{ wordBreak: 'break-word' }}>{current.link_or_location}</span>
                      : <a href={current.link_or_location} target="_blank" rel="noreferrer" style={{ color: '#4040C8', wordBreak: 'break-all' }}>{current.link_or_location}</a>
                    : <span style={{ color: '#9BA3C4' }}>None</span>}
                </DetailRow>
              )}
              <DetailRow icon={ICON_DOC} label="Agenda">
                {current.agenda
                  ? <div style={{ whiteSpace: 'pre-wrap' }}>{current.agenda}</div>
                  : <span style={{ color: '#9BA3C4' }}>No agenda provided</span>}
              </DetailRow>
            </>
          )}
          {error && (
            <div style={{ fontSize: 11, color: '#DC2626', background: 'rgba(239,68,68,.08)', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(239,68,68,.2)' }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ padding: '14px 24px 18px', borderTop: '1px solid #ECEEF8', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          {editing ? (
            <>
              <button
                className="btn bs"
                onClick={cancel}
                disabled={submitting || current.status === 'cancelled'}
                style={{ padding: '9px 16px', color: '#DC2626', borderColor: 'rgba(239,68,68,.3)' }}
              >
                {current.status === 'cancelled' ? 'Already cancelled' : 'Cancel meeting'}
              </button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn bs" onClick={() => setEditing(false)} disabled={submitting} style={{ padding: '9px 18px' }}>Discard</button>
                <button className="btn bp" onClick={save} disabled={submitting} style={{ padding: '9px 20px', opacity: submitting ? 0.7 : 1 }}>
                  {submitting ? 'Saving…' : 'Save'}
                </button>
              </div>
            </>
          ) : (
            <>
              <span />
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn bs" onClick={onClose} style={{ padding: '9px 18px' }}>Close</button>
                {!hasHappened && (
                  <button className="btn bs" onClick={() => setEditing(true)} style={{ padding: '9px 18px' }}>Edit</button>
                )}
              </div>
            </>
          )}
        </div>
        </>
        )}
      </div>
    </div>
  );
}

export default function MeetingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const companyId = user?.company_id ?? null;
  const companyName = user?.company_name ?? '';
  const canCreateMeeting = canCreateFeature(user, 'board_meetings');
  const today = useMemo(() => new Date(), []);
  const [viewMonth, setViewMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const [data, setData] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeMeeting, setActiveMeeting] = useState<Meeting | null>(null);
  const [modalTab, setModalTab] = useState<'details' | 'minutes'>('details');
  const [rail, setRail] = useState<'upcoming' | 'minutes'>('upcoming');

  // Both bits of "which meeting is open" move together, so the modal can never
  // inherit a tab left over from the previous meeting.
  const openMeeting = (m: Meeting, tab: 'details' | 'minutes' = 'details') => {
    setActiveMeeting(m);
    setModalTab(tab);
  };
  // null = still loading. The disclosure layer is best-effort: every source is
  // settled independently so one dead endpoint can't take the meetings grid
  // down with it.
  const [disclosure, setDisclosure] = useState<TimelineEvent[] | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await meetingsApi.list();
      setData(res.meetings);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? `${e.status} ${e.statusText}`
          : e instanceof Error
            ? e.message
            : 'Failed to load meetings.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const isAdmin = user?.role === 'admin';
    (async () => {
      const [rRes, cRes, coRes] = await Promise.allSettled([
        companyId
          ? reportsApi.list<{ reports?: ReportListItem[] }>(companyId)
          : Promise.resolve({ reports: [] as ReportListItem[] }),
        // SAR cycles are a separate, admin-only backend — best-effort only.
        isAdmin ? sarCycles.list() : Promise.resolve([] as Cycle[]),
        companiesApi.getMyCompany(),
      ]);
      if (cancelled) return;
      const reports = rRes.status === 'fulfilled' ? rRes.value?.reports ?? [] : [];
      const cycles = cRes.status === 'fulfilled' ? cRes.value ?? [] : [];
      const company: Company | null = coRes.status === 'fulfilled' ? coRes.value : null;
      // No meetings passed in on purpose: this page renders the real meeting
      // rows itself, with far more detail than deriveEvents can carry.
      setDisclosure(deriveEvents({ reports, cycles, company, meetings: [] }));
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, user?.role]);

  const decorated = useMemo(
    () =>
      data
        .filter((m) => m.status !== 'cancelled')
        .map((m) => ({ ...m, _date: toLocalDate(m.meeting_date, m.meeting_time) }))
        .sort((a, b) => a._date.getTime() - b._date.getTime()),
    [data],
  );

  // Both layers on one timeline — everything below reads from this.
  const items = useMemo<CalItem[]>(() => {
    const merged: CalItem[] = [
      ...decorated.map((m): CalItem => ({
        kind: 'meeting', id: `mtg-${m.id}`, date: m._date, color: MEETING_COLOR, meeting: m,
      })),
      // A dateless milestone — a report type this company has never filed — has no
      // square to sit on. The dashboard card still lists it; a calendar grid can't.
      ...(disclosure ?? [])
        .filter((e): e is TimelineEvent & { date: Date } => e.date != null)
        .map((e): CalItem => ({
          kind: 'disclosure', id: e.id, date: e.date, color: e.dotColor, event: e,
        })),
    ];
    return merged.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [decorated, disclosure]);

  const startToday = useMemo(
    () => new Date(today.getFullYear(), today.getMonth(), today.getDate()),
    [today],
  );

  // Filed reports are history — they stay as markers on the grid but never
  // belong in a list of what's coming.
  const upcoming = useMemo(
    () => items.filter((it) => it.date >= startToday && !(it.kind === 'disclosure' && it.event.kind === 'filed')),
    [items, startToday],
  );

  // Newest first: the meeting you just held is the one you sit down to write up.
  const unwritten = useMemo(
    () =>
      decorated
        .filter((m) => needsMinutes(m, m._date, today))
        .sort((a, b) => b._date.getTime() - a._date.getTime()),
    [decorated, today],
  );

  const monthItems = useMemo(
    () => items.filter((it) => it.date.getMonth() === viewMonth.getMonth() && it.date.getFullYear() === viewMonth.getFullYear()),
    [items, viewMonth],
  );

  // day-of-month → the dot colours to paint under that cell.
  const dayDots = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const it of monthItems) {
      const day = it.date.getDate();
      const dots = map.get(day) ?? [];
      if (!dots.includes(it.color)) dots.push(it.color);
      map.set(day, dots);
    }
    return map;
  }, [monthItems]);

  const selectedItems = useMemo(
    () => (selectedDate ? items.filter((it) => isSameDay(it.date, selectedDate)) : []),
    [items, selectedDate],
  );

  const firstWeekday = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getDay();
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();

  const stepMonth = (delta: number) => {
    const next = new Date(viewMonth);
    next.setMonth(next.getMonth() + delta);
    setViewMonth(next);
    setSelectedDate(null);
  };

  const handleExport = () => {
    const blob = new Blob([buildIcs(items)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'board-and-meetings.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1A1D2E', letterSpacing: '-.5px', marginBottom: 3 }}>Board & Investor Meetings</h2>
          <p style={{ fontSize: 12, color: '#5A6080' }}>Meetings, disclosure deadlines, and filing milestones — click a date for details</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn bs"
            onClick={handleExport}
            disabled={items.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', opacity: items.length === 0 ? 0.5 : 1 }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v6.5M3.5 5.5L6 8l2.5-2.5M2 10h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Export
          </button>
          {canCreateMeeting && (
            <button className="btn bp" onClick={() => setScheduleOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px' }}>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="white" strokeWidth="1.6" strokeLinecap="round" /></svg>
              Schedule Meeting
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="card" style={{ padding: '12px 16px', marginBottom: 14, border: '1px solid rgba(239,68,68,.25)', background: 'rgba(239,68,68,.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 12, color: '#DC2626' }}>{error}</div>
          <button className="btn bs bsm" onClick={load}>Retry</button>
        </div>
      )}

      {/* Calendar + Upcoming */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        {/* Calendar */}
        <div className="card">
          <div className="ch">
            <div className="ct">{MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn bs bsm" onClick={() => stepMonth(-1)} aria-label="Previous month" style={{ padding: '5px 12px' }}>
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M7 2L3 5.5 7 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <button className="btn bs bsm" onClick={() => stepMonth(1)} aria-label="Next month" style={{ padding: '5px 12px' }}>
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M4 2l4 3.5L4 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
          </div>
          <div style={{ padding: '14px 18px 18px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 0, marginBottom: 6 }}>
              {WEEKDAYS.map((d) => (
                <div key={d} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: '#9BA3C4', textTransform: 'uppercase', letterSpacing: '.6px', padding: '6px 0' }}>{d}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
              {Array.from({ length: firstWeekday }).map((_, i) => (
                <div key={`e${i}`} className="cal-day empty" />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const cellDate = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day);
                const isToday = isSameDay(cellDate, today);
                const isSelected = selectedDate && isSameDay(cellDate, selectedDate);
                const dots = dayDots.get(day) ?? [];
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelectedDate(cellDate)}
                    // Deliberately no `has-event` class: that CSS rule paints one
                    // fixed-colour dot, and a day can now carry a meeting and a
                    // deadline at once. The dots below are drawn per type instead.
                    className={`cal-day ${isToday ? 'today' : ''}`}
                    style={{
                      border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      ...(isSelected && !isToday ? { background: '#EEEEFF', color: '#4040C8', fontWeight: 800, boxShadow: 'inset 0 0 0 1.5px #4040C8' } : {}),
                    }}
                  >
                    {day}
                    {dots.length > 0 && (
                      <span style={{ position: 'absolute', bottom: 4, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 2.5 }}>
                        {dots.slice(0, 3).map((c) => (
                          <span
                            key={c}
                            style={{
                              width: 5, height: 5, borderRadius: '50%',
                              // Today's cell is solid indigo — a coloured dot on it
                              // would disappear, so fall back to a light one.
                              background: isToday ? 'rgba(255,255,255,.75)' : c,
                              opacity: isToday ? 1 : 0.85,
                            }}
                          />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selected day detail */}
            {selectedDate && (
              <div style={{ marginTop: 16, padding: 12, background: '#F2F3FA', borderRadius: 10, border: '1px solid #ECEEF8', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#1A1D2E' }}>
                    {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </div>
                  <button className="btn bs bsm" onClick={() => setSelectedDate(null)} style={{ padding: '3px 9px', fontSize: 10 }}>Clear</button>
                </div>
                {selectedItems.length === 0 ? (
                  <div style={{ fontSize: 11, color: '#9BA3C4' }}>
                    Nothing scheduled.
                    {canCreateMeeting && (
                      <button onClick={() => setScheduleOpen(true)} style={{ background: 'none', border: 'none', color: '#4040C8', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}> Add a meeting →</button>
                    )}
                  </div>
                ) : (
                  // Scrolls in place, like the rail opposite. A busy day would
                  // otherwise stretch this card past the one beside it.
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 208, overflowY: 'auto', paddingRight: 2 }}>
                  {selectedItems.map((it) =>
                    it.kind === 'meeting' ? (
                      (() => {
                        // Flag it here too — this panel is how a past meeting
                        // gets found, and the rail only lists them.
                        const unwrittenHere = needsMinutes(it.meeting, it.date, today);
                        return (
                          <button
                            key={it.id}
                            onClick={() => openMeeting(it.meeting, unwrittenHere ? 'minutes' : 'details')}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                              padding: '8px 10px', background: '#fff', borderRadius: 8,
                              fontSize: 11, border: '1px solid transparent', cursor: 'pointer', fontFamily: 'inherit',
                            }}
                          >
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: it.color, flexShrink: 0 }} />
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ display: 'block', fontWeight: 700, color: '#1A1D2E', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.meeting.title}</span>
                              <span style={{ display: 'block', color: '#5A6080', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meetingMeta(it.meeting)}</span>
                            </span>
                            {unwrittenHere && (
                              <span className="badge b-rd" style={{ flexShrink: 0, fontSize: 9, whiteSpace: 'nowrap' }}>
                                Needs minutes
                              </span>
                            )}
                          </button>
                        );
                      })()
                    ) : (
                      // Derived, not stored — there is nothing to open or edit.
                      <div
                        key={it.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '8px 10px', background: '#fff', borderRadius: 8,
                        }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: it.color, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#1A1D2E' }}>{it.event.title}</div>
                          <div style={{ fontSize: 10, color: '#9BA3C4' }}>{it.event.subtitle}</div>
                        </div>
                      </div>
                    ),
                  )}
                  </div>
                )}
              </div>
            )}

            {/* Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 13, flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: '1px solid #ECEEF8', fontSize: 10, color: '#5A6080' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 12, height: 12, borderRadius: 4, background: '#4040C8', display: 'inline-block' }} />Today
              </span>
              {/* Colours match deriveEvents' dotColor scale in lib/disclosure.ts. */}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: MEETING_COLOR }} />Meeting
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#E8A33D' }} />Deadline
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#E5484D' }} />Due soon
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#0F9D6B' }} />Filed
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 12, height: 12, borderRadius: 4, background: '#EEEEFF', boxShadow: 'inset 0 0 0 1.5px #4040C8' }} />Selected
              </span>
            </div>
          </div>
        </div>

        {/* Two rails on one card: what's coming, and what still needs writing up. */}
        <div className="card">
          <div className="ch">
            <div className="tabs" style={{ marginBottom: 0 }}>
              <button
                type="button"
                className={`tab ${rail === 'upcoming' ? 'act' : ''}`}
                onClick={() => setRail('upcoming')}
              >
                {/* Plain text, not a pill: it inherits the tab's colour and so
                    stays legible on both the active and inactive fill. */}
                Upcoming {upcoming.length}
              </button>
              <button
                type="button"
                className={`tab ${rail === 'minutes' ? 'act' : ''}`}
                onClick={() => setRail('minutes')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                Needs Minutes
                {/* The whole point of the tab: the backlog is visible without
                    opening it. Own colours rather than `badge b-rd`, which
                    would vanish against the active tab's indigo fill. */}
                {unwritten.length > 0 && (
                  <span style={{
                    fontSize: 9, fontWeight: 800, lineHeight: 1, color: '#fff',
                    background: '#E5484D', borderRadius: 999, padding: '3px 6px', minWidth: 15, textAlign: 'center',
                  }}>
                    {unwritten.length}
                  </span>
                )}
              </button>
            </div>
            {(loading || disclosure === null) && (
              <span className="badge b-or">Loading…</span>
            )}
          </div>
          {/* The rail scrolls inside the card rather than stretching it: a long
              minutes backlog would otherwise drag the whole row past the
              calendar beside it. */}
          <div style={{ padding: '6px 18px 14px', maxHeight: 440, overflowY: 'auto' }}>
            {rail === 'minutes' ? (
              (loading && data.length === 0) ? (
                <div style={{ padding: '32px 0', textAlign: 'center', color: '#9BA3C4', fontSize: 12 }}>
                  <div className="proc-ring" style={{ margin: '0 auto 10px', width: 28, height: 28, borderWidth: 2.5 }} />
                  Loading meetings…
                </div>
              ) : unwritten.length === 0 ? (
                <div style={{ padding: '28px 4px', textAlign: 'center', color: '#9BA3C4', fontSize: 12, lineHeight: 1.6 }}>
                  All caught up — every past meeting has its minutes.
                </div>
              ) : (
                unwritten.map((m, i) => (
                  <MeetingRow
                    key={m.id}
                    meeting={m}
                    date={m._date}
                    onClick={() => openMeeting(m, 'minutes')}
                    last={i === unwritten.length - 1}
                    trailing={
                      <span style={{
                        flexShrink: 0, alignSelf: 'flex-start', whiteSpace: 'nowrap',
                        fontSize: 10.5, fontWeight: 700, color: '#4040C8',
                        background: '#ECEEFF', borderRadius: 7, padding: '4px 9px',
                      }}>
                        Add minutes →
                      </span>
                    }
                  />
                ))
              )
            ) : (loading && data.length === 0) || disclosure === null ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: '#9BA3C4', fontSize: 12 }}>
                <div className="proc-ring" style={{ margin: '0 auto 10px', width: 28, height: 28, borderWidth: 2.5 }} />
                Loading calendar…
              </div>
            ) : upcoming.length === 0 ? (
              <div style={{ padding: '28px 4px', textAlign: 'center', color: '#9BA3C4', fontSize: 12, lineHeight: 1.6 }}>
                Nothing upcoming. Report deadlines and cycle dates appear here as they're set up.{' '}
                {canCreateMeeting && (
                  <button onClick={() => setScheduleOpen(true)} style={{ background: 'none', border: 'none', color: '#4040C8', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>
                    Schedule a meeting →
                  </button>
                )}
              </div>
            ) : (
              upcoming.map((it, i) => {
                const day = it.date.getDate().toString().padStart(2, '0');
                const month = SHORT_MONTHS[it.date.getMonth()];
                const rowStyle = {
                  display: 'flex' as const, gap: 12, padding: '12px 0',
                  borderBottom: i < upcoming.length - 1 ? '1px solid #ECEEF8' : 'none',
                };
                // Same pill on both layers so the rail reads as one list; the
                // date tile's colour is what tells the two apart.
                const countdown = (
                  <span className={`badge ${relativeBadgeClass(it.date, today)}`} style={{ flexShrink: 0, alignSelf: 'flex-start', whiteSpace: 'nowrap' }}>
                    {formatCountdown(it.date, today)}
                  </span>
                );

                if (it.kind === 'meeting') {
                  return (
                    <MeetingRow
                      key={it.id}
                      meeting={it.meeting}
                      date={it.date}
                      onClick={() => openMeeting(it.meeting)}
                      trailing={countdown}
                      last={i === upcoming.length - 1}
                    />
                  );
                }

                const e = it.event;
                return (
                  <div key={it.id} style={{ ...rowStyle, alignItems: 'flex-start' }}>
                    <div style={{
                      minWidth: 46, height: 46, background: '#F2F3FA',
                      border: `1px solid ${it.color}33`, borderRadius: 10,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: it.color, lineHeight: 1 }}>{day}</div>
                      <div style={{ fontSize: 8, fontWeight: 800, color: it.color, textTransform: 'uppercase', letterSpacing: '.6px', marginTop: 2 }}>{month}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#1A1D2E' }}>{e.title}</span>
                        {e.tone === 'urgent' && (
                          <span style={{ fontSize: 9, fontWeight: 800, color: '#E5484D', background: 'rgba(229,72,77,.12)', padding: '1px 6px', borderRadius: 999 }}>URGENT</span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: '#9BA3C4' }}>{e.subtitle}</div>
                      {e.cta && (
                        <button
                          type="button"
                          onClick={() => navigate(e.cta!.path)}
                          style={{ marginTop: 7, fontSize: 10.5, fontWeight: 700, color: '#4040C8', background: '#ECEEFF', border: 'none', borderRadius: 7, padding: '4px 9px', cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                          {e.cta.label} →
                        </button>
                      )}
                    </div>
                    {countdown}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {scheduleOpen && (
        <ScheduleMeetingModal
          onClose={() => setScheduleOpen(false)}
          onCreated={(m) => setData((prev) => [...prev, m])}
          initialDate={selectedDate}
          companyId={companyId}
          companyName={companyName}
        />
      )}

      {activeMeeting && (
        <MeetingDetailModal
          meeting={activeMeeting}
          companyId={companyId}
          companyName={companyName}
          canEdit={canCreateMeeting}
          initialTab={modalTab}
          onClose={() => setActiveMeeting(null)}
          onUpdated={(updated) => {
            // PATCH responses don't carry `has_minutes`, so a plain replace
            // would forget that a meeting was written up and drop it back onto
            // the Needs Minutes rail. Keep what we already knew.
            setData((prev) =>
              prev.map((m) =>
                m.id === updated.id
                  ? { ...updated, has_minutes: updated.has_minutes ?? m.has_minutes }
                  : m,
              ),
            );
            setActiveMeeting(updated);
          }}
        />
      )}
    </div>
  );
}
