// Presentational primitives for the Board Report screens — the setup card, its
// numbered blocks, the pills, and the issuer-profile fields shared by the setup
// page (which seeds a new report) and the builder's profile step (which changes
// an existing one). Same convention as cycle-ui.tsx in this folder.
//
// The card / block / pill styling matches the Earnings setup form, so the two
// generate screens read as one design.

import type { Sector } from '@/types/company';
import type { BoardIssuerProfile } from '@/types/board';
import { ISSUER_TYPES } from './board-helpers';

export const ACCENT = '#4040C8';
export const ACCENT_TINT = '#EEEEFF';
export const GREEN = '#10B981';
export const INK = '#1A1D2E';
export const MUTED = '#5A6080';
export const FAINT = '#9BA3C4';
export const BORDER = '#E2E4F0';
export const BORDER_SOFT = '#ECEEF8';
export const AMBER = '#B4730B';
export const RED = '#DC2626';
export const MONO = "'DM Mono', 'Courier New', monospace";

// ─── card + blocks ────────────────────────────────────────────────────────────

export function SetupCard({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card" style={{ marginBottom: 16, overflow: 'hidden' }}>
      <div
        style={{
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderBottom: `1px solid ${BORDER_SOFT}`,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: ACCENT,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1l1.1 3.3H11L8.5 6.4l1.1 3.3L6 7.8l-3.6 2 1.1-3.3L1 4.3h3.9z" fill="white" />
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: INK }}>{title}</div>
          <div style={{ fontSize: 11, color: MUTED }}>{sub}</div>
        </div>
      </div>
      <div style={{ padding: '18px 20px' }}>{children}</div>
    </div>
  );
}

// Green "DETECTED" capsule — shown next to a field whose value was
// auto-filled from the company profile and still matches it. Same styling as
// the quarterly report's confirm-context DetectedBadge, so the two flows
// read as one convention.
export function DetectedBadge() {
  return (
    <span
      style={{
        flexShrink: 0,
        borderRadius: 999,
        background: '#E7F7EF',
        color: GREEN,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        padding: '3px 9px',
      }}
    >
      Detected
    </span>
  );
}

// Same card shape as the quarterly report's confirm-context question cards
// (CtxCard in QuarterlyReportForm.tsx) — a bordered box per question, number
// tile + title + hint stacked on the left, DETECTED badge anchored top-right
// of that box. The border is what makes the right-anchored badge read as
// "belonging to this card" instead of floating loose on the page.
export function Block({
  n,
  title,
  hint,
  detected,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  // Shows a DETECTED badge — the current value still matches what the
  // company profile seeded, i.e. the operator hasn't overridden it.
  detected?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        border: `1px solid ${BORDER_SOFT}`,
        borderRadius: 14,
        padding: '14px 16px 16px',
        background: '#fff',
        marginBottom: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
        <span
          style={{
            width: 24,
            height: 24,
            borderRadius: 8,
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 800,
            color: ACCENT,
            background: ACCENT_TINT,
          }}
        >
          {n}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: INK, lineHeight: 1.4 }}>{title}</h2>
          {hint && <div style={{ fontSize: 12, color: MUTED, marginTop: 3, lineHeight: 1.4 }}>{hint}</div>}
        </div>
        {detected && <DetectedBadge />}
      </div>
      <div style={{ marginLeft: 34 }}>{children}</div>
    </section>
  );
}

// ─── pills ────────────────────────────────────────────────────────────────────

export function Pill({
  label,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      style={{
        padding: '9px 16px',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        fontFamily: 'inherit',
        transition: 'border-color .15s, background .15s, color .15s',
        background: selected ? ACCENT_TINT : '#fff',
        color: selected ? '#2B2B8F' : '#3A3F5C',
        border: `1.5px solid ${selected ? ACCENT : BORDER}`,
      }}
    >
      {label}
    </button>
  );
}

export function PillRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>{children}</div>;
}

export function Flag({
  label,
  value,
  disabled,
  detected,
  onChange,
}: {
  label: string;
  value: boolean;
  disabled?: boolean;
  detected?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12.5, color: INK, fontWeight: 600, minWidth: 300 }}>{label}</span>
      <PillRow>
        <Pill label="Yes" selected={value} disabled={disabled} onClick={() => onChange(true)} />
        <Pill label="No" selected={!value} disabled={disabled} onClick={() => onChange(false)} />
      </PillRow>
      {/* Trails after the pills, not between label and pills, so the Yes/No
          columns stay aligned across rows whether or not a badge is shown. */}
      {detected && <DetectedBadge />}
    </div>
  );
}

export function Notice({ tone, children }: { tone: 'green' | 'amber' | 'red'; children: React.ReactNode }) {
  const c =
    tone === 'green'
      ? { bg: 'rgba(34,197,94,.08)', bd: 'rgba(34,197,94,.25)', fg: '#16803C' }
      : tone === 'amber'
        ? { bg: 'rgba(245,158,11,.08)', bd: 'rgba(245,158,11,.3)', fg: AMBER }
        : { bg: 'rgba(229,72,77,.08)', bd: 'rgba(229,72,77,.25)', fg: '#B33A3E' };
  return (
    <div
      role={tone === 'red' ? 'alert' : undefined}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        marginBottom: 18,
        padding: '9px 13px',
        borderRadius: 9,
        background: c.bg,
        border: `1px solid ${c.bd}`,
        fontSize: 12,
        lineHeight: 1.5,
        color: c.fg,
      }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, marginTop: 3 }}>
        {tone === 'green' ? (
          <path d="M2.5 6.2L5 8.7l4.5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M6 1.5v5m0 2.2v.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        )}
      </svg>
      <span>{children}</span>
    </div>
  );
}

/**
 * Shown on every step once the report is approved. The header carries a badge
 * too, but a badge doesn't explain why a screenful of controls has gone dead.
 */
export function LockedNotice() {
  return (
    <Notice tone="green">
      This report is approved and locked — everything below is read-only, and it can be exported
      from the Report step.
    </Notice>
  );
}

// ─── issuer profile fields ────────────────────────────────────────────────────

/**
 * The three questions that resolve the report's sections. Rendered on the setup
 * page (seeding a new report) and on the builder's profile step (changing an
 * existing one) — one implementation so the two can't drift.
 *
 * `startAt` offsets the block numbers: the setup page puts Financial year first,
 * so the profile starts at 2 there and at 1 in the builder.
 */
export function ProfileFields({
  profile,
  sectors,
  disabled = false,
  startAt = 1,
  detected,
  onChange,
}: {
  profile: BoardIssuerProfile;
  sectors: Sector[] | null; // null while loading
  disabled?: boolean;
  startAt?: number;
  // Which fields still match what the company profile seeded — each shows a
  // DETECTED badge while true, same convention as the quarterly report's
  // confirm-context step. Omit entirely when the profile wasn't seeded
  // (e.g. no company record) so nothing is marked detected.
  detected?: {
    issuer_type?: boolean;
    sector?: boolean;
    sharia_compliant?: boolean;
    has_capital_instruments?: boolean;
  };
  onChange: <K extends keyof BoardIssuerProfile>(key: K, value: BoardIssuerProfile[K]) => void;
}) {
  return (
    <>
      <Block n={startAt} title="Issuer type" hint="the biggest driver" detected={detected?.issuer_type}>
        <PillRow>
          {ISSUER_TYPES.map((t) => (
            <Pill
              key={t.value}
              label={t.label}
              disabled={disabled}
              selected={profile.issuer_type === t.value}
              onClick={() => onChange('issuer_type', t.value)}
            />
          ))}
        </PillRow>
      </Block>

      <Block
        n={startAt + 1}
        title="Sector"
        hint="sets segment / risk flavour and the fines regulator"
        detected={detected?.sector}
      >
        {sectors === null ? (
          <div style={{ fontSize: 12, color: FAINT }}>Loading sectors…</div>
        ) : sectors.length === 0 ? (
          <div style={{ fontSize: 12, color: FAINT }}>
            No sectors are configured. Add them in the sectors lookup before building a board report.
          </div>
        ) : (
          <PillRow>
            {sectors.map((s) => (
              <Pill
                key={s.id}
                label={s.name}
                disabled={disabled}
                selected={profile.sector === s.name}
                onClick={() => onChange('sector', s.name)}
              />
            ))}
          </PillRow>
        )}
      </Block>

      <Block n={startAt + 2} title="Disclosure flags" hint="each one switches sections on or off">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Flag
            label="Sharia-compliant?"
            value={profile.sharia_compliant}
            disabled={disabled}
            detected={detected?.sharia_compliant}
            onChange={(v) => onChange('sharia_compliant', v)}
          />
          <Flag
            label="Externally rated?"
            value={profile.externally_rated}
            disabled={disabled}
            onChange={(v) => onChange('externally_rated', v)}
          />
          <Flag
            label="Regulatory capital instruments (Tier 1 sukuk)?"
            value={profile.has_capital_instruments}
            disabled={disabled}
            detected={detected?.has_capital_instruments}
            onChange={(v) => onChange('has_capital_instruments', v)}
          />
        </div>
      </Block>
    </>
  );
}

/** The indigo strip summarising what the profile resolved to. */
export function ResolvedProfilePanel({
  profile,
  regulator,
  counts,
}: {
  profile: BoardIssuerProfile;
  regulator?: string | null;
  counts?: {
    included: number;
    mandatory: number;
    optional: number;
    conditional: number;
    dropped: number;
    na: number;
  } | null;
}) {
  return (
    <div style={{ borderRadius: 14, background: '#3535B5', color: '#fff', padding: '18px 22px' }}>
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Resolved profile</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 26px', fontSize: 12, opacity: 0.92 }}>
        <span>
          {profile.issuer_type === 'bank' ? 'Bank' : 'Non-financial'} ·{' '}
          {profile.sector ?? 'sector not set'}
        </span>
        {regulator && (
          <span>
            Regulator <b>{regulator}</b>
          </span>
        )}
        <span>
          Sharia <b>{profile.sharia_compliant ? 'yes' : 'no'}</b>
        </span>
        <span>
          Rated <b>{profile.externally_rated ? 'yes' : 'no'}</b>
        </span>
        <span>
          Capital instruments <b>{profile.has_capital_instruments ? 'yes' : 'no'}</b>
        </span>
      </div>
      {counts && (
        <div style={{ marginTop: 12, fontSize: 12.5, fontFamily: MONO }}>
          → {counts.included} sections ({counts.mandatory} mandatory · {counts.optional} optional ·{' '}
          {counts.conditional} conditional) · {counts.dropped} dropped · {counts.na} not applicable
        </div>
      )}
    </div>
  );
}
