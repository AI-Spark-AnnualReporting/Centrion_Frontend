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
  '/docs': 'Document Bank',
  '/questions': 'Questions Bank',
  '/profile': 'Profile',
  '/admin-console': 'Admin Console',
  '/admin-console/users': 'Users & Roles',
  '/admin-console/departments': 'Departments',
  '/annual-report': 'Annual Report',
  '/annual-report/cycles/new': 'New Cycle',
};

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
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full text-[13px] text-[#5A6080]">
                Loading…
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </div>
      </div>
      <FloatingChatbot />
    </div>
  );
}
