// The small tag next to a create button: grey "9 of 16 users", amber
// "2 seats left", red "Limit reached (16 / 16)". Next to a red one, a cloud
// admin gets "Request more"; everyone else who isn't an admin gets
// "Ask your admin" (only admins can ask Centriyon).

import { useState } from 'react';
import { license } from '@/lib/api';
import type { LicenseRoom } from './useLicenseRoom';

const TONE_STYLE = {
  ok: { color: '#5A6080', background: '#F3F4F8' },
  low: { color: '#92400E', background: 'rgba(245,158,11,.14)' },
  full: { color: '#B91C1C', background: 'rgba(239,68,68,.10)' },
} as const;

export function LimitHint({ room }: { room: LicenseRoom }) {
  const [sent, setSent] = useState('');
  if (!room.tone || !room.hint) return null;

  const requestMore = async () => {
    try {
      await license.requestUpgrade({ note: `Limit reached: ${room.hint}.` });
      setSent('Request sent');
    } catch (err) {
      setSent(err instanceof Error ? err.message : 'Could not send');
    }
  };

  const linkStyle = { marginLeft: 6, textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit' } as const;

  return (
    <span
      title={room.reason || undefined}
      style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '4px 10px', whiteSpace: 'nowrap', ...TONE_STYLE[room.tone] }}
    >
      {room.hint}
      {room.tone === 'full' && (
        sent ? <span style={{ marginLeft: 6 }}>· {sent}</span>
          : room.canRequest ? <button type="button" style={linkStyle} onClick={requestMore}>Request more</button>
          : room.askAdmin ? <span style={{ marginLeft: 6 }}>· Ask your admin</span>
          : null
      )}
    </span>
  );
}
