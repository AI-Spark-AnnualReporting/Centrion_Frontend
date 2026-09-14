import { useEffect, useState } from 'react';
import type { BrandColors, ColorPalette } from '@/types/brand';
import { PRIMARY_NOTE, SECONDARY_NOTE, isLight, normalizeHex } from '@/types/brand';

// Standalone brand-color picker: preset palettes, a custom-hex escape hatch, and
// a live preview of what the colors actually do to a report.
//
// Deliberately a sibling of (not a refactor of) the quarterly cover picker's
// Part B in components/quarterly/CoverTemplatePicker.tsx: that component is live
// in the report builder and is also being edited on the quarterly-* branches, so
// sharing one file would trade a real merge-conflict cost for no user-facing
// gain. Same interaction model, same palette source (GET .../color-palettes), so
// the two stay consistent by construction. If the picker's behaviour changes,
// change both.

const ACCENT = '#4040C8';
const DARK = '#1A1D2E';
const MUTED = '#6B7280';
const BODY = '#2A2E47';
const BORDER = '#E4E6F1';

export default function BrandColorPicker({
  palettes,
  value,
  onChange,
  showPreview = true,
}: {
  palettes: ColorPalette[];
  value: BrandColors;
  onChange: (next: BrandColors) => void;
  /**
   * The swatch preview and the two role notes below the pills. Both answer
   * "what do these colours actually do?" — worth their space on the onboarding
   * step, where nothing else does. The Report design card shows a full A4 page
   * beside the pills, which answers the same question more accurately, so it
   * turns them off. Default true: BrandStep is untouched.
   */
  showPreview?: boolean;
}) {
  // Custom mode is sticky once entered so the hex fields don't vanish mid-edit
  // when a typed value happens to equal a preset.
  const [customOpen, setCustomOpen] = useState(value.palette_key === 'custom');

  const applyPalette = (p: ColorPalette) => {
    setCustomOpen(false);
    onChange({ primary: p.primary, secondary: p.secondary, palette_key: p.key });
  };
  const setCustom = (patch: Partial<Pick<BrandColors, 'primary' | 'secondary'>>) => {
    onChange({ ...value, ...patch, palette_key: 'custom' });
  };

  return (
    <div>
      {/* Role legend — what each color affects. Swatches are live. */}
      {showPreview && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 14 }}>
          <RoleNote color={value.primary} label="Primary" note={PRIMARY_NOTE} />
          <RoleNote color={value.secondary} label="Secondary" note={SECONDARY_NOTE} />
        </div>
      )}

      {/* Preset pills + the Custom escape hatch */}
      <div role="group" aria-label="Brand color palette" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {palettes.map((p) => {
          const active = value.palette_key === p.key && !customOpen;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPalette(p)}
              aria-pressed={active}
              className="brand-pill"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 12px 7px 8px',
                borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                fontFamily: 'inherit',
                color: active ? '#2B2B8F' : '#3A3F5C',
                background: active ? '#EEEEFF' : '#fff',
                border: `1.5px solid ${active ? ACCENT : BORDER}`,
              }}
            >
              <span style={{ display: 'inline-flex' }} aria-hidden>
                <span style={{ width: 16, height: 16, borderRadius: '50% 0 0 50%', background: p.primary }} />
                <span style={{ width: 16, height: 16, borderRadius: '0 50% 50% 0', background: p.secondary }} />
              </span>
              {p.name}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setCustomOpen(true)}
          aria-pressed={customOpen}
          className="brand-pill"
          style={{
            padding: '7px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
            fontFamily: 'inherit',
            color: customOpen ? '#2B2B8F' : '#3A3F5C',
            background: customOpen ? '#EEEEFF' : '#fff',
            border: `1.5px solid ${customOpen ? ACCENT : BORDER}`,
          }}
        >
          Custom
        </button>
      </div>

      {customOpen && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginBottom: 14, padding: '12px 14px', border: `1px solid #ECEEF8`, borderRadius: 10, background: '#FAFBFE' }}>
          <HexField label="Primary" value={value.primary} onChange={(v) => setCustom({ primary: v })} note={PRIMARY_NOTE} />
          <HexField label="Secondary" value={value.secondary} onChange={(v) => setCustom({ secondary: v })} note={SECONDARY_NOTE} />
        </div>
      )}

      {showPreview && <ReportPreview brand={value} />}

      {isLight(value.primary) && (
        <div style={{ marginTop: 10, fontSize: 12, color: '#B45309', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span aria-hidden>⚠</span> This color may be hard to read as an accent — it’ll be darkened for text on white.
        </div>
      )}
    </div>
  );
}

// A live swatch + role label + usage note (Primary / Secondary).
function RoleNote({ color, label, note }: { color: string; label: string; note: string }) {
  return (
    <div style={{ flex: '1 1 240px', minWidth: 220, display: 'flex', gap: 9, alignItems: 'flex-start' }}>
      <span
        style={{ width: 16, height: 16, borderRadius: 5, background: color, flexShrink: 0, marginTop: 1, border: '1px solid rgba(0,0,0,.12)' }}
        aria-hidden
      />
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#3A3F5C' }}>{label}</div>
        <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.45 }}>{note}</div>
      </div>
    </div>
  );
}

// Swatch + free-text hex, kept in sync. The text field holds raw keystrokes so
// a half-typed hex isn't rewritten under the cursor; only a valid value is
// committed upward.
function HexField({ label, value, onChange, note }: { label: string; value: string; onChange: (v: string) => void; note?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div style={{ maxWidth: 260 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#3A3F5C', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="color"
          value={normalizeHex(value) ?? '#4040c8'}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 40, height: 34, padding: 0, border: `1px solid ${BORDER}`, borderRadius: 8, background: '#fff', cursor: 'pointer' }}
          aria-label={`${label} color`}
        />
        <input
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const hex = normalizeHex(e.target.value);
            if (hex) onChange(hex);
          }}
          placeholder="#4040C8"
          aria-label={`${label} hex value`}
          style={{ width: 100, padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${BORDER}`, fontSize: 13, fontFamily: "'DM Mono', monospace", color: DARK, outline: 'none' }}
        />
      </div>
      {note && <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.4, marginTop: 6 }}>{note}</div>}
    </div>
  );
}

// Two live previews side by side — a cover page and a body page — so the choice
// is judged on the thing it actually changes rather than on a swatch.
function ReportPreview({ brand }: { brand: BrandColors }) {
  return (
    <div style={{ border: '1px solid #ECEEF8', borderRadius: 12, padding: 14, background: '#FAFBFE' }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: MUTED, marginBottom: 10 }}>
        Preview
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
        {/* Cover page */}
        <div style={{ width: 118, flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid #E5E7EF', background: '#fff', display: 'flex', flexDirection: 'column' }}>
          <div style={{ background: brand.primary, padding: '14px 11px', display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ height: 7, width: '72%', borderRadius: 3, background: 'rgba(255,255,255,.92)' }} />
            <div style={{ height: 4, width: '46%', borderRadius: 3, background: 'rgba(255,255,255,.55)' }} />
          </div>
          <div style={{ height: 3, background: brand.secondary }} />
          <div style={{ flex: 1, padding: 11, display: 'flex', flexDirection: 'column', gap: 5, justifyContent: 'flex-end' }}>
            <div style={{ height: 4, width: '62%', borderRadius: 3, background: '#E4E6F1' }} />
            <div style={{ height: 4, width: '40%', borderRadius: 3, background: '#E4E6F1' }} />
          </div>
        </div>

        {/* Body page */}
        <div style={{ flex: 1, minWidth: 0, borderRadius: 8, border: '1px solid #E5E7EF', background: '#fff', padding: '13px 15px' }}>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: brand.primary, lineHeight: 1.2 }}>Section heading</div>
          <div style={{ display: 'flex', gap: 20, marginTop: 9, paddingBottom: 5, borderBottom: `2px solid ${brand.primary}`, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: brand.primary }}>
            <span style={{ flex: 1 }}>Metric</span><span>Current</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 9 }}>
            <span style={{ fontSize: 17, fontWeight: 800, color: brand.secondary, fontFamily: "'DM Mono', monospace" }}>SAR 4.2bn</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: brand.secondary }}>▲ 12.4%</span>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.6, color: BODY }}>
            Body text stays dark and readable — your colors only tint headings, table headers and accents.
          </p>
        </div>
      </div>
    </div>
  );
}
