/*
 * TypographyControls.tsx — the "Typography" section of the Report Design
 * modal. Three rows (heading / subheading / body); each row picks family,
 * size and weight; body also picks line-height. The subheading row carries
 * a second line of options — numbering, case, spacing and colour — that
 * style the headings the engine writes INSIDE a section's body (h3/h4),
 * not the section title. The section header shows a "Recommended for
 * {Layout}" hint and, when the current values differ from that layout's
 * defaults, a "Customised" pill + a Reset link that snaps everything back.
 *
 * Every option here is enforced against the same allowlists the backend
 * validates against (report_typography.py) so a valid submission always
 * passes the API's 422 check. Values match the layout's blueprint stored
 * in quarterly_cover_templates.layout.typography exactly, so what the
 * modal calls "Recommended for Bold" is what the PDF would render if the
 * user picked Bold and applied without changing anything.
 */
import { memo, useMemo } from 'react';
import type { ReactNode } from 'react';
import type {
  SubheadingCase,
  SubheadingColor,
  SubheadingNumbering,
  SubheadingSpacing,
  Typography,
  TypographyFamily,
  TypographyRole,
  TypographyWeight,
} from '@/types/quarterly';
import { SUBHEADING_DEFAULTS, TYPOGRAPHY_ALLOWLISTS } from '@/types/quarterly';

type RoleKey = 'heading' | 'subheading' | 'body';

const ROLE_LABEL: Record<RoleKey, string> = {
  heading: 'Heading',
  subheading: 'Subheading',
  body: 'Body',
};

type SegmentOption<T> = { label: string; value: T };

const WEIGHT_OPTIONS: SegmentOption<TypographyWeight>[] = [
  { label: 'Regular', value: 400 },
  { label: 'Bold',    value: 700 },
];

// The subheading-only second line — one segmented control per option.
// Values are what gets stored on the role; labels are what the user reads.
const NUMBERING_OPTIONS: SegmentOption<SubheadingNumbering>[] = [
  { label: 'Numbered', value: 'numbered' },
  { label: 'Plain',    value: 'plain' },
];
const CASE_OPTIONS: SegmentOption<SubheadingCase>[] = [
  { label: 'Normal',    value: 'normal' },
  { label: 'UPPERCASE', value: 'upper' },
];
const SPACING_OPTIONS: SegmentOption<SubheadingSpacing>[] = [
  { label: 'Tight',  value: 'tight' },
  { label: 'Normal', value: 'normal' },
  { label: 'Loose',  value: 'loose' },
];
const COLOR_OPTIONS: SegmentOption<SubheadingColor>[] = [
  { label: 'Body ink', value: 'body' },
  { label: 'Brand',    value: 'brand' },
];

type SubheadingKey = keyof typeof SUBHEADING_DEFAULTS;
type SubheadingOptions = Required<Pick<TypographyRole, SubheadingKey>>;

// Read a subheading option as its default when the role predates it. Every
// comparison and every control goes through this: a role stored before these
// keys existed has none of them, while the layout blueprints now spell all
// four out, so reading a missing key as `undefined` would make an untouched
// design report itself as "Customised".
function subOption<K extends SubheadingKey>(role: TypographyRole, key: K): SubheadingOptions[K] {
  return (role[key] ?? SUBHEADING_DEFAULTS[key]) as SubheadingOptions[K];
}

const SUBHEADING_KEYS = Object.keys(SUBHEADING_DEFAULTS) as SubheadingKey[];


function rolesEqual(a: TypographyRole, b: TypographyRole): boolean {
  return (
    a.family === b.family && a.size === b.size && a.weight === b.weight
    && SUBHEADING_KEYS.every((k) => subOption(a, k) === subOption(b, k))
  );
}

export function hasCustomTypography(current: Typography, defaults: Typography): boolean {
  return !(
    rolesEqual(current.heading, defaults.heading)
    && rolesEqual(current.subheading, defaults.subheading)
    && rolesEqual(current.body, defaults.body)
  );
}


export const TypographyControls = memo(function TypographyControls({
  value,
  onChange,
  layoutName,
  layoutDefaults,
}: {
  value: Typography;
  onChange: (next: Typography) => void;
  layoutName: string;
  layoutDefaults: Typography;
}) {
  const customised = useMemo(
    () => hasCustomTypography(value, layoutDefaults),
    [value, layoutDefaults],
  );

  const patchRole = (role: RoleKey, patch: Partial<Typography[RoleKey]>) => {
    // The quarterly/earnings PATCH replaces `typography` wholesale — it does
    // not merge keys server-side — so once the user touches the subheading
    // row it leaves here with all four options spelled out. A key left
    // missing would come back as the backend's own default next save.
    const next = role === 'subheading'
      ? { ...SUBHEADING_DEFAULTS, ...value[role], ...patch }
      : { ...value[role], ...patch };
    onChange({ ...value, [role]: next } as Typography);
  };

  return (
    <section aria-label="Typography">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Typography</span>
          <span className="text-[11px] text-slate-400">Recommended for {layoutName}</span>
          {customised && (
            <span
              className="ml-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700"
              aria-label="Custom typography values differ from the recommended defaults"
            >
              Customised
            </span>
          )}
        </div>
        {customised && (
          <button
            type="button"
            onClick={() => onChange(layoutDefaults)}
            className="text-[11.5px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
            aria-label={`Reset typography to ${layoutName}'s recommended defaults`}
          >
            Reset to recommended
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {(['heading', 'subheading', 'body'] as const).map((role) => {
          const spec = value[role];
          const range = TYPOGRAPHY_ALLOWLISTS.sizeRanges[role];
          return (
            <div
              key={role}
              // The stepper track is `auto`, not a fixed 92px: its contents are ~154px
              // (two 24px buttons, a 48px input, three 4px gaps and the "14–22px"
              // range hint), so a fixed track clipped the hint to "14-" in every
              // container including this modal. The family column absorbs the change.
              className="grid grid-cols-[80px_minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              <label className="text-[12px] font-semibold text-slate-700">{ROLE_LABEL[role]}</label>

              <FamilySelect
                value={spec.family}
                onChange={(family) => patchRole(role, { family })}
                fieldId={`typo-family-${role}`}
              />

              <SizeStepper
                value={spec.size}
                min={range.min}
                max={range.max}
                step={range.step}
                onChange={(size) => patchRole(role, { size })}
                fieldId={`typo-size-${role}`}
              />

              <Segment
                value={spec.weight}
                options={WEIGHT_OPTIONS}
                onChange={(weight) => patchRole(role, { weight })}
                label="Font weight"
                fieldId={`typo-weight-${role}`}
              />

              {/* Subheading only: the headings the engine writes inside a
                * section's body. These live on a full-width second line of
                * this same card rather than as more grid columns — the four
                * columns above already need 537px, which is what .rd-controls
                * is capped to and what the two-pane breakpoint was computed
                * from. `col-span-4` keeps the grid at four tracks. */}
              {role === 'subheading' && (
                <div className="col-span-4 mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    In-section headings
                  </span>
                  <SubOption label="Numbering">
                    <Segment
                      value={subOption(spec, 'numbering')}
                      options={NUMBERING_OPTIONS}
                      onChange={(numbering) => patchRole(role, { numbering })}
                      label="Subheading numbering"
                      fieldId="typo-sub-numbering"
                    />
                  </SubOption>
                  <SubOption label="Case">
                    <Segment
                      value={subOption(spec, 'case')}
                      options={CASE_OPTIONS}
                      onChange={(c) => patchRole(role, { case: c })}
                      label="Subheading case"
                      fieldId="typo-sub-case"
                    />
                  </SubOption>
                  <SubOption label="Spacing">
                    <Segment
                      value={subOption(spec, 'spacing')}
                      options={SPACING_OPTIONS}
                      onChange={(spacing) => patchRole(role, { spacing })}
                      label="Subheading spacing"
                      fieldId="typo-sub-spacing"
                    />
                  </SubOption>
                  <SubOption label="Colour">
                    <Segment
                      value={subOption(spec, 'color')}
                      options={COLOR_OPTIONS}
                      onChange={(color) => patchRole(role, { color })}
                      label="Subheading colour"
                      fieldId="typo-sub-color"
                    />
                  </SubOption>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
});


// ── Sub-controls ─────────────────────────────────────────────────────

function FamilySelect({
  value, onChange, fieldId,
}: { value: TypographyFamily; onChange: (family: TypographyFamily) => void; fieldId: string }) {
  return (
    <select
      id={fieldId}
      value={value}
      onChange={(e) => onChange(e.target.value as TypographyFamily)}
      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
      aria-label="Font family"
    >
      {TYPOGRAPHY_ALLOWLISTS.families.map((f) => (
        // Render each option in its own typeface so the picker doubles
        // as its own preview — "Aa" is baked into the label via the
        // family font already being applied.
        <option key={f} value={f} style={{ fontFamily: f === 'DejaVu Sans' ? 'sans-serif' : `'${f}', sans-serif` }}>
          {f === 'DejaVu Sans' ? 'Default (system sans)' : f}
        </option>
      ))}
    </select>
  );
}


function SizeStepper({
  value, min, max, step, onChange, fieldId,
}: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; fieldId: string }) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 2) / 2));
  return (
    <div className="flex items-center gap-1" aria-label={`Font size, between ${min} and ${max} pixels`}>
      <button
        type="button"
        onClick={() => onChange(clamp(value - step))}
        aria-label="Decrease size"
        disabled={value <= min}
        className="h-7 w-6 rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-40"
      >
        −
      </button>
      <input
        id={fieldId}
        type="number"
        step={step}
        min={min}
        max={max}
        value={value}
        // Clamp on every keystroke, not just onBlur — a typed 999 snaps
        // to `max` immediately so the preview never renders an out-of-range
        // size and the value that goes to Apply is always within the range.
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') return;
          const n = Number(raw);
          if (Number.isFinite(n)) onChange(clamp(n));
        }}
        onBlur={(e) => onChange(clamp(Number(e.target.value) || min))}
        className="w-12 rounded-md border border-slate-200 bg-white px-1 py-1 text-center text-[12px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        aria-label="Size in pixels"
        title={`Between ${min} and ${max} px`}
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + step))}
        aria-label="Increase size"
        disabled={value >= max}
        className="h-7 w-6 rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-40"
      >
        +
      </button>
      <span className="whitespace-nowrap text-[10px] text-slate-400" aria-hidden>
        {min}–{max}px
      </span>
    </div>
  );
}


// One label + one segmented control, as the subheading sub-row repeats it.
// The label is a <span>, not a <label>: the control it names is a radio-like
// button group, which `aria-label` on the group already names.
function SubOption({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-slate-600">{label}</span>
      {children}
    </div>
  );
}


// The segmented control this design UI uses everywhere a boolean or a small
// enum is picked — there are no switches or radio groups here. Generalised
// from the font-weight pair it started as: same markup, same active state,
// any number of options.
function Segment<T extends string | number>({
  value, options, onChange, label, fieldId,
}: {
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (v: T) => void;
  label: string;
  fieldId: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      id={fieldId}
      className="inline-flex overflow-hidden rounded-md border border-slate-200 bg-white"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={
              'px-2.5 py-1 text-[11.5px] transition-colors '
              + (active ? 'bg-indigo-50 font-semibold text-indigo-700' : 'text-slate-500 hover:bg-slate-50')
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}


