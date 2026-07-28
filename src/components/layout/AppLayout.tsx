import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { FloatingChatbot } from '../shared/FloatingChatbot';
import { ComplianceRunsDock } from '../shared/ComplianceRunsDock';
import { ComplianceRunsProvider } from '@/context/ComplianceRunsContext';

const PAGE_NAMES: Record<string, string> = {
  '/dashboard': 'Command Center',
  '/reports': 'Reports',
  '/reports/quarterly': 'Quarterly Reports',
  '/kpi': 'KPI Normalizer',
  '/compliance': 'Compliance Validation',
  '/ai': 'AI Copilot',
  '/meetings': 'Board & Meetings',
  '/comms': 'Communication Hub',
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

// Routes with ids or sub-paths in them can't be matched exactly, so they fall
// back to a prefix. Longest first: nothing here currently overlaps, but a
// shorter prefix added later would otherwise silently shadow a longer one.
const PAGE_NAME_PREFIXES: [string, string][] = [
  ['/quarterly-report', 'Quarterly Report'],
  ['/annual-report', 'Annual Report'],
  ['/communications', 'Communication Hub'],
  ['/compliance', 'Compliance Validation'],
];

export function AppLayout() {
  const location = useLocation();
  const pageName =
    PAGE_NAMES[location.pathname] ??
    PAGE_NAME_PREFIXES.find(([prefix]) => location.pathname.startsWith(prefix))?.[1] ??
    'Command Center';

  const chatbotShown = location.pathname !== '/dashboard';

  return (
    // Wraps the whole authenticated shell so a compliance run stays watched
    // wherever the user goes next — and unmounts with it on logout, taking its
    // timers and its knowledge of another company's runs with it.
    <ComplianceRunsProvider>
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
        {chatbotShown && <FloatingChatbot />}
        {/* Shown everywhere, including the dashboard: the point of the dock is
            that it survives going off to do something else. */}
        <ComplianceRunsDock raised={chatbotShown} />
      </div>
    </ComplianceRunsProvider>
  );
}
