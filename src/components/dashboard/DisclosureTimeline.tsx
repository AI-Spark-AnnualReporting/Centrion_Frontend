import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { reports as reportsApi, meetings as meetingsApi, sarCycles } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { Company } from '@/types/company';
import type { Cycle } from '@/types/cycles';
import { deriveEvents, type TimelineEvent, type ReportListItem } from '@/lib/disclosure';

/**
 * Disclosure Timeline — top-right card on the Home dashboard. Read-only: shows a
 * few recently-filed reports plus upcoming disclosure deadlines and board meetings,
 * assembled entirely from data the app already serves (see lib/disclosure.ts). For
 * a newly-registered company with no activity yet, the derived "next report due"
 * milestones carry a CTA into the relevant report flow. "Full calendar →" opens
 * Board & Meetings, which renders these same events alongside real meetings.
 */

const ACCENT = '#4040C8';

export function DisclosureTimeline({ company }: { company: Company | null }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const companyId = user?.company_id ?? null;
  const fye = company?.fiscal_year_end_month ?? null;

  const [events, setEvents] = useState<TimelineEvent[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const isAdmin = user?.role === 'admin';
    (async () => {
      const [rRes, mRes, cRes] = await Promise.allSettled([
        companyId
          ? reportsApi.list<{ reports?: ReportListItem[] }>(companyId)
          : Promise.resolve({ reports: [] as ReportListItem[] }),
        meetingsApi.list(),
        // SAR cycles are a separate, admin-only backend — best-effort only.
        isAdmin ? sarCycles.list() : Promise.resolve([] as Cycle[]),
      ]);
      if (cancelled) return;
      const reports = rRes.status === 'fulfilled' ? rRes.value?.reports ?? [] : [];
      const meetings = mRes.status === 'fulfilled' ? mRes.value?.meetings ?? [] : [];
      const cycles = cRes.status === 'fulfilled' ? cRes.value ?? [] : [];
      setEvents(deriveEvents({ reports, meetings, company, cycles }));
    })();
    return () => {
      cancelled = true;
    };
    // Re-derive when the company (its fiscal year-end) or user changes — not on the
    // parent's every-poll object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, fye, user?.role]);

  // Compose the compact list: up to 2 most-recent filed reports, then upcoming.
  // Newest/latest date on top, oldest at the bottom.
  const rows = [...(events ?? [])].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 6);

  return (
    <div className="card" style={{ padding: '18px 20px', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#E8A33D', flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', color: '#5A6080' }}>
            Disclosure Timeline
          </span>
        </div>
        <button
          type="button"
          onClick={() => navigate('/meetings')}
          style={{ fontSize: 12, fontWeight: 700, color: ACCENT, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          Full calendar →
        </button>
      </div>
      <div style={{ height: 1, background: '#ECEEF8', margin: '10px 0 2px' }} />

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingLeft: 6, paddingRight: 4 }}>
        {events === null ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '18px 0' }}>
            <div className="proc-ring" style={{ width: 22, height: 22, borderWidth: 2.5, flexShrink: 0 }} />
            <div style={{ fontSize: 12.5, color: '#9BA3C4' }}>Loading your disclosure schedule…</div>
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '22px 4px', fontSize: 12.5, color: '#9BA3C4', lineHeight: 1.6 }}>
            No disclosures scheduled yet. Once your reports and meetings are set up, upcoming
            deadlines and milestones appear here.
          </div>
        ) : (
          rows.map((e, i) => {
            const isLast = i === rows.length - 1;
            const showLine = rows.length > 1;
            return (
            <div
              key={e.id}
              style={{ display: 'flex', gap: 11, alignItems: 'stretch', paddingTop: i ? 0 : 4 }}
            >
              {/* Rail — dot sitting on a connecting spine */}
              <div style={{ position: 'relative', width: 9, flexShrink: 0 }}>
                {showLine && (
                  <div
                    style={{
                      position: 'absolute',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: 2,
                      background: '#E4E8F2',
                      top: i === 0 ? 9 : 0,
                      ...(isLast ? { height: 9 } : { bottom: 0 }),
                    }}
                  />
                )}
                <div
                  style={{ position: 'relative', width: 9, height: 9, borderRadius: '50%', background: e.dotColor, boxShadow: `0 0 0 3px ${e.dotColor}22`, marginTop: 5 }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0, paddingBottom: isLast ? 0 : 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1D2E' }}>{e.title}</span>
                  {e.tone === 'urgent' && (
                    <span style={{ fontSize: 9, fontWeight: 800, color: '#E5484D', background: 'rgba(229,72,77,.12)', padding: '2px 7px', borderRadius: 999, letterSpacing: '.4px' }}>URGENT</span>
                  )}
                  {e.kind === 'filed' && (
                    <span style={{ fontSize: 9, fontWeight: 800, color: '#0F9D6B', background: 'rgba(15,157,107,.12)', padding: '2px 7px', borderRadius: 999, letterSpacing: '.4px' }}>COMPLETED</span>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: '#9BA3C4', marginTop: 2 }}>{e.subtitle}</div>
                {e.cta && (
                  <button
                    type="button"
                    onClick={() => navigate(e.cta!.path)}
                    style={{ marginTop: 7, fontSize: 11, fontWeight: 700, color: ACCENT, background: '#ECEEFF', border: 'none', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}
                  >
                    {e.cta.label} →
                  </button>
                )}
              </div>
            </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default DisclosureTimeline;
