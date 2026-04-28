import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

const NAV_ITEMS = [
  {
    section: 'IR System',
    items: [
      { key: 'dashboard', label: 'Command Center', path: '/dashboard', icon: 'grid', badge: null },
      { key: 'reports', label: 'Reports', path: '/reports', icon: 'doc', badge: null },
      { key: 'kpi', label: 'KPI Normalizer', path: '/kpi', icon: 'chart', badge: { text: 'New', cls: 'gn' } },
      // Hidden until the Compliance feature is wired to the backend.
      // { key: 'compliance', label: 'Compliance', path: '/compliance', icon: 'shield', badge: { text: '!', cls: 'rd' } },
      { key: 'ai', label: 'IR Copilot', path: '/ai', icon: 'chat', badge: { text: 'AI', cls: 'tl' } },
    ],
  },
  {
    section: 'Stakeholders',
    items: [
      { key: 'meetings', label: 'Board & Meetings', path: '/meetings', icon: 'cal', badge: { text: '2', cls: 'or' } },
      // Hidden until Comms Hub is wired to the backend.
      // { key: 'comms', label: 'Comms Hub', path: '/comms', icon: 'mail', badge: { text: 'Unread', cls: 'rd' } },
      { key: 'stakeholders', label: 'Boards & Investors', path: '/stakeholders', icon: 'people', badge: { text: 'New', cls: 'gn' } },
    ],
  },
  {
    section: 'Workspace',
    items: [
      { key: 'docs', label: 'Document Bank', path: '/docs', icon: 'file', badge: null },
      { key: 'questions', label: 'Questions Bank', path: '/questions', icon: 'question', badge: { text: '5', cls: 'am' } },
      { key: 'profile', label: 'Profile', path: '/profile', icon: 'user', badge: null },
    ],
  },
];

const icons: Record<string, JSX.Element> = {
  grid: <svg viewBox="0 0 13 13" fill="none"><rect x=".5" y=".5" width="5" height="5" rx=".7" stroke="currentColor" strokeWidth="1.2"/><rect x="7.5" y=".5" width="5" height="5" rx=".7" stroke="currentColor" strokeWidth="1.2"/><rect x=".5" y="7.5" width="5" height="5" rx=".7" stroke="currentColor" strokeWidth="1.2"/><rect x="7.5" y="7.5" width="5" height="5" rx=".7" stroke="currentColor" strokeWidth="1.2"/></svg>,
  doc: <svg viewBox="0 0 13 13" fill="none"><rect x="1" y="1" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M3.5 5h6M3.5 7.5h6M3.5 10h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>,
  chart: <svg viewBox="0 0 13 13" fill="none"><path d="M1.5 9.5l3-3.5 2 2.5L9 5l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><rect x="1" y="1" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2"/></svg>,
  shield: <svg viewBox="0 0 13 13" fill="none"><path d="M6.5 1.5L2 3.5v3.2c0 2.8 2 5 4.5 5.8 2.5-.8 4.5-3 4.5-5.8V3.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>,
  chat: <svg viewBox="0 0 13 13" fill="none"><path d="M6.5 1C3.5 1 1 3.2 1 5.9c0 1.4.6 2.6 1.6 3.5L2 11l2.8-1.3c.6.2 1.1.3 1.7.3 3 0 5.5-2.2 5.5-4.9S9.5 1 6.5 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>,
  cal: <svg viewBox="0 0 13 13" fill="none"><rect x="1" y="2" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M4 1v2M9 1v2M1 5.5h11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  mail: <svg viewBox="0 0 13 13" fill="none"><path d="M2 2h9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4L2 11.5V3a1 1 0 0 1 0-.9z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>,
  people: <svg viewBox="0 0 13 13" fill="none"><circle cx="4" cy="4" r="2" stroke="currentColor" strokeWidth="1.2"/><circle cx="9" cy="4" r="2" stroke="currentColor" strokeWidth="1.2"/><path d="M1 11c0-1.7 1.3-3 3-3s3 1.3 3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M7.5 8.2c.4-.1.9-.2 1.5-.2 1.7 0 3 1.3 3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  file: <svg viewBox="0 0 13 13" fill="none"><path d="M2 1.5h6l3 3V12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.2"/><path d="M8 1.5v3h3" stroke="currentColor" strokeWidth="1.2"/></svg>,
  question: <svg viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.2"/><path d="M5 5.5C5 4.7 5.7 4 6.5 4S8 4.7 8 5.5c0 .6-.3 1.1-.8 1.4L7 7.5M7 9.5v.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  user: <svg viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="4.5" r="2.5" stroke="currentColor" strokeWidth="1.2"/><path d="M1.5 12c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
};

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const handleNav = (path: string) => {
    navigate(path);
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const displayName = user?.full_name ?? 'Ahmad Al-Rashid';
  const displayRole = user?.role ?? 'ESG Manager';
  const initials = (user?.full_name ?? 'AR')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <nav className="sb">
      <div className="sb-header">
        <div className="sb-logo">
          <div className="sb-lmark">
            <svg viewBox="0 0 14 14" fill="none" width="14" height="14">
              <rect x=".5" y=".5" width="5.5" height="5.5" rx="1" fill="white" />
              <rect x="8" y=".5" width="5.5" height="5.5" rx="1" fill="white" opacity=".4" />
              <rect x=".5" y="8" width="5.5" height="5.5" rx="1" fill="white" opacity=".4" />
              <rect x="8" y="8" width="5.5" height="5.5" rx="1" fill="white" />
            </svg>
          </div>
          <div>
            <div className="sb-lname">Centriyon</div>
            <div className="sb-lsub">Investor Portal</div>
          </div>
        </div>
      </div>
      <div className="sb-search">
        <svg viewBox="0 0 12 12" fill="none"><circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.2" /><path d="M8 8l2.5 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
        <input type="text" placeholder="Search..." />
      </div>
      <div style={{ height: 10 }} />
      {NAV_ITEMS.map((section) => (
        <div key={section.section}>
          <div className="sb-sec">{section.section}</div>
          {section.items.map((item) => (
            <button
              key={item.key}
              className={`sb-item ${location.pathname === item.path ? 'act' : ''}`}
              onClick={() => handleNav(item.path)}
            >
              {icons[item.icon]}
              {item.label}
              {item.badge && <span className={`sb-badge ${item.badge.cls}`}>{item.badge.text}</span>}
            </button>
          ))}
          {section.section !== 'Workspace' && <div className="sb-div" />}
        </div>
      ))}
      <div style={{ flex: 1 }} />
      <div className="sb-div" />
      <div className="sb-user">
        <div className="sb-uav">{initials}</div>
        <div>
          <div className="sb-uname">{displayName}</div>
          <div className="sb-urole">{displayRole}</div>
        </div>
        <button className="sb-logout" onClick={handleLogout} type="button" aria-label="Log out" title="Log out">
          <svg viewBox="0 0 13 13" fill="none"><path d="M5 11H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h2M8.5 8.5l3-2.5-3-2.5M11.5 6H5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
    </nav>
  );
}
