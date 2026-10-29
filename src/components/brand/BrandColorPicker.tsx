import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { BrandColors, BrandRoleKey, ColorPalette } from '@/types/brand';
import { BRAND_COLOR_ROLES, contrastRatio, normalizeHex, onColor } from '@/types/brand';

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
//
// DELIBERATE DIVERGENCE (company palette widened to five roles):
// this picker now edits five roles — primary, secondary, accent, text, light —
// because that is the COMPANY brand palette, stored on companies.brand_colors.
// The quarterly twin still edits two, on purpose: the quarterly cover and its
// live preview consume primary/secondary only, so three extra pickers there
// would be controls with no visible effect on the thing being previewed. The
// shared BrandColors type carries accent/text/light as OPTIONAL, so the twin
// keeps compiling and a report-level override simply stays a 2-colour object.
// When the quarterly cover starts rendering the other three roles, add the
// fields there and delete this note from both files.

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
  companyName,
}: {
  palettes: ColorPalette[];
  value: BrandColors;
  onChange: (next: BrandColors) => void;
  /**
   * Named on the sample cover. Falls back to "Your Company" — never to a real
   * company: this renders on every tenant's settings page, and another firm's
   * name set in your brand colour is somewhere between confusing and a
   * liability.
   */
  companyName?: string;
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
  // Which role the pointer/keyboard is on in the legend. The preview dims every
  // ink but that one, so "what does Light even do?" is answered by looking
  // rather than by reading the note.
  const [focusRole, setFocusRole] = useState<BrandRoleKey | null>(null);
  // An unset role has nothing to point at, and lighting up its fallback would
  // teach that accent IS red. Refuse the focus instead.
  const focusIfSet = (r: BrandRoleKey | null) => setFocusRole(r && value[r] ? r : null);

  // A preset names primary/secondary. The server presets carry nothing else, so
  // the roles it doesn't name are KEPT rather than cleared — picking a palette
  // must not silently throw away an accent/text/light the user chose by hand.
  const applyPalette = (p: ColorPalette) => {
    setCustomOpen(false);
    onChange({
      ...value,
      primary: p.primary,
      secondary: p.secondary,
      ...(p.accent ? { accent: p.accent } : {}),
      ...(p.text ? { text: p.text } : {}),
      ...(p.light ? { light: p.light } : {}),
      palette_key: p.key,
    });
  };
  const setCustom = (patch: Partial<Omit<BrandColors, 'palette_key'>>) => {
    onChange({ ...value, ...patch, palette_key: 'custom' });
  };

  return (
    <div>
      {/* Role legend — what each color affects. Swatches are live. */}
      {showPreview && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 16px', marginBottom: 14 }}>
          {BRAND_COLOR_ROLES.map((r) => (
            <RoleNote
              key={r.key}
              role={r.key}
              color={value[r.key]}
              label={r.label}
              note={r.note}
              active={focusRole === r.key}
              onFocusRole={focusIfSet}
              hasColor={Boolean(value[r.key])}
            />
          ))}
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
        /* Five fields in a wrapping grid rather than a flex row: this card is
           rendered both on the onboarding step and inside a Company Profile
           tab, so the column count has to fall from five to one on its own. */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))',
            gap: '14px 18px',
            marginBottom: 14, padding: '12px 14px',
            border: `1px solid #ECEEF8`, borderRadius: 10, background: '#FAFBFE',
          }}
        >
          {BRAND_COLOR_ROLES.map((r) => (
            <HexField
              key={r.key}
              label={r.label}
              // '' for a role a 2-colour company never set — the field renders
              // empty and stays unset until the user actually picks something.
              value={value[r.key] ?? ''}
              onChange={(v) => setCustom({ [r.key]: v })}
              note={r.note}
            />
          ))}
        </div>
      )}

      {showPreview && <ReportPreview brand={value} focusRole={focusRole} companyName={companyName} />}

      {/* Measured, not guessed, and it names the role. A pale primary renders a
          heading you can barely read; without a line saying so the preview just
          looks broken, and the person blames the preview rather than the colour.
          3:1 is the WCAG floor for large text, which is what a heading is. */}
      {(() => {
        const weak = (['primary', 'secondary'] as const)
          .filter((r) => value[r] && contrastRatio(value[r] as string, '#FFFFFF') < 3)
          .map((r) => (r === 'primary' ? 'Primary' : 'Secondary'));
        if (!weak.length) return null;
        return (
          <div style={{ marginTop: 10, fontSize: 12, color: '#B45309', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span aria-hidden>⚠</span>
            {/* One string, not interpolated fragments: split across text nodes
                this is unreadable to a matcher and to a screen reader alike. */}
            <span>
              {`${weak.join(' and ')} ${weak.length > 1 ? 'are' : 'is'} pale against white, so text set in ${weak.length > 1 ? 'them' : 'it'} is hard to read. Your report darkens ${weak.length > 1 ? 'them' : 'it'} for headings and keeps the color for fills and rules.`}
            </span>
          </div>
        );
      })()}
    </div>
  );
}

// A live swatch + role label + usage note, one per role. `color` is undefined
// for a role this company has never set (accent/text/light on an older
// company) — the swatch then shows an empty outline instead of black.
function RoleNote({
  role, color, label, note, active, onFocusRole, hasColor,
}: {
  role: BrandRoleKey;
  color?: string;
  label: string;
  note: string;
  active: boolean;
  onFocusRole: (r: BrandRoleKey | null) => void;
  hasColor: boolean;
}) {
  // A button, not a focusable div: this does something, so it has to be
  // reachable by keyboard with a real focus ring, and tappable — there is no
  // hover on a phone, and hover was the only way in.
  return (
    <button
      type="button"
      onMouseEnter={() => onFocusRole(role)}
      onMouseLeave={() => onFocusRole(null)}
      onFocus={() => onFocusRole(role)}
      onBlur={() => onFocusRole(null)}
      onClick={() => onFocusRole(active ? null : role)}
      aria-pressed={active}
      aria-label={hasColor ? `Show where ${label} is used` : `${label} is not set`}
      className="brand-role-note"
      style={{
        flex: '1 1 200px', minWidth: 180, display: 'flex', gap: 9, alignItems: 'flex-start',
        padding: '7px 9px', margin: -1, borderRadius: 8, textAlign: 'left',
        font: 'inherit', cursor: hasColor ? 'pointer' : 'default',
        background: active ? '#F1F2FA' : 'transparent',
        border: `1px solid ${active ? '#D7DAEE' : 'transparent'}`,
      }}
    >
      <span
        style={{
          width: 16, height: 16, borderRadius: 5, flexShrink: 0, marginTop: 1,
          background: color || 'transparent',
          border: color ? '1px solid rgba(0,0,0,.12)' : '1px dashed rgba(0,0,0,.22)',
        }}
        aria-hidden
      />
      <span>
        <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#3A3F5C' }}>{label}</span>
        <span style={{ display: 'block', fontSize: 11.5, color: MUTED, lineHeight: 1.45 }}>{note}</span>
      </span>
    </button>
  );
}

// Swatch + free-text hex, kept in sync. The text field holds raw keystrokes so
// a half-typed hex isn't rewritten under the cursor; only a valid value is
// committed upward.
function HexField({ label, value, onChange, note }: { label: string; value: string; onChange: (v: string) => void; note?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#3A3F5C', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="color"
          value={normalizeHex(value) ?? '#ffffff'}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 40, height: 34, flexShrink: 0, padding: 0, border: `1px solid ${BORDER}`, borderRadius: 8, background: '#fff', cursor: 'pointer' }}
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
          placeholder="Not set"
          aria-label={`${label} hex value`}
          style={{ width: 100, minWidth: 0, flex: '1 1 auto', maxWidth: 110, padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${BORDER}`, fontSize: 13, fontFamily: "'DM Mono', monospace", color: DARK, outline: 'none' }}
        />
      </div>
      {note && <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.4, marginTop: 6 }}>{note}</div>}
    </div>
  );
}

// A proof sheet: the cover and a data page from the report these colors are
// for. Swatches say what a color IS; this says where it LANDS, which is the
// only question a person picking five of them actually has.
//
// Every role gets real area on purpose. An earlier version spent `accent` on a
// 6px triangle and `light` on a 1px rule, so a five-colour palette read as a
// two-colour one and people asked where the other three had gone.
//
// The pages are set in a serif against the app's sans: they are paper, not UI,
// and a palette for print has to be judged as print.
const PAGE_SERIF = "Georgia, 'Iowan Old Style', 'Times New Roman', serif";
const UNSET = '#D7DAE4';

function ReportPreview({
  brand, focusRole, companyName,
}: {
  brand: BrandColors;
  focusRole: BrandRoleKey | null;
  companyName?: string;
}) {
  // An unset role draws in a flat neutral, never in another role's colour. The
  // legend shows a dashed empty swatch for these, and the page has to agree
  // with it — a confident red chip under an empty "Accent" swatch is the two
  // halves of this card contradicting each other on screen.
  const primary = brand.primary;
  const secondary = brand.secondary;
  const accent = brand.accent || UNSET;
  const text = brand.text || BODY;
  const light = brand.light || '#F1F3F8';
  const onPrimary = onColor(primary);
  const onSecondary = onColor(secondary);
  const onAccent = onColor(accent);
  const company = companyName?.trim() || 'Your Company';

  // Dim the rest, and halo the match. The halo sits OUTSIDE the element: an
  // inset stroke on a 3px rule covers the rule, so the one thing being asked
  // about renders as a dark bar instead of its own colour.
  const ink = (role: BrandRoleKey, halo = false): CSSProperties => {
    const t = 'opacity .16s ease, box-shadow .16s ease';
    if (!focusRole) return { opacity: 1, transition: t };
    if (focusRole !== role) return { opacity: 0.4, transition: t };
    return {
      opacity: 1,
      transition: t,
      ...(halo ? { boxShadow: '0 0 0 2px #fff, 0 0 0 3.5px rgba(26,29,46,.5)' } : {}),
    };
  };

  const page: CSSProperties = {
    boxSizing: 'border-box',
    background: '#fff', borderRadius: 1, overflow: 'hidden',
    boxShadow: '0 1px 2px rgba(16,24,40,.10), 0 8px 18px -10px rgba(16,24,40,.28)',
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#3A3F5C' }}>How these look on the page</span>
        <span style={{ fontSize: 11.5, color: '#5A6080' }}>Point at a color above, or tap it, to see where it lands.</span>
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'stretch', flexWrap: 'wrap', padding: 16, borderRadius: 12, background: '#EDEFF5' }}>
        {/* ── Cover ─────────────────────────────────────────────── */}
        <div style={{ ...page, width: 152, height: 215, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ background: primary, flex: '0 0 58%', padding: '14px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', ...ink('primary') }}>
            <div style={{ fontSize: 7.5, letterSpacing: 1.4, textTransform: 'uppercase', color: onPrimary, opacity: .75 }}>Annual Report</div>
            <div style={{ fontFamily: PAGE_SERIF, fontSize: 32, lineHeight: 1, color: onPrimary }}>2025</div>
          </div>
          {/* A band, not a hairline: secondary was being judged on 8px type. */}
          <div style={{ background: secondary, padding: '5px 12px', ...ink('secondary') }}>
            <span style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: .8, textTransform: 'uppercase', color: onSecondary }}>Year in review</span>
          </div>
          <div style={{ position: 'relative', flex: 1, padding: '10px 12px', display: 'flex', alignItems: 'flex-end' }}>
            <span aria-hidden style={{ position: 'absolute', inset: 0, background: light, ...ink('light') }} />
            <div style={{ position: 'relative', fontFamily: PAGE_SERIF, fontSize: 9.5, color: text, ...ink('text') }}>{company}</div>
          </div>
        </div>

        {/* ── Data page ─────────────────────────────────────────── */}
        <div style={{ ...page, flex: '1 1 320px', minWidth: 280, height: 215, padding: '14px 16px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontFamily: PAGE_SERIF, fontSize: 15.5, color: primary, ...ink('primary') }}>Financial highlights</div>

          <div style={{ display: 'flex', marginTop: 9, background: primary, color: onPrimary, fontSize: 8, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', padding: '5px 8px', ...ink('primary') }}>
            <span style={{ flex: 1 }}>Metric</span><span style={{ width: 64, textAlign: 'right' }}>2025</span><span style={{ width: 50, textAlign: 'right' }}>Change</span>
          </div>
          {[['Revenue', '4.2bn', '+12.4%'], ['Net income', '0.9bn', '+6.1%']].map((row, i) => (
            <div key={row[0]} style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '6px 8px' }}>
              {/* The band is a layer, not the row's background: dimming the row
                  would cap the accent chip inside it. */}
              {i % 2 === 0 && (
                <span aria-hidden style={{ position: 'absolute', inset: 0, background: light, ...ink('light') }} />
              )}
              <span style={{ position: 'relative', flex: 1, fontSize: 9.5, color: text, ...ink('text') }}>{row[0]}</span>
              <span style={{ position: 'relative', width: 64, textAlign: 'right', fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 600, color: text, ...ink('text') }}>SAR {row[1]}</span>
              <span style={{ position: 'relative', width: 50, textAlign: 'right' }}>
                <span style={{ display: 'inline-block', padding: '1px 5px', borderRadius: 3, background: accent, color: onAccent, fontSize: 8.5, fontWeight: 700, ...ink('accent', true) }}>{row[2]}</span>
              </span>
            </div>
          ))}

          {/* Highlight panel — the role note promises secondary carries
              highlights, so it has to carry one somewhere with real area. */}
          <div style={{ marginTop: 9, padding: '6px 9px', background: secondary, color: onSecondary, display: 'flex', alignItems: 'baseline', gap: 7, ...ink('secondary') }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 600 }}>+12.4%</span>
            <span style={{ fontSize: 8.5, letterSpacing: .3 }}>revenue growth year on year</span>
          </div>

          <p style={{ margin: '9px 0 0', fontFamily: PAGE_SERIF, fontSize: 9.5, lineHeight: 1.6, color: text, ...ink('text') }}>
            Growth held across every segment, with margin steady against rising
            input costs.
          </p>

          <div style={{ marginTop: 'auto', paddingTop: 8 }}>
            <div style={{ height: 2, background: light, ...ink('light') }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 7.5, color: text, opacity: .55, ...ink('text') }}>
              <span>{company} · Annual Report 2025</span><span>24</span>
            </div>
          </div>
        </div>
      </div>

      <p style={{ margin: '9px 0 0', fontSize: 11.5, lineHeight: 1.5, color: MUTED }}>
        Body text always prints in your Text color. The other four tint headings,
        table headers, highlights and rules.
      </p>
    </div>
  );
}
