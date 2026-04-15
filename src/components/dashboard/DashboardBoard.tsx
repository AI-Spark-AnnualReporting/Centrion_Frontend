import { useState, useEffect } from 'react';

export function DashboardBoard() {
  const [countdown, setCountdown] = useState({ d: '05', h: '14', m: '32', s: '08' });

  useEffect(() => {
    const target = new Date();
    target.setDate(target.getDate() + 5);
    target.setHours(14, 32, 8);

    const interval = setInterval(() => {
      const diff = Math.max(0, target.getTime() - Date.now());
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown({
        d: d.toString().padStart(2, '0'),
        h: h.toString().padStart(2, '0'),
        m: m.toString().padStart(2, '0'),
        s: s.toString().padStart(2, '0'),
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr 1fr', gap: 14, marginBottom: 14 }}>
        {/* Countdown */}
        <div style={{ background: '#3535B5', borderRadius: 16, padding: '18px 20px', color: '#fff', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -40, right: -30, width: 130, height: 130, borderRadius: '50%', background: 'radial-gradient(circle,rgba(100,116,255,.22),transparent 70%)' }} />
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: 'rgba(255,255,255,.4)', marginBottom: 4 }}>Next Deadline</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 2 }}>SAMA Q1 Regulatory Filing</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', marginBottom: 12 }}>Due April 18, 2025</div>
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
          <button className="btn" style={{ width: '100%', justifyContent: 'center', background: 'rgba(255,255,255,.12)', color: '#C7D2FE', border: '1px solid rgba(255,255,255,.18)', fontSize: 11, borderRadius: 8, padding: 7 }}>View Requirements →</button>
        </div>

        {/* Board Meetings */}
        <div className="card">
          <div className="ch"><div className="ct">Board Meetings</div><button className="btn bs bsm">View All →</button></div>
          <div style={{ padding: '6px 16px' }}>
            {[
              { day: '18', month: 'DEC', title: 'Q4 Board Meeting', sub: 'Tadawul req. · 9 members', badges: ['Q4 Financials', 'ESG update'], status: 'ASAP', statusCls: 'b-rd' },
              { day: '15', month: 'JAN', title: 'Annual General Meeting', sub: 'Tadawul Exchange · Board', badges: ['Governance vote', 'Dividend'], status: 'Planned', statusCls: 'b-gy' },
            ].map((mtg, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: i < 1 ? '1px solid #ECEEF8' : 'none', cursor: 'pointer' }}>
                <div style={{ minWidth: 42, height: 42, background: '#EEEEFF', border: '1px solid rgba(64,64,200,.15)', borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#4040C8', lineHeight: 1 }}>{mtg.day}</div>
                  <div style={{ fontSize: 8, fontWeight: 700, color: '#4040C8', textTransform: 'uppercase' }}>{mtg.month}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1A1D2E', marginBottom: 2 }}>{mtg.title}</div>
                  <div style={{ fontSize: 10, color: '#9BA3C4' }}>{mtg.sub}</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
                    {mtg.badges.map((b) => <span key={b} className="badge b-am">{b}</span>)}
                  </div>
                </div>
                <span className={`badge ${mtg.statusCls}`} style={{ flexShrink: 0, alignSelf: 'flex-start' }}>{mtg.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Shareholder Comms */}
        <div className="card">
          <div className="ch"><div className="ct">Shareholder Comms</div><button className="btn bs bsm">Hub →</button></div>
          <div style={{ padding: '6px 16px' }}>
            {[
              { initials: 'ES', color: '#4040C8', title: 'ESG Progress Update', sub: 'Pending approval · Dec 11', badge: 'Approval', cls: 'b-am' },
              { initials: 'AG', color: '#EF4444', title: 'AGM Notice — Apr 15', sub: 'Action needed · Mar 25', badge: 'Urgent', cls: 'b-rd' },
              { initials: 'Q3', color: '#22C55E', title: 'Q3 Earnings Highlights', sub: 'Sent Nov 12 · 88% open rate', badge: 'Sent', cls: 'b-gn' },
            ].map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 0', borderBottom: i < 2 ? '1px solid #ECEEF8' : 'none' }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#fff', flexShrink: 0 }}>{c.initials}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#1A1D2E' }}>{c.title}</div>
                  <div style={{ fontSize: 10, color: '#9BA3C4' }}>{c.sub}</div>
                </div>
                <span className={`badge ${c.cls}`}>{c.badge}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Calendar + Activity/Tasks */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {/* Calendar placeholder */}
        <div className="card">
          <div className="ch"><div className="ct">April 2025</div></div>
          <div style={{ padding: '10px 14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 0, marginBottom: 4 }}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => (
                <div key={d} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: '#9BA3C4', textTransform: 'uppercase', padding: 4 }}>{d}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
              {/* Empty days for April 2025 (starts on Tuesday = 2 empty) */}
              {Array.from({ length: 2 }).map((_, i) => <div key={`e${i}`} style={{ height: 34 }} />)}
              {Array.from({ length: 30 }).map((_, i) => {
                const day = i + 1;
                const today = new Date();
                const isToday = today.getDate() === day && today.getMonth() === 3 && today.getFullYear() === 2025;
                const hasEvent = [16, 22].includes(day);
                return (
                  <div key={day} className={`cal-day ${isToday ? 'today' : ''} ${hasEvent ? 'has-event' : ''}`}>
                    {day}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Activity + Tasks */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <div className="ch"><div className="ct">Recent Activity</div></div>
            <div style={{ padding: '4px 16px' }}>
              {[
                { initials: 'SR', color: '#4040C8', text: '<b>Sarah Rahman</b> uploaded Scope_1_data.xlsx', time: '10 min ago' },
                { initials: 'KA', color: '#22C55E', text: '<b>Khalid Aziz</b> commented on Board Independence', time: '2 hours ago' },
                { initials: 'SY', color: '#7C3AED', text: 'System marked <b>Fatalities</b> as Complete', time: 'Yesterday, 4:32 PM' },
              ].map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '9px 0', borderBottom: i < 2 ? '1px solid #ECEEF8' : 'none' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: a.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#fff', flexShrink: 0 }}>{a.initials}</div>
                  <div>
                    <div style={{ fontSize: 12, color: '#1A1D2E', lineHeight: 1.4 }} dangerouslySetInnerHTML={{ __html: a.text }} />
                    <div style={{ fontSize: 10, color: '#9BA3C4', marginTop: 1 }}>{a.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="card" style={{ flex: 1 }}>
            <div className="ch"><div className="ct">Open Tasks</div><button className="btn bp bsm">+ Add</button></div>
            <div style={{ padding: '6px 16px' }}>
              {[
                { text: 'CEO message Arabic reviewed', done: true, due: 'Done' },
                { text: 'Board pack Q4 — all sections', done: false, due: 'Dec 11', dueColor: '#EF4444', dueBg: '#EF4444' },
                { text: 'TCFD Scope 3 disclosures', done: false, due: 'Dec 20', dueColor: '#B45309', dueBg: 'rgba(245,158,11,.1)' },
                { text: 'AGM notice — legal review', done: false, due: 'Mar 22' },
              ].map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 0', borderBottom: i < 3 ? '1px solid #ECEEF8' : 'none' }}>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', ...(t.done ? { background: '#4040C8' } : { border: '1.5px solid #E2E4F0' }), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {t.done && <svg viewBox="0 0 9 9" fill="none" width="9" height="9"><path d="M2 4.5l1.8 1.8 3.2-3.2" stroke="white" strokeWidth="1.3" strokeLinecap="round" /></svg>}
                  </div>
                  <span style={{ fontSize: 12, color: t.done ? '#9BA3C4' : '#1A1D2E', flex: 1, textDecoration: t.done ? 'line-through' : 'none' }}>{t.text}</span>
                  <span style={{ fontSize: 10, fontWeight: t.dueBg ? 700 : 600, color: t.dueColor || '#9BA3C4', ...(t.dueBg ? { background: t.dueBg === '#EF4444' ? '#EF4444' : t.dueBg, color: t.dueBg === '#EF4444' ? '#fff' : t.dueColor, padding: '2px 7px', borderRadius: 5 } : {}) }}>{t.due}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
