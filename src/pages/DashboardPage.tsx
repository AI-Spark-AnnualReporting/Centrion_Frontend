import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { DashboardESG } from '@/components/dashboard/DashboardESG';
import { DashboardBoard } from '@/components/dashboard/DashboardBoard';
import { DashboardWelcome } from '@/components/dashboard/DashboardWelcome';
import { DashboardWorkspace } from '@/components/dashboard/DashboardWorkspace';
import { ESGModal } from '@/components/shared/ESGModal';
import ScheduleMeetingModal from '@/components/ScheduleMeetingModal';
import { reports as reportsApi, documents as documentsApi, companies as companiesApi } from '@/lib/api';
import type { Company } from '@/types/company';
import { useAuth } from '@/context/AuthContext';

export default function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  // Admins default to the Home (workspace) tab; other roles (e.g. ir) keep ESG.
  const [activeTab, setActiveTab] = useState<'home' | 'esg' | 'brd'>(isAdmin ? 'home' : 'esg');
  const [esgModalOpen, setEsgModalOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  // Bumped on every successful schedule so the Board dashboard re-fetches its
  // meetings list and the new meeting shows up in the cards immediately.
  const [meetingsRefresh, setMeetingsRefresh] = useState(0);
  const company = user?.company_name ?? 'Your company';
  const companyId = user?.company_id ?? null;
  const location = useLocation();
  // Set when the user just finished onboarding having uploaded docs — shows the
  // workspace dashboard immediately, before the upload pipeline has inserted the
  // documents rows that the persistent `hasDocs` check relies on. Captured ONCE:
  // ProtectedRoute redirects onboarding→dashboard with no router state, so we
  // also honour a sessionStorage flag set during onboarding (and clear it).
  const [justUploaded] = useState(() => {
    const fromState = Boolean((location.state as { justUploaded?: boolean } | null)?.justUploaded);
    const fromSession = sessionStorage.getItem('centriyon:freshUpload') === '1';
    if (fromSession) sessionStorage.removeItem('centriyon:freshUpload');
    return fromState || fromSession;
  });

  // First-run gate (null until known): reports drive the ESG Command Center;
  // otherwise uploaded docs / extracted report-style drive the personal workspace
  // dashboard, else the welcome.
  const [gate, setGate] = useState<{ hasReports: boolean; hasDocs: boolean; companyData: Company | null } | null>(null);
  useEffect(() => {
    if (!companyId) {
      setGate({ hasReports: false, hasDocs: false, companyData: null });
      return;
    }
    let cancelled = false;
    Promise.allSettled([
      reportsApi.list<{ reports?: unknown[] }>(companyId),
      documentsApi.list<{ documents?: unknown[] }>(companyId),
      companiesApi.getMyCompany(),
    ]).then(([r, d, c]) => {
      if (cancelled) return;
      // On a reports-list error, fall back to the normal dashboard (not welcome).
      const hasReports = r.status === 'fulfilled' ? (r.value?.reports ?? []).length > 0 : true;
      const hasDocs = d.status === 'fulfilled' ? (d.value?.documents ?? []).length > 0 : false;
      const companyData = c.status === 'fulfilled' ? c.value : null;
      setGate({ hasReports, hasDocs, companyData });
    });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  if (gate === null) {
    return (
      <div style={{ padding: 48, textAlign: 'center', fontSize: 13, color: '#5A6080' }}>Loading…</div>
    );
  }

  // Display name: prefer the fetched company's real name over the (often empty) JWT
  // company_name, which otherwise falls back to "Your company".
  const displayName = gate.companyData?.name || company;

  if (!gate.hasReports) {
    // No reports yet: personal workspace dashboard once docs were uploaded (just
    // now or previously) or report-style was extracted; otherwise the welcome.
    const hasStyle = Boolean(gate.companyData?.report_tone);
    return justUploaded || gate.hasDocs || hasStyle
      ? <DashboardWorkspace company={gate.companyData} companyName={displayName} />
      : <DashboardWelcome company={displayName} />;
  }

  return (
    <div>
      {/* Header — tab switcher on the left (matches the design's top-left placement; the
          page title/company line already live in the topbar breadcrumb + welcome banner). */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div className="tabs" style={{ marginBottom: 0 }}>
          {/* Home (workspace) tab — admin only, sits to the left of ESG. */}
          {isAdmin && <button className={`tab ${activeTab === 'home' ? 'act' : ''}`} onClick={() => setActiveTab('home')}>Home</button>}
          <button className={`tab ${activeTab === 'esg' ? 'act' : ''}`} onClick={() => setActiveTab('esg')}>ESG</button>
          {/* Financial tab hidden until the financial dashboard is wired up. */}
          <button className={`tab ${activeTab === 'brd' ? 'act' : ''}`} onClick={() => setActiveTab('brd')}>Board</button>
        </div>
        <div>
          {/* ESG → Generate Report, Board → Schedule Meeting, Home → nothing. */}
          {activeTab === 'brd' && (
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
          )}
          {activeTab === 'esg' && (
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

      {isAdmin && activeTab === 'home' && <DashboardWorkspace company={gate.companyData} companyName={displayName} />}
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
