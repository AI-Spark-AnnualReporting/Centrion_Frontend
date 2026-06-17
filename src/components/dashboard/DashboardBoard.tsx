import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  meetings as meetingsApi,
  team as teamApi,
  companies as companiesApi,
  type TeamMember,
} from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { Meeting } from '@/types/meeting';
import type {
  CompanyQuestion,
  CompanyQuestionsResponse,
} from '@/types/report';

const SHORT_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

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

// Current enum values first; legacy keys retained so historical rows still
// render a sensible label/badge instead of falling back to "Member".
const POSITION_LABELS: Record<string, string> = {
  executive: 'Executive',
  board_member: 'Board',
  investor_contact: 'Investor',
  esg_lead: 'ESG Lead',
  other: 'Other',
  // legacy
  investor: 'Investor',
  finance: 'Finance',
  operations: 'Operations',
  CTO: 'CTO',
  CEO: 'CEO',
};

const POSITION_BADGE: Record<string, string> = {
  executive: 'b-pp',
  board_member: 'b-bl',
  investor_contact: 'b-tl',
  esg_lead: 'b-gn',
  other: 'b-gy',
  // legacy
  investor: 'b-tl',
  finance: 'b-am',
  operations: 'b-bl',
  CTO: 'b-pp',
  CEO: 'b-pp',
};

// Sort priority for the leadership card — board first, then C-suite/exec,
// then investors, then everyone else. Matches what a board member expects to
// see at the top of "who's around the table".
const POSITION_PRIORITY: Record<string, number> = {
  board_member: 0,
  executive: 2,
  investor_contact: 3,
  esg_lead: 4,
  other: 5,
  // legacy
  CEO: 1,
  CTO: 1,
  investor: 3,
  finance: 4,
  operations: 4,
};

const PILLAR_TONE: Record<string, string> = {
  E: 'b-gn',
  S: 'b-tl',
  G: 'b-pp',
  ESG: 'b-or',
};

function toLocalDate(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split('-').map((x) => parseInt(x, 10));
  const [hh = 0, mm = 0, ss = 0] = (timeStr ?? '00:00:00').split(':').map((x) => parseInt(x, 10));
  return new Date(y, (m || 1) - 1, d || 1, hh, mm, ss);
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map((x) => parseInt(x, 10));
  if (Number.isNaN(h)) return timeStr;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = ((h + 11) % 12) + 1;
  return `${hour12}:${(m || 0).toString().padStart(2, '0')} ${period}`;
}

function formatRelativePast(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function initialsFor(name: string | null | undefined, fallback = '?'): string {
  const n = (name || '').trim();
  if (!n) return fallback.toUpperCase();
  const parts = n.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return ((first + last) || first || fallback).toUpperCase();
}

function avatarColor(seed: string): string {
  // Deterministic color from a small palette so the same person always gets
  // the same swatch across renders.
  const palette = ['#4040C8', '#0D9488', '#7C3AED', '#16A34A', '#B45309', '#DC2626', '#2563EB', '#0891B2'];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

// Group people for the Leadership card stat strip. Returns counts per
// macro-bucket (Board / Exec / Investor / Other) so we can show one number
// each at the top of the card.
function compositionCounts(members: TeamMember[]) {
  let board = 0;
  let exec = 0;
  let investor = 0;
  let other = 0;
  for (const m of members) {
    if (m.status === 'inactive') continue;
    const pt = m.position_type ?? 'other';
    if (pt === 'board_member') board++;
    else if (pt === 'executive' || pt === 'CEO' || pt === 'CTO') exec++;
    else if (pt === 'investor') investor++;
    else other++;
  }
  return { board, exec, investor, other, total: board + exec + investor + other };
}

function sortLeadership(members: TeamMember[]): TeamMember[] {
  return [...members]
    .filter((m) => m.status !== 'inactive')
    .sort((a, b) => {
      const pa = POSITION_PRIORITY[a.position_type ?? 'other'] ?? 9;
      const pb = POSITION_PRIORITY[b.position_type ?? 'other'] ?? 9;
      if (pa !== pb) return pa - pb;
      return (a.full_name ?? '').localeCompare(b.full_name ?? '');
    });
}

export function DashboardBoard({ refreshKey = 0 }: { refreshKey?: number }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [questions, setQuestions] = useState<CompanyQuestion[]>([]);
  const [loadingMeetings, setLoadingMeetings] = useState(true);
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [loadingQuestions, setLoadingQuestions] = useState(true);

  // Calendar view state — defaults to current month.
  const today = useMemo(() => new Date(), []);
  const [viewMonth, setViewMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  useEffect(() => {
    let cancelled = false;
    setLoadingMeetings(true);
    meetingsApi
      .list()
      .then((res) => {
        if (cancelled) return;
        setMeetings(res.meetings);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoadingMeetings(false));
    return () => { cancelled = true; };
  }, [refreshKey]);

  useEffect(() => {
    if (!companyId) {
      setLoadingTeam(false);
      setLoadingQuestions(false);
      return;
    }
    let cancelled = false;
    teamApi
      .list(companyId)
      .then((data) => !cancelled && setTeam(data))
      .catch(() => {})
      .finally(() => !cancelled && setLoadingTeam(false));
    companiesApi
      .listQuestions<CompanyQuestionsResponse>(companyId)
      .then((res) => !cancelled && setQuestions(res.questions ?? []))
      .catch(() => {})
      .finally(() => !cancelled && setLoadingQuestions(false));
    return () => { cancelled = true; };
  }, [companyId]);

  // Decorate + filter upcoming meetings (status=scheduled, datetime in future).
  const upcoming = useMemo(() => {
    const now = Date.now();
    return meetings
      .filter((m) => m.status !== 'cancelled' && m.status !== 'completed')
      .map((m) => ({ ...m, _date: toLocalDate(m.meeting_date, m.meeting_time) }))
      .filter((m) => m._date.getTime() > now)
      .sort((a, b) => a._date.getTime() - b._date.getTime());
  }, [meetings]);

  const nextMeeting = upcoming[0] ?? null;

  // Recent meeting activity — sort by created_at desc, take last 3.
  const recent = useMemo(() => {
    return [...meetings]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 3);
  }, [meetings]);

  // Calendar event days (this view month).
  const monthEventDays = useMemo(() => {
    const set = new Set<number>();
    for (const m of meetings) {
      if (m.status === 'cancelled') continue;
      const d = toLocalDate(m.meeting_date, m.meeting_time);
      if (d.getMonth() === viewMonth.getMonth() && d.getFullYear() === viewMonth.getFullYear()) {
        set.add(d.getDate());
      }
    }
    return set;
  }, [meetings, viewMonth]);

  const firstWeekday = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getDay();
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const stepMonth = (delta: number) => {
    const next = new Date(viewMonth);
    next.setMonth(next.getMonth() + delta);
    setViewMonth(next);
  };

  // Live countdown — re-render every second while there's a next meeting.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!nextMeeting) return;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [nextMeeting?.id]);

  const countdown = useMemo(() => {
    if (!nextMeeting) return { d: '00', h: '00', m: '00', s: '00', overdue: false };
    const target = nextMeeting._date.getTime();
    const diff = target - Date.now();
    if (diff <= 0) return { d: '00', h: '00', m: '00', s: '00', overdue: true };
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return {
      d: d.toString().padStart(2, '0'),
      h: h.toString().padStart(2, '0'),
      m: m.toString().padStart(2, '0'),
      s: s.toString().padStart(2, '0'),
      overdue: false,
    };
  // Re-evaluate whenever the next meeting changes; ticker drives re-renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextMeeting?.id, nextMeeting?._date.getTime()]);

  const composition = useMemo(() => compositionCounts(team), [team]);
  const leadership = useMemo(() => sortLeadership(team).slice(0, 5), [team]);

  const openQuestions = useMemo(
    () =>
      [...questions]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 4),
    [questions],
  );

  return (
    <div>
      {/* Top row — Next meeting countdown · Upcoming · Leadership */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr 1fr', gap: 14, marginBottom: 14 }}>
        {/* Next Meeting Countdown */}
        <div style={{ background: '#3535B5', borderRadius: 16, padding: '18px 20px', color: '#fff', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -40, right: -30, width: 130, height: 130, borderRadius: '50%', background: 'radial-gradient(circle,rgba(100,116,255,.22),transparent 70%)' }} />
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: 'rgba(255,255,255,.4)', marginBottom: 4 }}>Next Meeting</div>
          {loadingMeetings ? (
            <div style={{ height: 96, display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,.55)', fontSize: 11 }}>Loading…</div>
          ) : nextMeeting ? (
            <>
              <div
                style={{
                  fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 2,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
                title={nextMeeting.title}
              >
                {nextMeeting.title}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', marginBottom: 12 }}>
                {nextMeeting._date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · {formatTime(nextMeeting.meeting_time)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                {[
                  { val: countdown.d, label: 'Days' },
                  { val: countdown.h, label: 'Hrs' },
                  { val: countdown.m, label: 'Min' },
                  { val: countdown.s, label: 'Sec' },
                ].map((u, i) => (
                  <div key={u.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {i > 0 && <span style={{ fontSize: 16, fontWeight: 700, color: '#818CF8', paddingBottom: 14 }}>:</span>}
                    <div style={{ textAlign: 'center' }}>
                      <span style={{ fontSize: 20, fontWeight: 800, fontFamily: "'DM Mono',monospace", background: 'rgba(255,255,255,.1)', borderRadius: 8, padding: '5px 9px', display: 'block', color: '#fff', lineHeight: 1.2 }}>{u.val}</span>
                      <div style={{ fontSize: 8, color: 'rgba(255,255,255,.35)', textTransform: 'uppercase', marginTop: 3 }}>{u.label}</div>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => navigate('/meetings')}
                className="btn"
                style={{ width: '100%', justifyContent: 'center', background: 'rgba(255,255,255,.12)', color: '#C7D2FE', border: '1px solid rgba(255,255,255,.18)', fontSize: 11, borderRadius: 8, padding: 7, cursor: 'pointer' }}
              >
                View Meeting →
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 2 }}>No upcoming meetings</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', marginBottom: 14 }}>Your schedule is clear.</div>
              <div style={{ height: 60 }} />
              <button
                onClick={() => navigate('/meetings')}
                className="btn"
                style={{ width: '100%', justifyContent: 'center', background: 'rgba(255,255,255,.12)', color: '#C7D2FE', border: '1px solid rgba(255,255,255,.18)', fontSize: 11, borderRadius: 8, padding: 7, cursor: 'pointer' }}
              >
                Schedule Meeting →
              </button>
            </>
          )}
        </div>

        {/* Upcoming Meetings */}
        <div className="card">
          <div className="ch">
            <div className="ct">Upcoming Meetings</div>
            <button
              type="button"
              onClick={() => navigate('/meetings')}
              className="btn bs bsm"
              style={{ cursor: 'pointer' }}
            >
              View All →
            </button>
          </div>
          <div style={{ padding: '6px 16px' }}>
            {loadingMeetings ? (
              <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 11, color: '#9BA3C4' }}>Loading meetings…</div>
            ) : upcoming.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 11, color: '#9BA3C4' }}>
                No upcoming meetings.{' '}
                <button
                  onClick={() => navigate('/meetings')}
                  style={{ background: 'none', border: 'none', color: '#4040C8', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}
                >
                  Schedule one →
                </button>
              </div>
            ) : (
              upcoming.slice(0, 2).map((mtg, i, arr) => {
                const day = mtg._date.getDate().toString().padStart(2, '0');
                const month = SHORT_MONTHS[mtg._date.getMonth()];
                const typeLabel = TYPE_LABELS[mtg.meeting_type] ?? mtg.meeting_type;
                const typeBadge = TYPE_BADGE[mtg.meeting_type] ?? 'b-or';
                return (
                  <div
                    key={mtg.id}
                    onClick={() => navigate('/meetings')}
                    style={{
                      display: 'flex', gap: 10, padding: '10px 0',
                      borderBottom: i < arr.length - 1 ? '1px solid #ECEEF8' : 'none', cursor: 'pointer',
                    }}
                  >
                    <div style={{ minWidth: 42, height: 42, background: '#EEEEFF', border: '1px solid rgba(64,64,200,.15)', borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#4040C8', lineHeight: 1 }}>{day}</div>
                      <div style={{ fontSize: 8, fontWeight: 700, color: '#4040C8', textTransform: 'uppercase' }}>{month}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12, fontWeight: 700, color: '#1A1D2E', marginBottom: 2,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}
                      >
                        {mtg.title}
                      </div>
                      <div style={{ fontSize: 10, color: '#9BA3C4' }}>
                        {formatTime(mtg.meeting_time)}
                        {mtg.participants.length > 0 && ` · ${mtg.participants.length} ${mtg.participants.length === 1 ? 'attendee' : 'attendees'}`}
                      </div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
                        <span className={`badge ${typeBadge}`}>{typeLabel}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Leadership */}
        <div className="card">
          <div className="ch">
            <div className="ct">Leadership</div>
            <button
              type="button"
              onClick={() => navigate('/stakeholders')}
              className="btn bs bsm"
              style={{ cursor: 'pointer' }}
            >
              View All →
            </button>
          </div>
          {loadingTeam ? (
            <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 11, color: '#9BA3C4' }}>Loading leadership…</div>
          ) : composition.total === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 11, color: '#9BA3C4' }}>
              No team members yet.{' '}
              <button
                onClick={() => navigate('/stakeholders')}
                style={{ background: 'none', border: 'none', color: '#4040C8', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}
              >
                Add people →
              </button>
            </div>
          ) : (
            <>
              <div style={{ padding: '10px 16px 8px', display: 'flex', gap: 0, borderBottom: '1px solid #ECEEF8' }}>
                {[
                  { n: composition.board, label: 'Board', color: '#2563EB' },
                  { n: composition.exec, label: 'Exec', color: '#7C3AED' },
                  { n: composition.investor, label: 'Investor', color: '#0D9488' },
                  { n: composition.other, label: 'Other', color: '#5A6080' },
                ].map((s, i, arr) => (
                  <div
                    key={s.label}
                    style={{
                      flex: 1, textAlign: 'center', padding: '4px 0',
                      borderRight: i < arr.length - 1 ? '1px solid #ECEEF8' : 'none',
                    }}
                  >
                    <div style={{ fontSize: 18, fontWeight: 800, color: s.color, lineHeight: 1.1, fontFamily: "'DM Mono',monospace" }}>{s.n}</div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#9BA3C4', textTransform: 'uppercase', letterSpacing: '.5px', marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ padding: '4px 16px' }}>
                {leadership.length === 0 ? (
                  <div style={{ padding: '14px 0', textAlign: 'center', fontSize: 11, color: '#9BA3C4' }}>No active members.</div>
                ) : (
                  leadership.map((m, i) => {
                    const pt = m.position_type ?? 'other';
                    const label = POSITION_LABELS[pt] ?? 'Member';
                    const cls = POSITION_BADGE[pt] ?? 'b-gy';
                    const initials = initialsFor(m.full_name, m.email);
                    return (
                      <div
                        key={m.id}
                        onClick={() => navigate('/stakeholders')}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 9,
                          padding: '7px 0',
                          borderBottom: i < leadership.length - 1 ? '1px solid #ECEEF8' : 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: avatarColor(m.id || m.email), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#fff', flexShrink: 0 }}>{initials}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 11, fontWeight: 700, color: '#1A1D2E',
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            }}
                          >
                            {m.full_name || m.email}
                          </div>
                          <div
                            style={{
                              fontSize: 10, color: '#9BA3C4',
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            }}
                          >
                            {m.title || m.email}
                          </div>
                        </div>
                        <span className={`badge ${cls}`}>{label}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bottom row — Calendar · Activity + Open Questions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {/* Calendar (real meeting events) */}
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
          <div style={{ padding: '10px 14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 0, marginBottom: 4 }}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <div key={i} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: '#9BA3C4', textTransform: 'uppercase', padding: 4 }}>{d}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
              {Array.from({ length: firstWeekday }).map((_, i) => <div key={`e${i}`} style={{ height: 34 }} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const cellDate = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day);
                const isToday = isSameDay(cellDate, today);
                const hasEvent = monthEventDays.has(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => navigate('/meetings')}
                    className={`cal-day ${isToday ? 'today' : ''} ${hasEvent ? 'has-event' : ''}`}
                    style={{ border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
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
            </div>
          </div>
        </div>

        {/* Activity + Open Questions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Recent Activity */}
          <div className="card">
            <div className="ch">
              <div className="ct">Recent Activity</div>
              <button
                type="button"
                onClick={() => navigate('/meetings')}
                className="btn bs bsm"
                style={{ cursor: 'pointer' }}
              >
                View All →
              </button>
            </div>
            <div style={{ padding: '4px 16px' }}>
              {loadingMeetings ? (
                <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 11, color: '#9BA3C4' }}>Loading activity…</div>
              ) : recent.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 11, color: '#9BA3C4' }}>No recent activity.</div>
              ) : (
                recent.map((m, i) => {
                  const initials = initialsFor(TYPE_LABELS[m.meeting_type] ?? m.title);
                  const color = avatarColor(m.id);
                  const typeLabel = TYPE_LABELS[m.meeting_type] ?? m.meeting_type;
                  return (
                    <div
                      key={m.id}
                      onClick={() => navigate('/meetings')}
                      style={{
                        display: 'flex', gap: 10, padding: '9px 0',
                        borderBottom: i < recent.length - 1 ? '1px solid #ECEEF8' : 'none',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#fff', flexShrink: 0 }}>{initials}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12, color: '#1A1D2E', lineHeight: 1.4,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}
                        >
                          <b>{typeLabel}</b> scheduled — {m.title}
                        </div>
                        <div style={{ fontSize: 10, color: '#9BA3C4', marginTop: 1 }}>{formatRelativePast(m.created_at)}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Open Questions */}
          <div className="card" style={{ flex: 1 }}>
            <div className="ch">
              <div className="ct">Open Questions</div>
              <button
                type="button"
                onClick={() => navigate('/questions')}
                className="btn bs bsm"
                style={{ cursor: 'pointer' }}
              >
                View All →
              </button>
            </div>
            <div style={{ padding: '6px 16px' }}>
              {loadingQuestions ? (
                <div style={{ padding: '18px 0', textAlign: 'center', fontSize: 11, color: '#9BA3C4' }}>Loading questions…</div>
              ) : openQuestions.length === 0 ? (
                <div style={{ padding: '18px 0', textAlign: 'center', fontSize: 11, color: '#9BA3C4' }}>
                  No open questions.{' '}
                  <button
                    onClick={() => navigate('/questions')}
                    style={{ background: 'none', border: 'none', color: '#4040C8', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}
                  >
                    Open Question Bank →
                  </button>
                </div>
              ) : (
                openQuestions.map((q, i) => {
                  const pillar = q.indicator?.esg_pillar ?? 'ESG';
                  const pillarCls = PILLAR_TONE[pillar] ?? 'b-or';
                  const framework = q.indicator?.framework ?? '—';
                  return (
                    <div
                      key={q.id}
                      onClick={() => navigate('/questions')}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 9, padding: '9px 0',
                        borderBottom: i < openQuestions.length - 1 ? '1px solid #ECEEF8' : 'none',
                        cursor: 'pointer',
                      }}
                    >
                      <span className={`badge ${pillarCls}`} style={{ flexShrink: 0, marginTop: 1 }}>{pillar}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12, fontWeight: 600, color: '#1A1D2E', lineHeight: 1.4,
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                          title={q.question_text}
                        >
                          {q.question_text}
                        </div>
                        <div style={{ fontSize: 10, color: '#9BA3C4', marginTop: 2 }}>
                          {framework} · {q.indicator?.indicator_label ?? 'Indicator'} · {formatRelativePast(q.created_at)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
