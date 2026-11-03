// The small tag next to a create button: grey "9 of 16 users", amber
// "2 seats left", red "Limit reached (16 / 16)". Next to a red one, a cloud
// admin gets "Request more"; everyone else who isn't an admin gets
// "Ask your admin" (only admins can ask Centriyon).

import { useNavigate } from 'react-router-dom';
import type { LicenseRoom } from './useLicenseRoom';

const TONE_STYLE = {
  ok: { color: '#5A6080', background: '#F3F4F8' },
  low: { color: '#92400E', background: 'rgba(245,158,11,.14)' },
  full: { color: '#B91C1C', background: 'rgba(239,68,68,.10)' },
} as const;

// "Request more": opens the Request upgrade popup on the Admin Console, where
// the admin picks what they need and confirms it.
function RequestMoreLink({ style }: { style: React.CSSProperties }) {
  const navigate = useNavigate();
  return (
    <button type="button" style={style} onClick={() => navigate('/admin-console#request-upgrade')}>
      Request more
    </button>
  );
}

export function LimitHint({ room }: { room: LicenseRoom }) {
  if (!room.tone || !room.hint) return null;

  const linkStyle = { marginLeft: 6, textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit' } as const;

  return (
    <span
      title={room.reason || undefined}
      style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '4px 10px', whiteSpace: 'nowrap', ...TONE_STYLE[room.tone] }}
    >
      {room.hint}
      {room.tone === 'full' && (
        room.requestSentOn && !room.askAdmin ? <span style={{ marginLeft: 6 }}>· Request sent {room.requestSentOn}</span>
          : room.canRequest ? <RequestMoreLink style={linkStyle} />
          : room.askAdmin ? <span style={{ marginLeft: 6 }}>· Ask your admin</span>
          : null
      )}
    </span>
  );
}
