import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { meetings as meetingsApi } from '@/lib/api';
import type { Meeting } from '@/types/meeting';
import { SHORT_MONTHS, toLocalDate, formatTime } from '@/lib/calendar';

/** Board Meetings — upcoming scheduled meetings (real, from meetings.list). */

const ACCENT = '#4040C8';
const TYPE_LABELS: Record<string, string> = {
  investor_call: 'Investor Call',
  esg_briefing: 'ESG Briefing',
  one_on_one: '1-on-1',
  board_meeting: 'Board Meeting',
  roadshow: 'Roadshow',
};
const TYPE_BADGE: Record<string, string> = {
  investor_call: 'b-rd',
  esg_briefing: 'b-gn',
  one_on_one: 'b-pp',
  board_meeting: 'b-bl',
  roadshow: 'b-tl',
};

export function BoardMeetingsCard() {
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    meetingsApi
      .list()
      .then((r) => { if (!cancelled) setMeetings(r?.meetings ?? []); })
      .catch(() => { if (!cancelled) setMeetings([]); });
    return () => { cancelled = true; };
  }, []);

  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const upcoming = (meetings ?? [])
    .filter((m) => m.status === 'scheduled')
    .map((m) => ({ m, date: toLocalDate(m.meeting_date, m.meeting_time) }))
    .filter((x) => x.date >= startToday)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 3);

  return (
    <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#1A1D2E', flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.6px', textTransform: 'uppercase', color: '#5A6080' }}>Board Meetings</span>
        </div>
        <button type="button" onClick={() => navigate('/meetings')} style={{ fontSize: 12, fontWeight: 700, color: ACCENT, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>Board →</button>
      </div>
      <div style={{ height: 1, background: '#ECEEF8', margin: '8px 0 2px' }} />

      {meetings === null ? (
        <div style={{ padding: '18px 0', fontSize: 12.5, color: '#9BA3C4' }}>Loading…</div>
      ) : upcoming.length === 0 ? (
        <div style={{ padding: '18px 2px', fontSize: 12.5, color: '#9BA3C4', lineHeight: 1.6 }}>
          No upcoming meetings. <button type="button" onClick={() => navigate('/meetings')} style={{ color: ACCENT, fontWeight: 700, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>Schedule one →</button>
        </div>
      ) : (
        upcoming.map(({ m, date }, i) => {
          const day = date.getDate().toString().padStart(2, '0');
          const month = SHORT_MONTHS[date.getMonth()];
          const label = TYPE_LABELS[m.meeting_type] ?? m.meeting_type;
          const badge = TYPE_BADGE[m.meeting_type] ?? 'b-or';
          return (
            <div key={m.id} onClick={() => navigate('/meetings')} style={{ display: 'flex', gap: 11, alignItems: 'center', padding: '11px 0', borderTop: i ? '1px solid #F4F5FA' : 'none', cursor: 'pointer' }}>
              <div style={{ minWidth: 42, height: 42, background: '#EEEEFF', border: '1px solid rgba(64,64,200,.15)', borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#4040C8', lineHeight: 1 }}>{day}</div>
                <div style={{ fontSize: 8, fontWeight: 800, color: '#4040C8', textTransform: 'uppercase', letterSpacing: '.4px', marginTop: 2 }}>{month}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1A1D2E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>{m.title}</div>
                <div style={{ fontSize: 10.5, color: '#9BA3C4', marginBottom: 5 }}>
                  {formatTime(m.meeting_time)}
                  {m.participants.length > 0 && ` · ${m.participants.length} ${m.participants.length === 1 ? 'attendee' : 'attendees'}`}
                </div>
                <span className={`badge ${badge}`} style={{ fontSize: 9 }}>{label}</span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

export default BoardMeetingsCard;
