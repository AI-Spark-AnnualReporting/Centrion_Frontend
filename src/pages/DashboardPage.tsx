import { useEffect, useState } from 'react';
import { DashboardESG } from '@/components/dashboard/DashboardESG';
import { DashboardBoard } from '@/components/dashboard/DashboardBoard';
import { DashboardWelcome } from '@/components/dashboard/DashboardWelcome';
import { ESGModal } from '@/components/shared/ESGModal';
import ScheduleMeetingModal from '@/components/ScheduleMeetingModal';
import { reports as reportsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<'esg' | 'brd'>('esg');
  const [esgModalOpen, setEsgModalOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  // Bumped on every successful schedule so the Board dashboard re-fetches its
  // meetings list and the new meeting shows up in the cards immediately.
  const [meetingsRefresh, setMeetingsRefresh] = useState(0);
  const { user } = useAuth();
  const company = user?.company_name ?? 'Your company';
  const companyId = user?.company_id ?? null;

  // First-run gate: while we don't know yet it's null; false → no reports →
  // show the welcome screen instead of an empty dashboard.
  const [hasReports, setHasReports] = useState<boolean | null>(null);
  useEffect(() => {
    if (!companyId) {
      setHasReports(false);
      return;
    }
    let cancelled = false;
    reportsApi
      .list<{ reports?: unknown[] }>(companyId)
      .then((data) => {
        if (!cancelled) setHasReports((data?.reports ?? []).length > 0);
      })
      // On error, fall back to the normal dashboard rather than the welcome.
      .catch(() => {
        if (!cancelled) setHasReports(true);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  if (hasReports === null) {
    return (
      <div style={{ padding: 48, textAlign: 'center', fontSize: 13, color: '#5A6080' }}>Loading…</div>
    );
  }

  if (!hasReports) {
    return <DashboardWelcome company={company} />;
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1A1D2E', letterSpacing: '-.5px', marginBottom: 3 }}>Command Center</h2>
          <p style={{ fontSize: 12, color: '#5A6080' }}>{company} &nbsp;·&nbsp; ESG &amp; IR Intelligence Overview</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="tabs" style={{ marginBottom: 0 }}>
            <button className={`tab ${activeTab === 'esg' ? 'act' : ''}`} onClick={() => setActiveTab('esg')}>ESG</button>
            {/* Financial tab hidden until the financial dashboard is wired up. */}
            <button className={`tab ${activeTab === 'brd' ? 'act' : ''}`} onClick={() => setActiveTab('brd')}>Board</button>
          </div>
          {activeTab === 'brd' ? (
            <button
              className="btn bp bsm"
              onClick={() => setScheduleOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M5.5 1v9M1 5.5h9" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Schedule Meeting
            </button>
          ) : (
            <button
              className="btn bp bsm"
              onClick={() => setEsgModalOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M5.5 1v9M1 5.5h9" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Generate Report
            </button>
          )}
        </div>
      </div>

      {activeTab === 'esg' && <DashboardESG />}
      {activeTab === 'brd' && <DashboardBoard refreshKey={meetingsRefresh} />}

      {esgModalOpen && <ESGModal onClose={() => setEsgModalOpen(false)} />}

      {scheduleOpen && (
        <ScheduleMeetingModal
          companyId={companyId}
          companyName={company}
          onClose={() => setScheduleOpen(false)}
          onCreated={() => setMeetingsRefresh((n) => n + 1)}
        />
      )}
    </div>
  );
}
