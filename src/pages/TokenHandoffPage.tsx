import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getRefreshToken, getToken, parseJwtPayload, setAuthToken, setRefreshToken } from '@/lib/api';
import { Spinner } from '@/components/shared/Spinner';

/* Coming back FROM the SAR app. `next` is where they were going — a report card
   over there links straight at a report over here.

   New SAR builds send no token: this browser already has its own Centriton
   session. Older SAR builds still send `?token=` — see keepOrReplaceSession.
   The URL is replaced at once (`replace`) so a copied link, a Referer header or
   the back button can't carry a token further. */

/** The user id (`sub`) inside an access token, or null. */
function userIdOf(token: string | null): string | null {
  if (!token) return null;
  return parseJwtPayload<{ sub?: string }>(token)?.sub ?? null;
}

/** Store a handed-over access token, unless this browser already has a full
 *  session (with a refresh token) for the same person — that one is better: it
 *  renews itself, a bare handed-over token dies in 15 minutes. A token for a
 *  DIFFERENT person replaces everything, refresh token included, so a leftover
 *  refresh token can never be paired with someone else's access token. */
function keepOrReplaceSession(handedOver: string): void {
  const handedOverUserId = userIdOf(handedOver);
  const samePerson = handedOverUserId !== null && handedOverUserId === userIdOf(getToken());
  if (samePerson && getRefreshToken()) return;
  setAuthToken(handedOver);
  if (!samePerson) setRefreshToken(null);
}

// Only an in-app path is followed. An absolute URL — or "//evil.com", which a
// browser reads as one — would turn this page into an open redirect that
// arrives with a valid token in hand.
export function safePath(next: string | null): string {
  if (!next || !next.startsWith('/')) return '/';
  if (next.startsWith('//') || next.startsWith('/\\')) return '/';
  return next;
}

export default function TokenHandoffPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  // StrictMode mounts effects twice in dev; the token is consumed once.
  const handled = useRef(false);

  const token = params.get('token');
  const next = safePath(params.get('next'));

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    if (token) keepOrReplaceSession(token);
    // No token: go where they were heading if this browser is already signed
    // in; otherwise the login page sorts it out (and returns them afterwards).
    const signedIn = token !== null || getToken() !== null;
    navigate(signedIn ? next : '/login', { replace: true });
  }, [token, next, navigate]);

  return <Spinner pad={120} />;
}
