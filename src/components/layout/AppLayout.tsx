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
  '/docs': 'Document Bank',
  '/questions': 'Questions Bank',
  '/profile': 'User Profile',
  '/profile/company': 'Company Profile',
  '/admin-console': 'Admin Console',
  '/admin-console/users': 'Users & Roles',
  '/admin-console/departments': 'Departments',
  '/annual-report': 'Annual Report',
  '/board-report': 'Board Report',
  '/annual-report/cycles/new': 'New Cycle',
  '/earnings/setup': 'Earnings Report',
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
  ['/earnings', 'Earnings Report'],
  ['/communications', 'Communication Hub'],
  ['/compliance', 'Compliance Validation'],
];

// The quarterly report-building flow. These screens are full-height layouts that
// end in their own footer bar — exactly where the floating launcher sits — and
// /reports/processing is a full-screen progress overlay the launcher floats on
// top of. Hiding it here also un-raises the compliance dock and lets .content
// reclaim the clearance it reserves (see .content--flush in index.css).
//
// /reports/processing is shared with the ESG run, not quarterly-only. That's
// intentional: a full-screen progress page is the last place the launcher
// belongs, and route state would be lost on refresh anyway.
const REPORT_FLOW_EXACT = ['/reports/processing'];
const REPORT_FLOW_PREFIXES = ['/quarterly-report'];

// Exact-or-segment match, NOT a bare startsWith, so a future sibling route like
// /quarterly-reports-archive can't accidentally match.
function isReportFlowRoute(pathname: string): boolean {
  return (
    REPORT_FLOW_EXACT.includes(pathname) ||
    REPORT_FLOW_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  );
}

export function AppLayout() {
  const location = useLocation();
  const pageName =
    PAGE_NAMES[location.pathname] ??
    PAGE_NAME_PREFIXES.find(([prefix]) => location.pathname.startsWith(prefix))?.[1] ??
    'Command Center';

  // The board report builder fills the viewport and scrolls inside itself, so a
  // launcher floating over its footer controls is in the way, not to hand.
  const boardBuilder = location.pathname.startsWith('/board-report');
  const reportFlow = isReportFlowRoute(location.pathname);
  // The AI Copilot page IS the chat the launcher opens — showing it there would
  // just relaunch the page you're already on. The page also runs full-height,
  // same as the report flow, so it needs the launcher's clearance freed up too.
  const aiPage = location.pathname === '/ai';
  const chatbotShown =
    location.pathname !== '/dashboard' && !boardBuilder && !reportFlow && !aiPage;

  return (
    // Wraps the whole authenticated shell so a compliance run stays watched
    // wherever the user goes next — and unmounts with it on logout, taking its
    // timers and its knowledge of another company's runs with it.
    <ComplianceRunsProvider>
      <div className="app-shell">
        <Sidebar />
        <div className="main">
          <Topbar pageName={pageName} />
          {/* `no-fab` drops the bottom padding that exists only to clear the
              launcher — dead space on a page that doesn't scroll. */}
          <div
            className={
              boardBuilder || aiPage
                ? 'content no-fab'
                : reportFlow
                  ? 'content content--flush'
                  : 'content'
            }
          >
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </div>
        </div>
        {/* Home has its own Ask Copilot card, and the report-building flow needs
            the corner for its own footer — hide the floating chat on both. */}
        {chatbotShown && <FloatingChatbot />}
        {/* Shown everywhere, including the dashboard: the point of the dock is
            that it survives going off to do something else. */}
        <ComplianceRunsDock raised={chatbotShown} />
      </div>
    </ComplianceRunsProvider>
  );
}
