// Brand colors — shared by the onboarding Brand step and the quarterly cover
// picker. They live here rather than in types/quarterly.ts because onboarding
// has nothing to do with quarterly reports; quarterly.ts re-exports them so
// every existing import keeps working.
//
// The same {primary, secondary, palette_key} object is stored in two places
// server-side: companies.brand_colors (the company default, set at onboarding)
// and reports.generation_config.brand (a per-report override). The report's
// value wins when set — see _resolve_brand in Centriton/routes/report_routes.py.

export interface ColorPalette {
  key: string;
  name: string;
  primary: string;
  secondary: string;
}

// palette_key is 'custom' (or '') when the primary/secondary are custom hex values.
export interface BrandColors {
  primary: string;
  secondary: string;
  palette_key: string;
}

// A logo the user picked, already read into the base64 data URI that gets
// stored in companies.logo_base64. name/size are kept only to render the
// preview row — the backend receives dataUri alone.
export interface PickedLogo {
  name: string;
  size: number;
  dataUri: string;
}

// The brand language guideline document, already read to text by the backend.
// `text` is what gets stored in companies.brand_identity; name/chars are shown
// in the picked-file row so the user can see the extraction actually worked.
export interface ExtractedGuideline {
  name: string;
  text: string;
  chars: number;
}

// What POST /auth/onboarding/detect-logo-colors returns for an uploaded logo.
//
// The hexes always come from real pixels in the image — the model only chooses
// which sampled colour is the primary and which is the secondary, so `source`
// says how that choice was reached:
//   "vision" — the model picked from the sampled candidates
//   "pixels" — the model was unusable; the two largest hue families were used
//   "none"   — the logo has no colour (white/black only), so primary is null
//              and the caller must leave the current colours alone
export interface DetectedBrandColors {
  primary: string | null;
  secondary: string | null;
  palette_key: string;
  source: "vision" | "pixels" | "none";
  candidates: string[];
}

// Mirrors PRESET_COLOR_PALETTES in Centriton/brand_constants.py. Only used as a
// fallback when GET /reports/quarterly/color-palettes can't be reached, so the
// Brand step never blocks onboarding on a network hiccup.
export const FALLBACK_COLOR_PALETTES: ColorPalette[] = [
  { key: "violet_cyan", name: "Violet & Cyan", primary: "#3C0866", secondary: "#5BC9E2" },
  { key: "navy_gold", name: "Navy & Gold", primary: "#0A1F44", secondary: "#C9A227" },
  { key: "green_slate", name: "Green & Slate", primary: "#0B5D3B", secondary: "#64748B" },
];

// What each role actually affects in a generated report — shown next to the
// pickers so the user knows the impact before choosing.
export const PRIMARY_NOTE =
  "Used for main headings, section titles, cover page, and table headers.";
export const SECONDARY_NOTE =
  "Used for highlights, KPI numbers, dividers, and accent borders.";

// ─── upload limits, shared by the onboarding Brand step and the Brand Identity
// page. Both screens accept the same files and must reject them identically, so
// the constants and the file readers live here rather than in either screen.

// Cap on companies.brand_identity — mirrors MAX_BRAND_IDENTITY_CHARS in
// Centriton/brand_constants.py, which in turn matches the extractor's own
// truncation point, so anything extract_text can produce is storable.
export const MAX_BRAND_IDENTITY = 24000;

// PNG/JPEG only, capped to match MAX_LOGO_BYTES in Centriton/brand_constants.py.
// The logo is stored inline on the company row as base64, so the cap is about
// row size, not upload bandwidth.
export const LOGO_MAX_BYTES = 1024 * 1024;
// Some browsers report a .jpg as image/jpg; the backend normalizes it.
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];
export const LOGO_ACCEPT = '.png,.jpg,.jpeg,image/png,image/jpeg';

// Mirrors _PROFILE_ALLOWED_EXTS in Centriton/routes/auth_routes.py.
export const DOC_ACCEPT = '.pdf,.docx';
export const DOC_EXTS = ['.pdf', '.docx'];

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function hasExt(name: string, exts: string[]): boolean {
  return exts.some((e) => name.toLowerCase().endsWith(e));
}

/** Decoded byte length of a base64 data URI, without decoding it.
 *
 * The stored logo arrives as bytes alone — no filename, no size — so this is
 * the only way to show its weight when the Brand Identity page loads one back.
 */
export function dataUriBytes(dataUri: string): number {
  const payload = dataUri.slice(dataUri.indexOf(',') + 1);
  if (!payload) return 0;
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

/** Why a picked logo is unusable, or null when it's fine.
 *
 * Deliberately synchronous and separate from readLogoFile: type and size are
 * knowable without touching the file, so rejecting on them must paint the error
 * in the same tick as the pick — not a microtask later.
 */
export function validateLogoFile(f: File): string | null {
  if (!LOGO_TYPES.includes(f.type)) return 'That file type isn’t supported. Use a PNG or JPG.';
  if (f.size > LOGO_MAX_BYTES) return `That image is ${formatBytes(f.size)} — the limit is 1 MB.`;
  return null;
}

/** Read an already-validated logo to the base64 data URI stored in
 * companies.logo_base64 — the exact string the report exporter renders.
 *
 * Rejects with the user-facing message, so both screens word it identically.
 */
export function readLogoFile(f: File): Promise<PickedLogo> {
  return new Promise((resolve, reject) => {
    const unreadable = new Error('We couldn’t read that image. Try another file.');
    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUri.startsWith('data:image/')) {
        reject(unreadable);
        return;
      }
      resolve({ name: f.name, size: f.size, dataUri });
    };
    reader.onerror = () => reject(unreadable);
    reader.readAsDataURL(f);
  });
}

// ─── colour helpers ───────────────────────────────────────────────────────────

/** '#abc' / 'aabbcc' / '#AABBCC' → '#aabbcc'. Null when it isn't a hex color. */
export function normalizeHex(v: string): string | null {
  let s = v.trim();
  if (!s.startsWith("#")) s = `#${s}`;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    s = "#" + s.slice(1).split("").map((c) => c + c).join("");
  }
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : null;
}

/** Relative luminance (0 = black, 1 = white) per WCAG. */
export function luminance(hex: string): number {
  const h = normalizeHex(hex) ?? "#000000";
  const ch = [1, 3, 5].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.4152 * ch[2];
}

/** Too pale to read as an accent on white — the export darkens these for text. */
export const isLight = (hex: string) => luminance(hex) > 0.7;
