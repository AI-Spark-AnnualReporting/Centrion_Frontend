import { useEffect, useMemo, useState } from 'react';
import {
  reports as reportsApi,
  meetings as meetingsApi,
  sarCycles,
  companies as companiesApi,
} from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { Company } from '@/types/company';
import type { Cycle } from '@/types/cycles';
import { deriveEvents, splitEvents, type TimelineEvent, type ReportListItem } from '@/lib/disclosure';
import { MONTHS, WEEKDAYS, SHORT_MONTHS, isSameDay, formatCountdown } from '@/lib/calendar';

/**
 * IR Calendar — full-year disclosure schedule. Read-only this pass: a month grid
 * plus an upcoming-deadlines rail, built from the same derived events as the
 * Disclosure Timeline card (reports, meetings, derived next-due milestones). No
 * blackout shading and no "+ Add event" yet — both need backend persistence.
 */

const ACCENT = '#4040C8';

function escapeIcs(s: string): string {
  return (s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function toIcsDate(d: Date): string {
  return `${d.getFullYear()}${(d.getMonth() + 1).toString().padStart(2, '0')}${d.getDate().toString().padStart(2, '0')}`;
}

function buildIcs(events: TimelineEvent[]): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Centriyon//IR Calendar//EN', 'CALSCALE:GREGORIAN'];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@centriyon`,
      `DTSTART;VALUE=DATE:${toIcsDate(e.date)}`,
      `SUMMARY:${escapeIcs(e.title)}`,
      `DESCRIPTION:${escapeIcs(e.subtitle)}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export default function IRCalendarPage() {
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;
  const today = useMemo(() => new Date(), []);
  const [viewMonth, setViewMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [events, setEvents] = useState<TimelineEvent[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const isAdmin = user?.role === 'admin';
    (async () => {
      const [rRes, mRes, cRes, coRes] = await Promise.allSettled([
        companyId
          ? reportsApi.list<{ reports?: ReportListItem[] }>(companyId)
          : Promise.resolve({ reports: [] as ReportListItem[] }),
        meetingsApi.list(),
        isAdmin ? sarCycles.list() : Promise.resolve([] as Cycle[]),
        companiesApi.getMyCompany(),
      ]);
      if (cancelled) return;
      const reports = rRes.status === 'fulfilled' ? rRes.value?.reports ?? [] : [];
      const meetings = mRes.status === 'fulfilled' ? mRes.value?.meetings ?? [] : [];
      const cycles = cRes.status === 'fulfilled' ? cRes.value ?? [] : [];
      const company: Company | null = coRes.status === 'fulfilled' ? coRes.value : null;
      setEvents(deriveEvents({ reports, meetings, company, cycles }));
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, user?.role]);

  const evs = useMemo(() => events ?? [], [events]);
  const { upcoming } = splitEvents(evs, today);

  // Calendar grid mechanics (native Date), mirroring MeetingsPage.
  const firstWeekday = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getDay();
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const stepMonth = (delta: number) => {
    const next = new Date(viewMonth);
    next.setMonth(next.getMonth() + delta);
    setViewMonth(next);
    setSelectedDate(null);
  };

  const monthEvents = useMemo(
    () => evs.filter((e) => e.date.getMonth() === viewMonth.getMonth() && e.date.getFullYear() === viewMonth.getFullYear()),
    [evs, viewMonth],
  );
  const eventDays = useMemo(() => new Set(monthEvents.map((e) => e.date.getDate())), [monthEvents]);
  const selectedEvents = selectedDate ? evs.filter((e) => isSameDay(e.date, selectedDate)) : [];

  const handleExport = () => {
    const ics = buildIcs(evs);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ir-calendar.ics';
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
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1px', color: '#9BA3C4', textTransform: 'uppercase', marginBottom: 6 }}>IR Calendar</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1A1D2E', letterSpacing: '-.5px', marginBottom: 3 }}>Disclosure schedule</h2>
          <p style={{ fontSize: 12, color: '#5A6080' }}>Full-year deadlines, board meetings, and regulatory reminders</p>
        </div>
        <button className="btn bp" onClick={handleExport} disabled={evs.length === 0} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', opacity: evs.length === 0 ? 0.5 : 1 }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v6.5M3.5 5.5L6 8l2.5-2.5M2 10h8" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Export
        </button>
      </div>

      {/* Calendar + Upcoming deadlines */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: selectedEvents.length ? 8 : 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#1A1D2E' }}>
                    {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </div>
                  <button className="btn bs bsm" onClick={() => setSelectedDate(null)} style={{ padding: '3px 9px', fontSize: 10 }}>Clear</button>
                </div>
                {selectedEvents.length === 0 ? (
                  <div style={{ fontSize: 11, color: '#9BA3C4' }}>Nothing scheduled on this day.</div>
                ) : (
                  selectedEvents.map((e) => (
                    <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: '#fff', borderRadius: 8, marginBottom: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: e.dotColor, flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#1A1D2E' }}>{e.title}</div>
                        <div style={{ fontSize: 10, color: '#9BA3C4' }}>{e.subtitle}</div>
                      </div>
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
                Has event
              </span>
            </div>
          </div>
        </div>

        {/* Upcoming deadlines */}
        <div className="card">
          <div className="ch">
            <div className="ct">Upcoming Deadlines</div>
            <span className="badge b-or">
              {events === null ? 'Loading…' : `${upcoming.length} upcoming`}
            </span>
          </div>
          <div style={{ padding: '6px 18px 14px' }}>
            {events === null ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: '#9BA3C4', fontSize: 12 }}>
                <div className="proc-ring" style={{ margin: '0 auto 10px', width: 28, height: 28, borderWidth: 2.5 }} />
                Loading calendar…
              </div>
            ) : upcoming.length === 0 ? (
              <div style={{ padding: '28px 4px', textAlign: 'center', color: '#9BA3C4', fontSize: 12, lineHeight: 1.6 }}>
                No upcoming deadlines. Derived report due-dates, board meetings, and cycle
                deadlines will appear here as they're set up.
              </div>
            ) : (
              upcoming.map((e, i) => {
                const day = e.date.getDate().toString().padStart(2, '0');
                const month = SHORT_MONTHS[e.date.getMonth()];
                return (
                  <div
                    key={e.id}
                    style={{
                      display: 'flex', gap: 12, padding: '12px 0', alignItems: 'flex-start',
                      borderBottom: i < upcoming.length - 1 ? '1px solid #ECEEF8' : 'none',
                    }}
                  >
                    <div style={{
                      minWidth: 46, height: 46, background: '#F2F3FA',
                      border: `1px solid ${e.dotColor}33`, borderRadius: 10,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: e.dotColor, lineHeight: 1 }}>{day}</div>
                      <div style={{ fontSize: 8, fontWeight: 800, color: e.dotColor, textTransform: 'uppercase', letterSpacing: '.6px', marginTop: 2 }}>{month}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#1A1D2E' }}>{e.title}</span>
                        {e.tone === 'urgent' && (
                          <span style={{ fontSize: 9, fontWeight: 800, color: '#E5484D', background: 'rgba(229,72,77,.12)', padding: '1px 6px', borderRadius: 999 }}>URGENT</span>
                        )}
                      </div>
                      <div style={{ fontSize: 10.5, color: '#9BA3C4' }}>{e.subtitle}</div>
                    </div>
                    <span style={{ flexShrink: 0, alignSelf: 'flex-start', fontSize: 10.5, fontWeight: 700, color: '#5A6080', whiteSpace: 'nowrap' }}>
                      {formatCountdown(e.date, today)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
