// The parts of a plan spark_admin fills in on the editor page (and a client in
// "Get a quote"): the Modules, Users and Departments cards, the Enterprise
// contact card, and the small helpers both sides use.
//
// Rules: a module that counts reports always has at least 1 report (no
// unlimited, no 0). The one admin is always included. Each department card has
// 1 HOD and its own users (at least 1); the plan's limits use the totals.
//
// Plan: Centriton/.claude/plans/cloud-subscriptions-v2-redesign.md

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

export function Stepper({ value, onChange, label }: { value: number; onChange: (next: number) => void; label: string }) {
  return (
    <div className="sub-step" onClick={(e) => e.stopPropagation()}>
      <button type="button" aria-label={`Fewer ${label}`} disabled={value <= 1} onClick={() => onChange(Math.max(1, value - 1))}>−</button>
      <input aria-label={label} inputMode="numeric" value={value} onChange={(e) => onChange(readWholeNumber(e.target.value, 1))} />
      <button type="button" aria-label={`More ${label}`} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

// ── Modules ─────────────────────────────────────────────────────────

export function ModulesCard({ value, onChange, catalogue }: {
  value: PlanLimits; onChange: (next: PlanLimits) => void; catalogue: LicensableModule[];
}) {
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
          <div className="sub-ec-s">Switch a module on · reports start at 1 (never 0 or unlimited)</div>
        </div>
        <span className="sub-ec-count">{value.modules.length} of {catalogue.length} on</span>
      </div>
      <div className="sub-mods">
        {catalogue.map((module) => {
          const on = value.modules.includes(module.key);
          const reports = module.report_type ? value.report_limits[module.report_type] ?? 1 : 0;
          return (
            <div key={module.key} role="switch" aria-checked={on} aria-label={module.label} tabIndex={0}
              className={`sub-mt ${on ? 'on' : ''}`} onClick={() => toggle(module)}
              onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(module); } }}>
              <div className="sub-mt-ic">{MODULE_ICON[module.key] ?? module.label.slice(0, 1)}</div>
              <div className="sub-mt-tx">
                <div className="sub-mt-nm">{module.label}</div>
                <div className="sub-mt-cap">{module.report_type ? 'Reports per plan period' : 'Access only — no report count'}</div>
              </div>
              {!on && <span className="sub-mt-cap">Off</span>}
              {on && module.report_type && (
                <>
                  <Stepper value={reports} label={`${module.label} reports`} onChange={(n) => setReports(module.report_type as string, n)} />
                  <span className="sub-step-l">reports</span>
                </>
              )}
              {on && !module.report_type && <span className="sub-incl">Included</span>}
              <div className="sub-sw" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Users ───────────────────────────────────────────────────────────

export function UsersCard({ value, onChange }: { value: PlanLimits; onChange: (next: PlanLimits) => void }) {
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
        <span>Project managers (PMs)</span>
        <input className="inp sub-num" aria-label="Project managers (PMs)" inputMode="numeric" value={value.max_pms}
          onChange={(e) => onChange({ ...value, max_pms: readWholeNumber(e.target.value, 0) })} />
      </div>
      <div className="sub-prow">
        <span>IR users</span>
        <input className="inp sub-num" aria-label="IR users" inputMode="numeric" value={value.max_ir_users}
          onChange={(e) => onChange({ ...value, max_ir_users: readWholeNumber(e.target.value, 0) })} />
      </div>
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

export function DepartmentsCard({ value, onChange, flex = true }: {
  value: PlanLimits; onChange: (next: PlanLimits) => void; flex?: boolean;
}) {
  const sizes = value.department_sizes;
  const setCount = (text: string) => {
    const count = Math.min(MAX_DEPARTMENTS, readWholeNumber(text, 0));
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
        <span>Number of departments</span>
        <input className="inp sub-num" aria-label="Number of departments" inputMode="numeric" value={sizes.length}
          onChange={(e) => setCount(e.target.value)} />
      </div>
      <div className="sub-depts">
        {sizes.length === 0 && <span style={{ fontSize: 11, color: '#9BA3C4' }}>No departments.</span>}
        {sizes.map((users, index) => (
          <div key={index} className="sub-dc">
            <div className="sub-dc-n">Department {index + 1}</div>
            <div className="sub-dc-r"><span>HOD</span><b>1</b></div>
            <div className="sub-dc-r">
              <span>Users</span>
              <Stepper value={users} label={`Department ${index + 1} users`} onChange={(n) => setSize(index, n)} />
            </div>
          </div>
        ))}
      </div>
      <div className="sub-tot">Total <b>{peopleTotal(value)} people</b></div>
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
