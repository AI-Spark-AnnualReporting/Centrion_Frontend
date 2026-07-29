import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { NotificationBell } from './NotificationBell';

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
        {user?.company_name && (
          <>
            <span className="tb-sep">·</span>
            <span className="tb-sub">{user.company_name}</span>
          </>
        )}
      </div>
      <div className="tb-actions">
        <NotificationBell />
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
            padding: '7px 13px',
            fontSize: 14,
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
