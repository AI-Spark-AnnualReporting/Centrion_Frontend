import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { FloatingChatbot } from '../shared/FloatingChatbot';

const PAGE_NAMES: Record<string, string> = {
  '/dashboard': 'Command Center',
  '/reports': 'Reports',
  '/kpi': 'KPI Normalizer',
  '/compliance': 'Compliance',
  '/ai': 'IR Copilot',
  '/meetings': 'Board & Meetings',
  '/comms': 'Comms Hub',
  '/stakeholders': 'Boards & Investors',
  '/docs': 'Document Bank',
  '/questions': 'Questions Bank',
  '/profile': 'Profile',
};

export function AppLayout() {
  const location = useLocation();
  const pageName = PAGE_NAMES[location.pathname] || 'Command Center';

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main">
        <Topbar pageName={pageName} />
        <div className="content">
          <Outlet />
        </div>
      </div>
      <FloatingChatbot />
    </div>
  );
}
