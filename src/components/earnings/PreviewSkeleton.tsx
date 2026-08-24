import { BORDER_SOFT, FAINT } from './tokens';

// What the Preview screen shows while its two fetches are in flight.
//
// It used to show a small centred spinner in an otherwise empty page, which on a
// full-width screen reads as blank — the loader hands over and for a second or two
// there is simply nothing there. This draws the page's actual structure instead:
// the rail on the left, the section card on the right, at their real sizes, so the
// shape arrives immediately and only the values are missing.
//
// Deliberately still. A shimmer would animate the one part of the screen the user
// cannot act on, and a moving placeholder over financial data reads as something
// happening to the numbers rather than as waiting.

const BAR = { background: '#EEF0F7', borderRadius: 4, height: 9 } as const;

function Bar({ width }: { width: number | string }) {
  return <div style={{ ...BAR, width }} aria-hidden />;
}

export function PreviewSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <div
      // Matches the loaded layout exactly, so nothing shifts when data lands.
      style={{
        flex: 1,
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: '280px 1fr',
        gap: 16,
        padding: '0 28px 16px',
        alignItems: 'stretch',
      }}
      // One label for the whole frame: a screen reader should hear "loading", not
      // a list of empty rows.
      role="status"
      aria-label="Loading the report preview"
    >
      <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 14px',
            borderBottom: `1px solid ${BORDER_SOFT}`,
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: '.6px',
            textTransform: 'uppercase',
            color: FAINT,
          }}
        >
          <span>Sections</span>
          <Bar width={26} />
        </div>
        <div style={{ flex: 1 }}>
          {Array.from({ length: rows }, (_, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '11px 14px',
                borderBottom: `1px solid ${BORDER_SOFT}`,
              }}
            >
              <div style={{ ...BAR, width: 10, height: 10, borderRadius: '50%' }} aria-hidden />
              {/* Varied widths so it reads as a list of names rather than a bar chart. */}
              <Bar width={`${52 + ((i * 13) % 34)}%`} />
              <span style={{ marginLeft: 'auto' }}>
                <Bar width={16} />
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: '24px 28px', alignSelf: 'start', width: '100%' }}>
        <Bar width={220} />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            margin: '22px 0 12px',
            paddingBottom: 10,
            borderBottom: `1px solid ${BORDER_SOFT}`,
          }}
        >
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.5px', color: FAINT }}>LINE</span>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.5px', color: FAINT }}>VALUE</span>
        </div>
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '13px 0',
              borderBottom: `1px solid ${BORDER_SOFT}`,
            }}
          >
            <Bar width={`${34 + ((i * 17) % 30)}%`} />
            <Bar width={72} />
          </div>
        ))}
      </div>
    </div>
  );
}
