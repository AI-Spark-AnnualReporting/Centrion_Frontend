/*
 * TypographyControls.tsx — the "Typography" section of the Report Design
 * modal. Three rows (heading / subheading / body); each row picks family,
 * size and weight; body also picks line-height. The section header shows
 * a "Recommended for {Layout}" hint and, when the current values differ
 * from that layout's defaults, a "Customised" pill + a Reset link that
 * snaps everything back.
 *
 * Every option here is enforced against the same allowlists the backend
 * validates against (report_typography.py) so a valid submission always
 * passes the API's 422 check. Values match the layout's blueprint stored
 * in quarterly_cover_templates.layout.typography exactly, so what the
 * modal calls "Recommended for Bold" is what the PDF would render if the
 * user picked Bold and applied without changing anything.
 */
import { memo, useMemo } from 'react';
import type {
  Typography,
  TypographyFamily,
  TypographyRole,
  TypographyWeight,
} from '@/types/quarterly';
import { TYPOGRAPHY_ALLOWLISTS } from '@/types/quarterly';

type RoleKey = 'heading' | 'subheading' | 'body';

const ROLE_LABEL: Record<RoleKey, string> = {
  heading: 'Heading',
  subheading: 'Subheading',
  body: 'Body',
};

const WEIGHT_OPTIONS: { label: string; value: TypographyWeight }[] = [
  { label: 'Regular', value: 400 },
  { label: 'Bold',    value: 700 },
];


function rolesEqual(a: TypographyRole, b: TypographyRole): boolean {
  return a.family === b.family && a.size === b.size && a.weight === b.weight;
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
    onChange({ ...value, [role]: { ...value[role], ...patch } } as Typography);
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
              className="grid grid-cols-[80px_minmax(0,1fr)_92px_auto] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
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

              <WeightSegment
                value={spec.weight}
                onChange={(weight) => patchRole(role, { weight })}
                fieldId={`typo-weight-${role}`}
              />
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


function WeightSegment({
  value, onChange, fieldId,
}: { value: TypographyWeight; onChange: (v: TypographyWeight) => void; fieldId: string }) {
  return (
    <div
      role="group"
      aria-label="Font weight"
      id={fieldId}
      className="inline-flex overflow-hidden rounded-md border border-slate-200 bg-white"
    >
      {WEIGHT_OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
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


