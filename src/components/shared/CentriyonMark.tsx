// The Centriyon wordmark lockup, on a light ground.
//
// The sidebar draws this against its own dark chrome via CSS classes; here it
// is a self-contained component because the surfaces that need it are outside
// the app shell — the certificate, and the public verification page an
// unauthenticated visitor lands on. Those two are the app's face to auditors
// and regulators, so the mark has to stand on its own.

const PRIMARY = '#4040C8';

export function CentriyonMark({
  /** The strapline under the wordmark. Omit for a bare logo. */
  tagline = 'COMPLIANCE ENGINE',
  size = 26,
}: {
  tagline?: string | null;
  size?: number;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.27,
          background: PRIMARY,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <svg viewBox="0 0 14 14" fill="none" width={size * 0.54} height={size * 0.54} aria-hidden>
          <rect x=".5" y=".5" width="5.5" height="5.5" rx="1" fill="white" />
          <rect x="8" y=".5" width="5.5" height="5.5" rx="1" fill="white" opacity=".4" />
          <rect x=".5" y="8" width="5.5" height="5.5" rx="1" fill="white" opacity=".4" />
          <rect x="8" y="8" width="5.5" height="5.5" rx="1" fill="white" />
        </svg>
      </div>
      <div style={{ lineHeight: 1.15 }}>
        <div style={{ fontSize: size * 0.54, fontWeight: 800, color: '#1A1D2E' }}>Centriyon</div>
        {tagline && (
          <div style={{ fontSize: 8, fontWeight: 700, color: '#9BA3C4', letterSpacing: '1.2px' }}>
            {tagline}
          </div>
        )}
      </div>
    </div>
  );
}

export default CentriyonMark;
