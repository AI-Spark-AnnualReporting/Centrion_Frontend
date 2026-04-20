import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

interface TopbarProps {
  pageName: string;
}

export function Topbar({ pageName }: TopbarProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const displayName = user?.full_name ?? 'Ahmad Al-Rashid';
  const initials = (user?.full_name ?? 'AR')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="topbar">
      <div className="tb-breadcrumb">
        <span className="tb-page">{pageName}</span>
        <span className="tb-sep">·</span>
        <span className="tb-sub">Al-Noor Capital</span>
        <span className="tb-tag">FY 2025</span>
      </div>
      <div className="tb-actions">
        <div className="tb-search">
          <svg viewBox="0 0 12 12" fill="none"><circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.2" /><path d="M8 8l2.5 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
          <input type="text" placeholder="Search anything..." />
        </div>
        <div className="tb-ico" style={{ position: 'relative' }}>
          <svg viewBox="0 0 14 14" fill="none"><path d="M7 1.5c-2.5 0-4 1.8-4 4v2l-1 1.5h10l-1-1.5v-2c0-2.2-1.5-4-4-4zM5.5 10.5C5.5 11.3 6.2 12 7 12s1.5-.7 1.5-1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
          <div className="tb-notif" />
        </div>
        <div className="tb-av">{initials}</div>
        <div>
          <span className="tb-uname">{displayName}</span>
          <span className="tb-urole">{user?.role ? `${user.role} · ${user.email}` : 'ESG Manager · SAMA Licensed'}</span>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          style={{
            marginLeft: 12,
            padding: '6px 12px',
            fontSize: 11,
            fontWeight: 600,
            color: '#5A6080',
            background: 'transparent',
            border: '1px solid #E5E7EF',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          Log out
        </button>
      </div>
    </div>
  );
}
