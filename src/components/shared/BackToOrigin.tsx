import { Link, useLocation, useSearchParams } from 'react-router-dom';

/* "Back to where you came from", for pages that don't know they were arrived at.

   A thread's report card links out to a module page — the outline, the
   assembled report, an ESG coverage page. Each of those has its own idea of
   "back" (its list, its stepper), none of which is the conversation the reader
   was actually in. Rather than teach seven pages about threads, the linker
   attaches the way back to the navigation and this bar renders above whatever
   page it lands on.

   Two ways in, because there are two kinds of linker:

   - Router state, for links inside this app. It lives on the history entry, so
     it survives a refresh and disappears the moment the reader navigates on
     under their own steam — which is exactly when the bar stops being true.
   - `?back=`, for the SAR app, whose links cross an origin. Nothing travels
     between two websites on its own, so the return address rides in the URL. */

interface OriginState {
  backTo?: string;
  backLabel?: string;
}

// The one other app allowed to send someone here with a way back. An arbitrary
// URL in `?back=` would make this bar a phishing link wearing our chrome: it
// reads "Back to the conversation" and goes wherever the link author chose.
const SAR_ORIGIN = (() => {
  try {
    return new URL(import.meta.env.VITE_SAR_APP_URL ?? 'http://localhost:3000').origin;
  } catch {
    return null;
  }
})();

function isTrustedExternal(url: string): boolean {
  if (!SAR_ORIGIN) return false;
  try {
    return new URL(url).origin === SAR_ORIGIN;
  } catch {
    return false;
  }
}

const ICON_BACK = (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M7.5 2.5l-3 3.5 3 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  marginBottom: 12,
  padding: '8px 14px',
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 700,
  textDecoration: 'none',
  color: '#4040C8',
  background: 'rgba(64,64,200,.06)',
  border: '1px solid rgba(64,64,200,.25)',
};

export function BackToOrigin() {
  const { state } = useLocation();
  const [params] = useSearchParams();

  const fromState = (state as OriginState | null)?.backTo;
  const label = (state as OriginState | null)?.backLabel ?? 'Back to the conversation';

  // In-app path: anything starting with a single slash. "//evil.com" is an
  // absolute URL as far as a browser is concerned, so it isn't one.
  const inApp = [fromState, params.get('back')].find(
    (v): v is string => !!v && v.startsWith('/') && !v.startsWith('//'),
  );
  if (inApp) {
    return (
      <Link to={inApp} style={STYLE}>
        {ICON_BACK}
        {label}
      </Link>
    );
  }

  const external = params.get('back');
  if (external && isTrustedExternal(external)) {
    return (
      <a href={external} style={STYLE}>
        {ICON_BACK}
        {label}
      </a>
    );
  }

  return null;
}
