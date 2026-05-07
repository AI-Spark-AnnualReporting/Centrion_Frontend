import { useEffect, useMemo, useState } from 'react';
import { meetings as meetingsApi, ApiError } from '@/lib/api';
import type {
  Meeting,
  MeetingPlatform,
  MeetingType,
} from '@/types/meeting';
import { useAuth } from '@/context/AuthContext';
import ScheduleMeetingModal from '@/components/ScheduleMeetingModal';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

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

// "YYYY-MM-DD" + "HH:mm:ss" → local Date. Treating both fields as wall-clock
// values so calendar placement matches what the user picked, regardless of TZ.
function toLocalDate(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split('-').map((x) => parseInt(x, 10));
  const [hh = 0, mm = 0, ss = 0] = (timeStr ?? '00:00:00').split(':').map((x) => parseInt(x, 10));
  return new Date(y, (m || 1) - 1, d || 1, hh, mm, ss);
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map((x) => parseInt(x, 10));
  if (Number.isNaN(h)) return timeStr;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = ((h + 11) % 12) + 1;
  return `${hour12}:${(m || 0).toString().padStart(2, '0')} ${period}`;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function diffDays(target: Date, from: Date) {
  const a = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const b = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

function formatRelative(target: Date, from: Date) {
  const d = diffDays(target, from);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d < 0) return `${Math.abs(d)} days ago`;
  return `${d} days`;
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

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
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

function MeetingDetailModal({
  meeting,
  onClose,
  onUpdated,
}: {
  meeting: Meeting;
  onClose: () => void;
  onUpdated: (m: Meeting) => void;
}) {
  const todayIso = useMemo(() => toIsoDate(new Date()), []);
  const [current, setCurrent] = useState<Meeting>(meeting);
  const [editing, setEditing] = useState(false);
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

  const save = async () => {
    if (!form.title.trim() || !form.date || !form.time) {
      setError('Title, date, and time are required.');
      return;
    }
    if (form.date < todayIso && form.date !== current.meeting_date) {
      setError('Meeting date cannot be in the past.');
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
        link_or_location: form.linkOrLocation.trim() || null,
      });
      setCurrent(res.meeting);
      onUpdated(res.meeting);
      setEditing(false);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? typeof e.body === 'object' && e.body && 'detail' in (e.body as Record<string, unknown>)
            ? String((e.body as { detail?: unknown }).detail)
            : `${e.status} ${e.statusText}`
          : e instanceof Error
            ? e.message
            : 'Failed to update meeting.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await meetingsApi.update(current.id, { status: 'cancelled' });
      setCurrent(res.meeting);
      onUpdated(res.meeting);
      onClose();
    } catch (e) {
      const msg =
        e instanceof ApiError ? `${e.status} ${e.statusText}` : e instanceof Error ? e.message : 'Failed to cancel meeting.';
      setError(msg);
      setSubmitting(false);
    }
  };

  const date = toLocalDate(current.meeting_date, current.meeting_time);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ width: 520, padding: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
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
                <span className="fl-label">Participants</span>
                <input
                  className="inp"
                  value={form.participants.join(', ')}
                  onChange={(e) =>
                    update(
                      'participants',
                      e.target.value
                        .split(',')
                        .map((p) => p.trim())
                        .filter(Boolean),
                    )
                  }
                  placeholder="Comma-separated emails or names"
                />
              </div>
              <div>
                <span className="fl-label">
                  {form.platform === 'in_person' ? 'Location' : 'Meeting URL'}
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
              <DetailRow icon={ICON_PEOPLE} label="Attendees">
                {current.participants.length === 0
                  ? <span style={{ color: '#9BA3C4' }}>None</span>
                  : `${current.participants.length} · ${current.participants.join(', ')}`}
              </DetailRow>
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
                <button className="btn bp" onClick={() => alert(`Join link for "${current.title}" would be sent here.`)} style={{ padding: '9px 20px' }}>Join Meeting</button>
                <button className="btn bs" onClick={() => setEditing(true)} style={{ padding: '9px 18px' }}>Edit</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MeetingsPage() {
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;
  const companyName = user?.company_name ?? '';
  const today = useMemo(() => new Date(), []);
  const [viewMonth, setViewMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const [data, setData] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeMeeting, setActiveMeeting] = useState<Meeting | null>(null);

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

  const decorated = useMemo(
    () =>
      data
        .filter((m) => m.status !== 'cancelled')
        .map((m) => ({ ...m, _date: toLocalDate(m.meeting_date, m.meeting_time) }))
        .sort((a, b) => a._date.getTime() - b._date.getTime()),
    [data],
  );

  const upcoming = useMemo(
    () => decorated.filter((m) => m._date >= new Date(today.getFullYear(), today.getMonth(), today.getDate())),
    [decorated, today],
  );

  const monthMeetings = useMemo(
    () => decorated.filter((m) => m._date.getMonth() === viewMonth.getMonth() && m._date.getFullYear() === viewMonth.getFullYear()),
    [decorated, viewMonth],
  );

  const eventDays = useMemo(() => new Set(monthMeetings.map((m) => m._date.getDate())), [monthMeetings]);

  const selectedMeetings = useMemo(
    () => (selectedDate ? decorated.filter((m) => isSameDay(m._date, selectedDate)) : []),
    [decorated, selectedDate],
  );

  const firstWeekday = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getDay();
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();

  const stepMonth = (delta: number) => {
    const next = new Date(viewMonth);
    next.setMonth(next.getMonth() + delta);
    setViewMonth(next);
    setSelectedDate(null);
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1A1D2E', letterSpacing: '-.5px', marginBottom: 3 }}>Board & Investor Meetings</h2>
          <p style={{ fontSize: 12, color: '#5A6080' }}>Click a date to view meeting details</p>
        </div>
        <button className="btn bp" onClick={() => setScheduleOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px' }}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="white" strokeWidth="1.6" strokeLinecap="round" /></svg>
          Schedule Meeting
        </button>
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
                const hasEvent = eventDays.has(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelectedDate(cellDate)}
                    className={`cal-day ${isToday ? 'today' : ''} ${hasEvent ? 'has-event' : ''}`}
                    style={{
                      border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      ...(isSelected && !isToday ? { background: '#EEEEFF', color: '#4040C8', fontWeight: 800, boxShadow: 'inset 0 0 0 1.5px #4040C8' } : {}),
                    }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            {/* Selected day detail */}
            {selectedDate && (
              <div style={{ marginTop: 16, padding: 12, background: '#F2F3FA', borderRadius: 10, border: '1px solid #ECEEF8' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: selectedMeetings.length ? 8 : 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#1A1D2E' }}>
                    {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </div>
                  <button className="btn bs bsm" onClick={() => setSelectedDate(null)} style={{ padding: '3px 9px', fontSize: 10 }}>Clear</button>
                </div>
                {selectedMeetings.length === 0 ? (
                  <div style={{ fontSize: 11, color: '#9BA3C4' }}>No meetings scheduled. <button onClick={() => setScheduleOpen(true)} style={{ background: 'none', border: 'none', color: '#4040C8', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}>Add one →</button></div>
                ) : (
                  selectedMeetings.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setActiveMeeting(m)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '8px 10px', background: '#fff', borderRadius: 8, marginBottom: 6,
                        fontSize: 11, border: '1px solid transparent', cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      <div style={{ fontWeight: 700, color: '#1A1D2E', marginBottom: 2 }}>{m.title}</div>
                      <div style={{ color: '#5A6080', fontSize: 10 }}>{meetingMeta(m)}</div>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14, paddingTop: 12, borderTop: '1px solid #ECEEF8', fontSize: 10, color: '#5A6080' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 12, height: 12, borderRadius: 4, background: '#4040C8', display: 'inline-block' }} />Today
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ position: 'relative', width: 12, height: 12, border: '1.5px solid #E2E4F0', borderRadius: 4 }}>
                  <span style={{ position: 'absolute', bottom: 1, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: '#4040C8' }} />
                </span>
                Has meeting
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 12, height: 12, borderRadius: 4, background: '#EEEEFF', boxShadow: 'inset 0 0 0 1.5px #4040C8' }} />Selected
              </span>
            </div>
          </div>
        </div>

        {/* Upcoming Meetings */}
        <div className="card">
          <div className="ch">
            <div className="ct">Upcoming Meetings</div>
            <span className="badge b-or">
              {loading ? 'Loading…' : `${upcoming.length} scheduled`}
            </span>
          </div>
          <div style={{ padding: '6px 18px 14px' }}>
            {loading && data.length === 0 ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: '#9BA3C4', fontSize: 12 }}>
                <div className="proc-ring" style={{ margin: '0 auto 10px', width: 28, height: 28, borderWidth: 2.5 }} />
                Loading meetings…
              </div>
            ) : upcoming.length === 0 ? (
              <div style={{ padding: '28px 0', textAlign: 'center', color: '#9BA3C4', fontSize: 12 }}>
                No upcoming meetings.{' '}
                <button onClick={() => setScheduleOpen(true)} style={{ background: 'none', border: 'none', color: '#4040C8', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>
                  Schedule one →
                </button>
              </div>
            ) : (
              upcoming.map((m, i) => {
                const day = m._date.getDate().toString().padStart(2, '0');
                const month = SHORT_MONTHS[m._date.getMonth()];
                const relative = formatRelative(m._date, today);
                const relCls = relativeBadgeClass(m._date, today);
                return (
                  <div
                    key={m.id}
                    onClick={() => setActiveMeeting(m)}
                    style={{
                      display: 'flex', gap: 12, padding: '12px 0',
                      borderBottom: i < upcoming.length - 1 ? '1px solid #ECEEF8' : 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{
                      minWidth: 46, height: 46, background: '#EEEEFF',
                      border: '1px solid rgba(64,64,200,.15)', borderRadius: 10,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#4040C8', lineHeight: 1 }}>{day}</div>
                      <div style={{ fontSize: 8, fontWeight: 800, color: '#4040C8', textTransform: 'uppercase', letterSpacing: '.6px', marginTop: 2 }}>{month}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#1A1D2E' }}>{m.title}</div>
                        {m.status !== 'scheduled' && (
                          <span className={`badge ${statusBadgeClass(m.status)}`} style={{ fontSize: 9, padding: '1px 6px' }}>
                            {m.status}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: '#9BA3C4', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {meetingMeta(m)}
                      </div>
                      {m.participants.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {m.participants.slice(0, 3).map((p) => (
                            <span key={p} className="badge b-gy" style={{ fontSize: 9 }}>{p}</span>
                          ))}
                          {m.participants.length > 3 && (
                            <span className="badge b-gy" style={{ fontSize: 9 }}>+{m.participants.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <span className={`badge ${relCls}`} style={{ flexShrink: 0, alignSelf: 'flex-start', whiteSpace: 'nowrap' }}>{relative}</span>
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
          onClose={() => setActiveMeeting(null)}
          onUpdated={(updated) => {
            setData((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
            setActiveMeeting(updated);
          }}
        />
      )}
    </div>
  );
}
