import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { setAuthToken } from '@/lib/api';
import { Spinner } from '@/components/shared/Spinner';

/* Session handoff FROM the other app.

   The reverse of redirectToApp() in @/lib/appRouting: the SAR app sends a user
   here with the JWT they already hold, so they arrive signed in instead of at
   a login form. `next` carries where they were actually going — a report card
   over there links straight at a report over here.

   No API call: the token IS the session, exactly as it is after login. It's
   swapped out of the URL immediately (`replace`) so a copied link, a Referer
   header, or the back button can't carry it further. */

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
    if (token) setAuthToken(token);
    // No token means no session to hand over — the login page is where that
    // gets sorted out, and it will bounce them back if they already have one.
    navigate(token ? next : '/login', { replace: true });
  }, [token, next, navigate]);

  return <Spinner pad={120} />;
}
