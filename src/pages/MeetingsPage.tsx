import { useMemo, useState } from 'react';

type Meeting = {
  id: string;
  date: Date;
  title: string;
  meta: string;
  type: 'earnings' | 'briefing' | 'investor' | 'due-diligence' | 'board' | 'agm';
  channel: 'Zoom' | 'Teams' | 'In-person';
  participants: number | string;
  organizer: { name: string; initials: string; color: string };
  tags: string[];
  confidential?: boolean;
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const MEETINGS: Meeting[] = [
  {
    id: '1',
    date: new Date(2025, 3, 16, 10, 0),
    title: 'Q1 2025 Earnings Call',
    meta: 'Institutional investors · 120 participants · Zoom · 10:00 AM',
    type: 'earnings',
    channel: 'Zoom',
    participants: 120,
    organizer: { name: 'Ahmad Al-Rashid', initials: 'AR', color: '#4040C8' },
    tags: ['Q1 results', 'Live Q&A'],
  },
  {
    id: '2',
    date: new Date(2025, 3, 22, 14, 0),
    title: 'ESG Investor Briefing',
    meta: 'ESG-focused LPs · 8 attendees · Teams · 2:00 PM',
    type: 'briefing',
    channel: 'Teams',
    participants: 8,
    organizer: { name: 'Sarah Rahman', initials: 'SR', color: '#22C55E' },
    tags: ['Scope 3', 'Net-zero'],
  },
  {
    id: '3',
    date: new Date(2025, 4, 5, 9, 0),
    title: 'Investor Day — Riyadh',
    meta: 'Annual investor day · 200+ · In-person · 9:00 AM',
    type: 'investor',
    channel: 'In-person',
    participants: '200+',
    organizer: { name: 'Khalid Aziz', initials: 'KA', color: '#7C3AED' },
    tags: ['Strategy 2030', 'Site tour'],
  },
  {
    id: '4',
    date: new Date(2025, 4, 18, 11, 0),
    title: '1-on-1: SWF Due Diligence',
    meta: 'Sovereign wealth fund · Confidential · Teams',
    type: 'due-diligence',
    channel: 'Teams',
    participants: 4,
    organizer: { name: 'Ahmad Al-Rashid', initials: 'AR', color: '#4040C8' },
    tags: ['NDA signed'],
    confidential: true,
  },
];

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

function ScheduleMeetingModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ width: 520, padding: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #ECEEF8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E', letterSpacing: '-.2px' }}>Schedule Meeting</div>
            <div style={{ fontSize: 11, color: '#5A6080', marginTop: 2 }}>Add a board, investor, or 1-on-1 meeting to the calendar</div>
          </div>
          <button className="btn bs bsm" onClick={onClose} style={{ padding: '6px 9px' }}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 2l7 7M9 2l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="fl" style={{ marginBottom: 0 }}>
            <span className="fl-label">Title</span>
            <input className="inp" placeholder="e.g. Q2 Earnings Call" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="fl" style={{ marginBottom: 0 }}>
              <span className="fl-label">Date</span>
              <input className="inp" type="date" />
            </div>
            <div className="fl" style={{ marginBottom: 0 }}>
              <span className="fl-label">Time</span>
              <input className="inp" type="time" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="fl" style={{ marginBottom: 0 }}>
              <span className="fl-label">Type</span>
              <select className="inp sel">
                <option>Earnings call</option>
                <option>Investor briefing</option>
                <option>Investor day</option>
                <option>1-on-1 due diligence</option>
                <option>Board meeting</option>
                <option>AGM</option>
              </select>
            </div>
            <div className="fl" style={{ marginBottom: 0 }}>
              <span className="fl-label">Channel</span>
              <select className="inp sel">
                <option>Zoom</option>
                <option>Teams</option>
                <option>In-person</option>
              </select>
            </div>
          </div>
          <div className="fl" style={{ marginBottom: 0 }}>
            <span className="fl-label">Notes</span>
            <textarea className="inp" rows={3} placeholder="Agenda, attendees, materials to circulate…" style={{ resize: 'vertical' }} />
          </div>
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid #ECEEF8', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn bs bsm" onClick={onClose}>Cancel</button>
          <button className="btn bp bsm" onClick={onClose}>Schedule</button>
        </div>
      </div>
    </div>
  );
}

export default function MeetingsPage() {
  const today = new Date();
  const [viewMonth, setViewMonth] = useState(new Date(2025, 3, 1));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const upcoming = useMemo(
    () => MEETINGS.filter((m) => m.date >= new Date(today.getFullYear(), today.getMonth(), today.getDate())).sort((a, b) => a.date.getTime() - b.date.getTime()),
    [today],
  );

  const monthMeetings = useMemo(
    () => MEETINGS.filter((m) => m.date.getMonth() === viewMonth.getMonth() && m.date.getFullYear() === viewMonth.getFullYear()),
    [viewMonth],
  );

  const eventDays = useMemo(() => new Set(monthMeetings.map((m) => m.date.getDate())), [monthMeetings]);

  const selectedMeetings = useMemo(
    () => (selectedDate ? MEETINGS.filter((m) => isSameDay(m.date, selectedDate)) : []),
    [selectedDate],
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
                    <div key={m.id} style={{ padding: '8px 10px', background: '#fff', borderRadius: 8, marginBottom: 6, fontSize: 11 }}>
                      <div style={{ fontWeight: 700, color: '#1A1D2E', marginBottom: 2 }}>{m.title}</div>
                      <div style={{ color: '#5A6080', fontSize: 10 }}>{m.meta}</div>
                    </div>
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
            <span className="badge b-or">{upcoming.length} scheduled</span>
          </div>
          <div style={{ padding: '6px 18px 14px' }}>
            {upcoming.map((m, i) => {
              const day = m.date.getDate().toString().padStart(2, '0');
              const month = SHORT_MONTHS[m.date.getMonth()];
              const relative = formatRelative(m.date, today);
              const relCls = relativeBadgeClass(m.date, today);
              return (
                <div
                  key={m.id}
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
                      {m.confidential && <span className="badge b-rd" style={{ fontSize: 9, padding: '1px 6px' }}>NDA</span>}
                    </div>
                    <div style={{ fontSize: 10, color: '#9BA3C4', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.meta}</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {m.tags.map((t) => <span key={t} className="badge b-gy" style={{ fontSize: 9 }}>{t}</span>)}
                    </div>
                  </div>
                  <span className={`badge ${relCls}`} style={{ flexShrink: 0, alignSelf: 'flex-start', whiteSpace: 'nowrap' }}>{relative}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {scheduleOpen && <ScheduleMeetingModal onClose={() => setScheduleOpen(false)} />}
    </div>
  );
}
