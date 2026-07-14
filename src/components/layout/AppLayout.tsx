import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { FloatingChatbot } from '../shared/FloatingChatbot';

const PAGE_NAMES: Record<string, string> = {
  '/dashboard': 'Command Center',
  '/reports': 'Reports',
  '/reports/quarterly': 'Quarterly Reports',
  '/kpi': 'KPI Normalizer',
  '/compliance': 'Compliance',
  '/ai': 'AI Copilot',
  '/meetings': 'Board & Meetings',
  '/comms': 'Comms Hub',
  '/stakeholders': 'Leadership',
  '/ir-calendar': 'IR Calendar',
  '/docs': 'Document Bank',
  '/questions': 'Questions Bank',
  '/profile': 'Profile',
  '/admin-console': 'Admin Console',
  '/admin-console/users': 'Users & Roles',
  '/admin-console/departments': 'Departments',
  '/annual-report': 'Annual Report',
  '/annual-report/cycles/new': 'New Cycle',
};

// Centered spinner shown while a lazily-loaded page's chunk downloads.
function PageLoader() {
  return (
    <div
      style={{
        minHeight: 360,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
      }}
    >
      <div className="proc-ring" style={{ width: 40, height: 40, borderWidth: 3 }} />
      <div style={{ fontSize: 12, color: '#9BA3C4', fontWeight: 600 }}>Loading…</div>
    </div>
  );
}

export function AppLayout() {
  const location = useLocation();
  const pageName =
    PAGE_NAMES[location.pathname] ??
    (location.pathname.startsWith('/quarterly-report') ? 'Quarterly Report' :location.pathname.startsWith('/annual-report') ? 'Annual Report' : 'Command Center');

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main">
        <Topbar pageName={pageName} />
        <div className="content">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </div>
      </div>
      {/* Home has its own Ask Copilot card, so hide the floating chat there. */}
      {location.pathname !== '/dashboard' && <FloatingChatbot />}
    </div>
  );
}
