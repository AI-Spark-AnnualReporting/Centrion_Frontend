// The parts of a plan spark_admin fills in on the editor page (and a client in
// "Get a quote"): the Modules and Users cards, the Enterprise
// contact card, and the small helpers both sides use. The License key page
// uses the same cards; for an upgrade it passes `floor` (the current key), so
// nothing can go below it and each change gets a small mark (+2, New).
//
// Rules: a module that counts reports always has at least 1 report (no
// unlimited, no 0). People: one number for any roles and departments (since
// 2026-11-11, plan Centriton/.claude/plans/one-user-total.md). The Users card
// shows the users besides the admin (10 = 11 people); max_users is the total.
//
// Plan: Centriton/.claude/plans/cloud-subscriptions-v2-redesign.md

import { useState } from 'react';
import type { LicensableModule } from '@/types/license';
import type { Duration, PlanContact, PlanLimits } from '@/types/subscription';
import './subscriptions.css';

export const EMPTY_LIMITS: PlanLimits = {
  modules: [],
  report_limits: {},
  max_users: 5,
};

export const DURATIONS: { key: Duration; label: string; per: string }[] = [
  { key: 'quarterly', label: 'Quarterly', per: 'per quarter' },
  { key: 'half_year', label: 'Half year', per: 'per 6 months' },
  { key: 'yearly', label: '1 year', per: 'per year' },
  { key: 'enterprise', label: 'Enterprise', per: '' },
];

export function durationLabel(duration: Duration): string {
  return DURATIONS.find((d) => d.key === duration)?.label ?? duration;
}

export function durationPer(duration: Duration): string {
  return DURATIONS.find((d) => d.key === duration)?.per ?? '';
}

/** "$40,000", or — when there is no price. Plan prices are in USD. */
export function formatMoney(value: number | null | undefined): string {
  return value == null ? '—' : `$${Number(value).toLocaleString('en-US')}`;
}

/** "25 users (admin included)" — the plan card's and summaries' words. */
export function usersSummary(limits: Pick<PlanLimits, 'max_users'>): string {
  return `${limits.max_users} user${limits.max_users === 1 ? '' : 's'} (admin included)`;
}

/** Small tags for a list: "Quarterly Report · 4", or the name alone for access-only modules. */
export function ModuleTags({ limits, catalogue }: { limits: PlanLimits; catalogue: LicensableModule[] }) {
  if (limits.modules.length === 0) return <span style={{ color: '#B6BBD0' }}>—</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {limits.modules.map((key) => {
        const module = catalogue.find((m) => m.key === key);
        const reports = module?.report_type ? limits.report_limits[module.report_type] : undefined;
        const text = `${module?.label ?? key}${reports != null ? ` · ${reports}` : ''}`;
        return (
          <span key={key} style={{ fontSize: 10.5, fontWeight: 600, borderRadius: 6, padding: '2px 7px', background: '#EEEEFF', color: '#4040C8', whiteSpace: 'nowrap' }}>
            {text}
          </span>
        );
      })}
    </div>
  );
}

/** What a module's number counts: "validation" for Compliance Validation
 *  (each run counts, since 2026-11-09), "report" for the others. */
export function countWord(moduleKey: string, howMany = 1): string {
  const word = moduleKey === 'compliance_validation' ? 'validation' : 'report';
  return howMany === 1 ? word : `${word}s`;
}

/** A whole number from an input, never below `min`. */
export function readWholeNumber(text: string, min: number): number {
  const value = Math.floor(Number(text));
  return Number.isFinite(value) && value >= min ? value : min;
}

// Short letters on each module tile (as in the mockup).
const MODULE_ICON: Record<string, string> = {
  quarterly_report: 'Q', earnings_report: 'E', annual_report: 'A', board_report: 'B', esg_validator: 'ESG',
  compliance_validation: '✓', board_meetings: 'M', leadership: 'L', annual_report_validator: 'AV',
};

// ── − n + ───────────────────────────────────────────────────────────

export function Stepper({ value, onChange, label, min = 1 }: {
  value: number; onChange: (next: number) => void; label: string; min?: number;
}) {
  return (
    <div className="sub-step" onClick={(e) => e.stopPropagation()}>
      <button type="button" aria-label={`Fewer ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <input aria-label={label} inputMode="numeric" value={value} onChange={(e) => onChange(readWholeNumber(e.target.value, min))} />
      <button type="button" aria-label={`More ${label}`} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

// ── A price box (quote offers only) ─────────────────────────────────

/** A price from its input: a number ≥ 0 (blank or not a number = 0). */
export function readPriceBox(text: string): number {
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

/** "× $ [500] / report", "$ [1500] flat" or "$ [3000]": what Spark types on a quote. */
export function PriceBox({ value, onChange, label, before = '$', after }: {
  value: number; onChange: (next: number) => void; label: string; before?: string; after?: string;
}) {
  return (
    <span className="sub-price" onClick={(e) => e.stopPropagation()}>
      {before}
      <input aria-label={label} inputMode="decimal" value={value} onChange={(e) => onChange(readPriceBox(e.target.value))} />
      {after}
    </span>
  );
}

// Quote offers: the typed price per module, and what to do when one changes.
// Left out on the plan editor and the key page: then there are no price boxes.
type ModulePrices = { prices: Record<string, number>; onPriceChange: (moduleKey: string, price: number) => void };

// ── Modules ─────────────────────────────────────────────────────────

// The groups on the Modules card, in order. A module not listed here (Board
// Meetings, Leadership, or one added later) has no group and shows below them.
const MODULE_GROUPS: { name: string; keys: string[] }[] = [
  { name: 'Reports', keys: ['quarterly_report', 'earnings_report', 'annual_report', 'board_report'] },
  { name: 'Validators', keys: ['esg_validator', 'compliance_validation', 'annual_report_validator'] },
];

/** The modules of the catalogue that are in no group, in the catalogue's order. */
function modulesWithoutGroup(catalogue: LicensableModule[]): LicensableModule[] {
  const grouped = MODULE_GROUPS.flatMap((group) => group.keys);
  return catalogue.filter((module) => !grouped.includes(module.key));
}

/** The modules of the catalogue that are in this group, in the catalogue's order. */
function modulesInGroup(catalogue: LicensableModule[], groupName: string): LicensableModule[] {
  const group = MODULE_GROUPS.find((g) => g.name === groupName);
  return catalogue.filter((module) => group?.keys.includes(module.key));
}

/** Names of the groups with at least one module switched on — the groups the card opens with. */
function groupsWithModulesOn(limits: PlanLimits, catalogue: LicensableModule[]): string[] {
  const names: string[] = [];
  for (const group of MODULE_GROUPS) {
    const anyOn = modulesInGroup(catalogue, group.name).some((module) => limits.modules.includes(module.key));
    if (anyOn) names.push(group.name);
  }
  return names;
}

/** The upgrade's lowest report number for a module: the current key's, or 1. */
function lowestReports(module: LicensableModule, floor: PlanLimits | null): number {
  if (!floor || !module.report_type || !floor.modules.includes(module.key)) return 1;
  return floor.report_limits[module.report_type] ?? 1;
}

/** "New" for a module the current key doesn't have, "+2" for more reports, or ''. */
function changeMark(module: LicensableModule, value: PlanLimits, floor: PlanLimits | null): string {
  if (!floor || !value.modules.includes(module.key)) return '';
  if (!floor.modules.includes(module.key)) return 'New';
  if (!module.report_type) return '';
  const before = floor.report_limits[module.report_type] ?? 1;
  const after = value.report_limits[module.report_type] ?? 1;
  return after > before ? `+${after - before}` : '';
}

/** One module tile: name, what it counts, the switch and (when on) the report stepper. */
function ModuleTile({ module, value, onToggle, onSetReports, floor, caption, pricing, captionIsCurrent = false }: {
  module: LicensableModule; value: PlanLimits;
  onToggle: (module: LicensableModule) => void; onSetReports: (reportType: string, count: number) => void;
  floor: PlanLimits | null; caption?: string; pricing?: ModulePrices;
  captionIsCurrent?: boolean;   // the caption is the client's current plan (blue)
}) {
  const on = value.modules.includes(module.key);
  const reports = module.report_type ? value.report_limits[module.report_type] ?? 1 : 0;
  // An upgrade can't remove a module the current key has.
  const locked = !!floor && floor.modules.includes(module.key);
  const mark = changeMark(module, value, floor);
  const toggle = () => { if (!locked) onToggle(module); };
  const accessOnly = pricing ? 'Access only — one flat price' : 'Access only — no report count';
  const unit = countWord(module.key);           // "report" / "validation"
  const units = countWord(module.key, 2);
  const unitsTitle = units.charAt(0).toUpperCase() + units.slice(1);
  const reportCaption = caption ?? (pricing ? `${unitsTitle} × price per ${unit}` : `${unitsTitle} per plan period`);
  const price = pricing?.prices[module.key] ?? 0;
  const setPrice = (next: number) => pricing?.onPriceChange(module.key, next);
  return (
    <div role="switch" aria-checked={on} aria-label={module.label} aria-disabled={locked || undefined} tabIndex={0}
      title={locked ? "An upgrade can't remove a module" : undefined}
      className={`sub-mt ${on ? 'on' : ''} ${locked ? 'locked' : ''}`} onClick={toggle}
      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } }}>
      <div className="sub-mt-ic">{MODULE_ICON[module.key] ?? module.label.slice(0, 1)}</div>
      <div className="sub-mt-tx">
        <div className="sub-mt-nm">
          {module.label}
          {mark && <span className={`sub-mark ${mark === 'New' ? 'new' : 'up'}`}>{mark}</span>}
        </div>
        <div className={`sub-mt-cap ${captionIsCurrent && caption ? 'cur' : ''}`}>{module.report_type ? reportCaption : caption ?? accessOnly}</div>
      </div>
      {!on && <span className="sub-mt-cap">Off</span>}
      {on && module.report_type && (
        <>
          <Stepper value={reports} label={`${module.label} ${units}`} min={lowestReports(module, floor)}
            onChange={(n) => onSetReports(module.report_type as string, n)} />
          {pricing
            ? <PriceBox value={price} onChange={setPrice} label={`${module.label} price per ${unit}`} before="× $" after={`/ ${unit}`} />
            : <span className="sub-step-l">{units}</span>}
        </>
      )}
      {on && !module.report_type && pricing && <PriceBox value={price} onChange={setPrice} label={`${module.label} price`} after="flat" />}
      {on && !module.report_type && !pricing && <span className="sub-incl">Included</span>}
      <div className="sub-sw" />
    </div>
  );
}

/** "Quarterly Report · 4, Compliance Validation" — what's on in a closed group. */
function closedGroupSummary(modules: LicensableModule[], value: PlanLimits): string {
  const parts: string[] = [];
  for (const module of modules) {
    if (!value.modules.includes(module.key)) continue;
    const reports = module.report_type ? value.report_limits[module.report_type] : undefined;
    parts.push(reports != null ? `${module.label} · ${reports}` : module.label);
  }
  return parts.length > 0 ? parts.join(', ') : 'Nothing switched on';
}

/** A group heading that opens and closes, then its tiles (open) or one summary line (closed). */
function ModuleGroup({ name, modules, open, onOpenChange, value, onToggle, onSetReports, floor, captions, pricing, captionsAreCurrent }: {
  name: string; modules: LicensableModule[]; open: boolean; onOpenChange: (open: boolean) => void;
  value: PlanLimits; onToggle: (module: LicensableModule) => void; onSetReports: (reportType: string, count: number) => void;
  floor: PlanLimits | null; captions?: Record<string, string>; pricing?: ModulePrices; captionsAreCurrent: boolean;
}) {
  const onCount = modules.filter((module) => value.modules.includes(module.key)).length;
  return (
    <>
      <button type="button" className={`sub-grp ${open ? '' : 'closed'}`} aria-expanded={open} onClick={() => onOpenChange(!open)}>
        <span className="sub-grp-chev" aria-hidden="true">▼</span>
        <span className="sub-grp-t">{name}</span>
        <span className="sub-grp-line" />
        <span className={`sub-grp-c ${onCount > 0 ? 'some' : ''}`}>{onCount} of {modules.length} on</span>
      </button>
      {open && modules.map((module) => (
        <ModuleTile key={module.key} module={module} value={value} onToggle={onToggle} onSetReports={onSetReports}
          floor={floor} caption={captions?.[module.key]} pricing={pricing} captionIsCurrent={captionsAreCurrent} />
      ))}
      {!open &&<div className="sub-grp-sum">{closedGroupSummary(modules, value)}</div>}
    </>
  );
}

export function ModulesCard({ value, onChange, catalogue, floor = null, captions, subtitle, pricing, openWith = [] }: {
  value: PlanLimits; onChange: (next: PlanLimits) => void; catalogue: LicensableModule[];
  // A caption per module in place of the usual one — key page: "Used 3 this period";
  // quote offers: "Current: 2 reports". Key page: the current key (upgrade), the line under the title.
  floor?: PlanLimits | null; captions?: Record<string, string>; subtitle?: string;
  // Quote offers: a price box on each module that's switched on.
  pricing?: ModulePrices;
  // Quote offers: the client's current modules, so their groups start open and
  // the "Current: 2 reports" captions (shown in blue) can be seen even with nothing switched on.
  openWith?: string[];
}) {
  // Decided once, when the card first shows (the editor waits for the plan to
  // load first). Not remembered between visits, and switching modules on or off
  // never opens or closes a group by itself.
  const [openGroups, setOpenGroups] = useState<string[]>(
    () => groupsWithModulesOn({ ...value, modules: [...value.modules, ...openWith] }, catalogue));

  const setGroupOpen = (name: string, open: boolean) => {
    setOpenGroups(open ? [...openGroups, name] : openGroups.filter((g) => g !== name));
  };

  const toggle = (module: LicensableModule) => {
    const on = value.modules.includes(module.key);
    const modules = on ? value.modules.filter((key) => key !== module.key) : [...value.modules, module.key];
    const report_limits = { ...value.report_limits };
    if (module.report_type) {
      if (on) delete report_limits[module.report_type];
      else report_limits[module.report_type] = 1;       // starts at 1, never unlimited
    }
    onChange({ ...value, modules, report_limits });
  };

  const setReports = (reportType: string, count: number) => {
    onChange({ ...value, report_limits: { ...value.report_limits, [reportType]: Math.max(1, count) } });
  };

  return (
    <div className="card sub-ec">
      <div className="sub-ec-h">
        <div className="sub-ec-ic">▦</div>
        <div>
          <div className="sub-ec-t">Modules</div>
          <div className="sub-ec-s">{subtitle ?? 'Switch a module on · reports start at 1 (never 0 or unlimited)'}</div>
        </div>
        <span className="sub-ec-count">{value.modules.length} of {catalogue.length} on</span>
      </div>
      <div className="sub-mods">
        {MODULE_GROUPS.map((group) => {
          const modules = modulesInGroup(catalogue, group.name);
          if (modules.length === 0) return null;
          return (
            <ModuleGroup key={group.name} name={group.name} modules={modules}
              open={openGroups.includes(group.name)} onOpenChange={(open) => setGroupOpen(group.name, open)}
              value={value} onToggle={toggle} onSetReports={setReports} floor={floor} captions={captions} pricing={pricing}
              captionsAreCurrent={openWith.length > 0} />
          );
        })}
        {modulesWithoutGroup(catalogue).length > 0 && <div className="sub-grp-gap" />}
        {modulesWithoutGroup(catalogue).map((module) => (
          <ModuleTile key={module.key} module={module} value={value} onToggle={toggle} onSetReports={setReports}
            floor={floor} caption={captions?.[module.key]} pricing={pricing} captionIsCurrent={openWith.length > 0} />
        ))}
      </div>
    </div>
  );
}

// ── Users ───────────────────────────────────────────────────────────

/** Quote offers: one price for a whole card, and what to do when it changes. */
type CardPrice = { price: number; onPriceChange: (price: number) => void };

/** The small grey "current 2" next to a number: what the client's current plan has. */
function CurrentHint({ count }: { count?: number }) {
  if (count === undefined) return null;
  return <em className="sub-cur">current {count}</em>;
}

export function UsersCard({ value, onChange, floor, cardPrice, current }: {
  value: PlanLimits; onChange: (next: PlanLimits) => void;
  // Key page only: − n + steppers instead of boxes, never below the current key (null = from 1).
  floor?: PlanLimits | null;
  // Quote offers: one price for all the card's users.
  cardPrice?: CardPrice;
  // Quote offers: the client's current plan, shown as "current 25" next to the number.
  current?: Pick<PlanLimits, 'max_users'>;
}) {
  // The card shows the admin on its own row, so the number typed here is the
  // users BESIDES the admin (10 = 11 people). max_users keeps the total, the
  // admin included — what the backend checks (decided 2026-11-11).
  const others = Math.max(0, value.max_users - 1);
  const setOthers = (count: number) => onChange({ ...value, max_users: count + 1 });
  const lowest = floor ? Math.max(0, floor.max_users - 1) : 0;
  const numberField = floor !== undefined
    ? <Stepper value={others} label="Users" min={lowest} onChange={setOthers} />
    : <input className="inp sub-num" aria-label="Users" inputMode="numeric" value={others}
        onChange={(e) => setOthers(readWholeNumber(e.target.value, 0))} />;
  return (
    // Fills its column, so it ends level with the Modules and Preview cards
    // (the Departments card used to fill the space under it).
    <div className="card sub-ec" style={{ flex: 1 }}>
      <div className="sub-ec-h">
        <div className="sub-ec-ic">👤</div>
        <div>
          <div className="sub-ec-t">Users</div>
          <div className="sub-ec-s">The admin is always included</div>
        </div>
      </div>
      <div className="sub-prow"><span>Admin</span><span className="sub-lock">🔒 1 · included</span></div>
      <div className="sub-prow">
        <span>Users<CurrentHint count={current ? Math.max(0, current.max_users - 1) : undefined} /></span>
        {numberField}
      </div>
      {cardPrice && (
        <div className="sub-tot sub-card-price">
          <span>Price for <b>{others} users</b></span>
          <PriceBox value={cardPrice.price} onChange={cardPrice.onPriceChange} label="Price for the users" />
        </div>
      )}
    </div>
  );
}

// ── Enterprise contact details ──────────────────────────────────────

export function ContactCard({ value, onChange }: { value: PlanContact | null; onChange: (next: PlanContact) => void }) {
  const contact = value ?? {};
  const set = (field: keyof PlanContact, text: string) => onChange({ ...contact, [field]: text });
  return (
    <div className="card sub-ec sub-ent-wide">
      <div className="sub-ec-h">
        <div className="sub-ec-ic">✉</div>
        <div>
          <div className="sub-ec-t">Contact details</div>
          <div className="sub-ec-s">What companies see on the Enterprise card — no modules, users or departments to set</div>
        </div>
      </div>
      <div className="sub-cfields">
        <label className="wide">
          Message on the card
          <textarea className="inp" rows={2} maxLength={300} placeholder="e.g. Every module, sized for your company."
            value={contact.message ?? ''} onChange={(e) => set('message', e.target.value)} />
        </label>
        <label>
          Contact person / team
          <input className="inp" maxLength={120} placeholder="e.g. Centriyon Sales" value={contact.person ?? ''} onChange={(e) => set('person', e.target.value)} />
        </label>
        <label>
          Email
          <input className="inp" type="email" maxLength={254} placeholder="sales@centriyon.com" value={contact.email ?? ''} onChange={(e) => set('email', e.target.value)} />
        </label>
        <label>
          Phone
          <input className="inp" maxLength={40} placeholder="+966 ..." value={contact.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
        </label>
      </div>
      <div className="sub-chint">
        The card&apos;s <b>Contact us</b> button opens <b>Get a quote</b>: the client says what they need, you&apos;re notified, and you make a plan just for them on the Quotes page.
      </div>
    </div>
  );
}
