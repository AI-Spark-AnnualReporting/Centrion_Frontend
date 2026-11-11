// The parts of a plan spark_admin fills in on the editor page (and a client in
// "Get a quote"): the Modules, Users and Departments cards, the Enterprise
// contact card, and the small helpers both sides use. The License key page
// uses the same cards; for an upgrade it passes `floor` (the current key), so
// nothing can go below it and each change gets a small mark (+2, New).
//
// Rules: a module that counts reports always has at least 1 report (no
// unlimited, no 0). The one admin is always included. Each department card has
// 1 HOD and its own users (at least 1); the plan's limits use the totals.
//
// Plan: Centriton/.claude/plans/cloud-subscriptions-v2-redesign.md

import { useState } from 'react';
import type { LicensableModule } from '@/types/license';
import type { Duration, PlanContact, PlanLimits } from '@/types/subscription';
import './subscriptions.css';

export const EMPTY_LIMITS: PlanLimits = {
  modules: [],
  report_limits: {},
  max_pms: 1,
  max_ir_users: 1,
  department_sizes: [1],
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

/** All department users, added up from the cards: [5, 2, 1] → 8. */
export function departmentUsersTotal(limits: PlanLimits): number {
  let total = 0;
  for (const size of limits.department_sizes) total += size;
  return total;
}

/** Everyone the plan allows, the one admin included: 1 + PMs + IR + HODs + department users. */
export function peopleTotal(limits: PlanLimits): number {
  return 1 + limits.max_pms + limits.max_ir_users + limits.department_sizes.length + departmentUsersTotal(limits);
}

/** "2 project managers · 6 IR users" (the plan card's words) */
export function usersSummary(limits: Pick<PlanLimits, 'max_pms' | 'max_ir_users'>): string {
  const pms = `${limits.max_pms} project manager${limits.max_pms === 1 ? '' : 's'}`;
  return `${pms} · ${limits.max_ir_users} IR user${limits.max_ir_users === 1 ? '' : 's'}`;
}

/** "3 departments · 1 HOD each · 8 department users" */
export function departmentsSummary(limits: PlanLimits): string {
  const count = limits.department_sizes.length;
  const users = departmentUsersTotal(limits);
  return `${count} department${count === 1 ? '' : 's'} · 1 HOD each · ${users} department user${users === 1 ? '' : 's'}`;
}

/** "5 PM · 2 IR · 3 departments · 1 HOD each · 12 department users" */
export function peopleSummary(limits: PlanLimits): string {
  return `${limits.max_pms} PM · ${limits.max_ir_users} IR · ${departmentsSummary(limits)}`;
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
  // Key page only: − n + steppers instead of boxes, never below the current key (null = from 0).
  floor?: PlanLimits | null;
  // Quote offers: one price for all the card's users (the admin is free).
  cardPrice?: CardPrice;
  // Quote offers: the client's current plan, shown as "current 2" next to each number.
  current?: Pick<PlanLimits, 'max_pms' | 'max_ir_users'>;
}) {
  const useSteppers = floor !== undefined;
  const numberField = (label: string, field: 'max_pms' | 'max_ir_users') => {
    if (useSteppers) {
      return <Stepper value={value[field]} label={label} min={floor ? floor[field] : 0}
        onChange={(n) => onChange({ ...value, [field]: n })} />;
    }
    return <input className="inp sub-num" aria-label={label} inputMode="numeric" value={value[field]}
      onChange={(e) => onChange({ ...value, [field]: readWholeNumber(e.target.value, 0) })} />;
  };
  return (
    <div className="card sub-ec">
      <div className="sub-ec-h">
        <div className="sub-ec-ic">👤</div>
        <div>
          <div className="sub-ec-t">Users</div>
          <div className="sub-ec-s">The admin is always included</div>
        </div>
      </div>
      <div className="sub-prow"><span>Admin</span><span className="sub-lock">🔒 1 · included</span></div>
      <div className="sub-prow">
        <span>Project managers (PMs)<CurrentHint count={current?.max_pms} /></span>
        {numberField('Project managers (PMs)', 'max_pms')}
      </div>
      <div className="sub-prow">
        <span>IR users<CurrentHint count={current?.max_ir_users} /></span>
        {numberField('IR users', 'max_ir_users')}
      </div>
      {cardPrice && (
        <div className="sub-tot sub-card-price">
          <span>Price for <b>{value.max_pms + value.max_ir_users} users</b></span>
          <PriceBox value={cardPrice.price} onChange={cardPrice.onPriceChange} label="Price for the users" />
        </div>
      )}
    </div>
  );
}

// ── Departments ─────────────────────────────────────────────────────

const MAX_DEPARTMENTS = 50;

/** The cards for a new number of departments: kept cards stay as they are,
 *  new ones start at 1 user, extra ones are removed from the end. */
export function resizeDepartments(sizes: number[], count: number): number[] {
  const next = sizes.slice(0, count);
  while (next.length < count) next.push(1);
  return next;
}

export function DepartmentsCard({ value, onChange, flex = true, floor = null, cardPrice, current }: {
  value: PlanLimits; onChange: (next: PlanLimits) => void; flex?: boolean;
  // Key page, upgrade: the current key. Departments can't go below its number,
  // and all department users together can't go below its total.
  floor?: PlanLimits | null;
  // Quote offers: one price for all the departments, their HODs and users.
  cardPrice?: CardPrice;
  // Quote offers: the client's current plan's department sizes ("current 4", "current 3").
  current?: number[];
}) {
  const sizes = value.department_sizes;
  const fewestDepartments = floor ? floor.department_sizes.length : 0;
  const usersBefore = floor ? departmentUsersTotal(floor) : 0;
  const tooFewUsers = !!floor && departmentUsersTotal(value) < usersBefore;
  const setCount = (text: string) => {
    const count = Math.min(MAX_DEPARTMENTS, Math.max(fewestDepartments, readWholeNumber(text, 0)));
    onChange({ ...value, department_sizes: resizeDepartments(sizes, count) });
  };
  const setSize = (index: number, users: number) => {
    const next = [...sizes];
    next[index] = Math.max(1, users);
    onChange({ ...value, department_sizes: next });
  };

  return (
    <div className="card sub-ec" style={flex ? { flex: 1, minHeight: 0 } : undefined}>
      <div className="sub-ec-h">
        <div className="sub-ec-ic">▤</div>
        <div>
          <div className="sub-ec-t">Departments</div>
          <div className="sub-ec-s">Each has 1 HOD and at least 1 user</div>
        </div>
      </div>
      <div className="sub-prow">
        <span>Number of departments<CurrentHint count={current?.length} /></span>
        <input className="inp sub-num" aria-label="Number of departments" inputMode="numeric" value={sizes.length}
          onChange={(e) => setCount(e.target.value)} />
      </div>
      <div className="sub-depts">
        {sizes.length === 0 && <span style={{ fontSize: 11, color: '#9BA3C4' }}>No departments.</span>}
        {sizes.map((users, index) => (
          <div key={index} className="sub-dc">
            <div className="sub-dc-n">Department {index + 1}<CurrentHint count={current?.[index]} /></div>
            <div className="sub-dc-r"><span>HOD</span><b>1</b></div>
            <div className="sub-dc-r">
              <span>Users</span>
              <Stepper value={users} label={`Department ${index + 1} users`} onChange={(n) => setSize(index, n)} />
            </div>
          </div>
        ))}
      </div>
      {cardPrice ? (
        <div className="sub-tot sub-card-price">
          <span>Price for <b>{sizes.length} departments</b> · {sizes.length} HODs · {departmentUsersTotal(value)} users</span>
          <PriceBox value={cardPrice.price} onChange={cardPrice.onPriceChange} label="Price for the departments" />
        </div>
      ) : (
        <div className="sub-tot">
          Total <b>{peopleTotal(value)} people</b>
          {floor && <span style={{ color: '#9BA3C4' }}> · now {peopleTotal(floor)}</span>}
        </div>
      )}
      {tooFewUsers && <div className="sub-err" role="alert">An upgrade can&apos;t lower department users ({usersBefore} now).</div>}
      {floor && !tooFewUsers && <div className="sub-hint">An upgrade can add departments and users, never remove them.</div>}
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
