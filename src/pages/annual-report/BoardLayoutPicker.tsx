// "Choose layout" for the board profiles section — the same shape as the cover
// design picker: a grid of thumbnails, the current one ringed, Apply saves.
//
// The thumbnails are drawn from plain divs rather than screenshots (as MiniCover
// does in CoverTemplatePicker) — they only have to be different enough to tell
// the four arrangements apart at a glance.

import { useState } from 'react';
import type { BoardSectionLayout } from '@/types/board';
import { ACCENT, BORDER, BORDER_SOFT, FAINT, INK, MUTED, RED } from './board-ui';

const OPTIONS: { key: BoardSectionLayout; label: string; note: string }[] = [
  { key: 'table', label: 'Table', note: 'One row per director. Most compact.' },
  { key: 'cards_grid', label: 'Cards · grid', note: 'Photo on top, two or three across.' },
  { key: 'cards_band', label: 'Cards · bands', note: 'One per row, text in two columns.' },
  { key: 'cards_row', label: 'Cards · rows', note: 'Photo left, details right.' },
];

const bar = (w: string, h = 4, c = '#DDE0EF') => ({
  width: w,
  height: h,
  borderRadius: 2,
  background: c,
  flex: '0 0 auto',
});
const photo = (w: number, h: number) => ({
  width: w,
  height: h,
  borderRadius: 3,
  background: '#C9CEE6',
  flex: '0 0 auto',
});

/** A miniature of each arrangement — no content, just its shape. */
function Mini({ layout }: { layout: BoardSectionLayout }) {
  const frame: React.CSSProperties = {
    height: 88,
    padding: 9,
    borderRadius: 7,
    background: '#fff',
    border: `1px solid ${BORDER_SOFT}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    overflow: 'hidden',
  };

  if (layout === 'table') {
    return (
      <div style={frame}>
        <div style={{ display: 'flex', gap: 5 }}>
          {['18%', '22%', '26%', '20%'].map((w, i) => (
            <div key={i} style={bar(w, 4, ACCENT)} />
          ))}
        </div>
        {[0, 1, 2].map((r) => (
          <div key={r} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <div style={photo(12, 12)} />
            <div style={bar('20%')} />
            <div style={bar('26%')} />
            <div style={bar('18%')} />
          </div>
        ))}
      </div>
    );
  }

  if (layout === 'cards_grid') {
    return (
      <div style={{ ...frame, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ ...photo(0, 20), width: '100%' }} />
            <div style={{ ...bar('100%', 5, ACCENT) }} />
            <div style={bar('70%', 3)} />
          </div>
        ))}
      </div>
    );
  }

  if (layout === 'cards_band') {
    return (
      <div style={frame}>
        {[0, 1].map((i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* The photo stands over the banner, as the layout itself does. */}
            <div style={{ display: 'flex', gap: 0, alignItems: 'flex-end' }}>
              <div style={{ ...photo(18, 20), marginRight: -2, zIndex: 1 }} />
              <div
                style={{
                  height: 14,
                  flex: 1,
                  background: `linear-gradient(90deg, ${ACCENT}, rgba(255,255,255,0))`,
                  borderBottom: `2px solid ${ACCENT}`,
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                <div style={bar('60%', 3, ACCENT)} />
                <div style={bar('90%', 3)} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                <div style={bar('55%', 3, ACCENT)} />
                <div style={bar('85%', 3)} />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={frame}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <div style={photo(20, 20)} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
            <div style={bar('55%', 4, ACCENT)} />
            <div style={bar('90%', 3)} />
            <div style={bar('75%', 3)} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function BoardLayoutPicker({
  current,
  saving,
  error,
  onApply,
  onClose,
}: {
  current: BoardSectionLayout;
  saving: boolean;
  /** Set when the last Apply failed — the dialog stays open so it can be read. */
  error: string | null;
  onApply: (layout: BoardSectionLayout) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<BoardSectionLayout>(current);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ width: 620, maxWidth: '92vw', padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 16, fontWeight: 800, color: INK }}>Choose a layout</div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 6, lineHeight: 1.6 }}>
          The same board members either way — this is how they print, on screen and in the exported
          report.
        </div>

        <div
          style={{
            marginTop: 18,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: 14,
          }}
        >
          {OPTIONS.map((o) => {
            const on = picked === o.key;
            return (
              <button
                key={o.key}
                type="button"
                aria-pressed={on}
                onClick={() => setPicked(o.key)}
                style={{
                  textAlign: 'left',
                  padding: 10,
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  background: on ? 'rgba(64,64,200,.05)' : '#fff',
                  border: `1.5px solid ${on ? ACCENT : BORDER}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <Mini layout={o.key} />
                <div style={{ fontSize: 12.5, fontWeight: 700, color: on ? ACCENT : INK }}>
                  {o.label}
                </div>
                <div style={{ fontSize: 11, color: FAINT, lineHeight: 1.45 }}>{o.note}</div>
              </button>
            );
          })}
        </div>

        {error && <div style={{ marginTop: 12, fontSize: 11.5, color: RED }}>{error}</div>}

        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn bs" type="button" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn bp"
            type="button"
            disabled={saving || picked === current}
            onClick={() => onApply(picked)}
          >
            {saving ? 'Applying…' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}
