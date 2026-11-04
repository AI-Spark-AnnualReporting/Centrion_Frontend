// One pricing card, the same on spark_admin's Subscriptions page, the editor's
// Preview and the client's Subscription page: a coloured name tab, the price
// for the plan's duration, ✓ / ✗ per module, the people lines — or, for
// Enterprise, "Let's talk" and the contact details.
//
// Only the client gets a button (Buy now / Contact us). spark_admin's cards are
// clickable instead and show Edit / Archive / Delete when selected.
//
// Plan: Centriton/.claude/plans/cloud-subscriptions-v2-redesign.md

import type { ReactNode } from 'react';
import type { LicensableModule } from '@/types/license';
import type { Duration, PlanContact, PlanLimits } from '@/types/subscription';
import { departmentsSummary, durationPer } from './PlanFields';
import './subscriptions.css';

// Tab colours by position (blue, teal, indigo); Enterprise is dark.
const TAB_COLOURS = ['#4F7BE8', '#14B8A6', '#3535B5'];
const ENTERPRISE_COLOUR = '#1A1D2E';

export interface CardPlan extends PlanLimits {
  name: string;
  duration: Duration;
  price: number | null;
  contact: PlanContact | null;
}

function EnterpriseBody({ contact }: { contact: PlanContact | null }) {
  const rows: [string, string][] = [];
  if (contact?.person) rows.push(['👤', contact.person]);
  if (contact?.email) rows.push(['✉', contact.email]);
  if (contact?.phone) rows.push(['☎', contact.phone]);
  return (
    <>
      <div className="sub-pc-ent"><b>Let&apos;s talk</b>{contact?.message || 'Tell us what you need.'}</div>
      {rows.length > 0 && (
        <>
          <div className="sub-pc-line" />
          <div className="sub-pc-contact">
            {rows.map(([icon, text]) => <div key={icon}><span>{icon}</span><span>{text}</span></div>)}
          </div>
        </>
      )}
    </>
  );
}

function PricedBody({ plan, catalogue }: { plan: CardPlan; catalogue: LicensableModule[] }) {
  const per = durationPer(plan.duration).split(' ');
  return (
    <>
      <div className="sub-pc-price">
        <span className="sub-pc-cur">$</span>
        <b>{plan.price == null ? '—' : Number(plan.price).toLocaleString('en-US')}</b>
        <small>{per[0]}<br />{per.slice(1).join(' ')}</small>
      </div>
      <div className="sub-pc-line" />
      <ul>
        {catalogue.map((module) => {
          const on = plan.modules.includes(module.key);
          const reports = module.report_type ? plan.report_limits[module.report_type] : undefined;
          return (
            <li key={module.key} className={on ? '' : 'off'}>
              <span className={`sub-ic ${on ? 'sub-ok' : 'sub-no'}`}>{on ? '✓' : '✗'}</span>
              <span>{module.label}{on && reports != null ? ` · ${reports} report${reports === 1 ? '' : 's'}` : ''}</span>
            </li>
          );
        })}
        <li><span className="sub-ic sub-ok">✓</span><span>1 admin (included)</span></li>
        <li>
          <span className="sub-ic sub-ok">✓</span>
          <span>{plan.max_pms} project manager{plan.max_pms === 1 ? '' : 's'} · {plan.max_ir_users} IR user{plan.max_ir_users === 1 ? '' : 's'}</span>
        </li>
        <li><span className="sub-ic sub-ok">✓</span><span>{departmentsSummary(plan)}</span></li>
      </ul>
    </>
  );
}

// ── All / Quarterly / Half year / 1 year (Enterprise always shows) ───

export type DurationFilter = 'all' | 'quarterly' | 'half_year' | 'yearly';

const FILTERS: { key: DurationFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'quarterly', label: 'Quarterly' },
  { key: 'half_year', label: 'Half year' },
  { key: 'yearly', label: '1 year' },
];

export function matchesDuration(plan: { duration: Duration }, filter: DurationFilter): boolean {
  return filter === 'all' || plan.duration === filter || plan.duration === 'enterprise';
}

export function DurationTabs({ value, onChange }: { value: DurationFilter; onChange: (next: DurationFilter) => void }) {
  return (
    <div className="tabs" role="tablist" aria-label="Duration">
      {FILTERS.map((filter) => (
        <button key={filter.key} type="button" role="tab" aria-selected={value === filter.key}
          className={`tab ${value === filter.key ? 'act' : ''}`} onClick={() => onChange(filter.key)}>
          {filter.label}
        </button>
      ))}
    </div>
  );
}

export function PlanCard({ plan, position, catalogue, flag, button, selected, current, onClick, actions }: {
  plan: CardPlan;
  position: number;              // picks the tab colour
  catalogue: LicensableModule[];
  flag?: ReactNode;              // "Your plan" / "Made for you" / "2 companies"
  button?: ReactNode;            // client only: Buy now / Contact us
  selected?: boolean;
  current?: boolean;
  onClick?: () => void;          // spark_admin: select the card
  actions?: ReactNode;           // spark_admin: Edit / Archive / Delete, when selected
}) {
  const enterprise = plan.duration === 'enterprise';
  const colour = enterprise ? ENTERPRISE_COLOUR : TAB_COLOURS[position % TAB_COLOURS.length];
  const classes = ['sub-pc'];
  if (onClick) classes.push('clickable');
  if (selected) classes.push('sel');
  if (current) classes.push('current');

  return (
    <div className={classes.join(' ')} onClick={onClick} role={onClick ? 'button' : undefined}
      aria-pressed={onClick ? !!selected : undefined} aria-label={onClick ? plan.name : undefined}>
      <div className="sub-pc-tab" style={{ background: colour }}>{plan.name || 'Plan name'}</div>
      {flag && <span className="sub-pc-flag">{flag}</span>}
      {enterprise ? <EnterpriseBody contact={plan.contact} /> : <PricedBody plan={plan} catalogue={catalogue} />}
      {button ? <div className="sub-pc-line" /> : <div className="sub-pc-gap" />}
      {button}
      {actions && <div className="sub-pc-actions" onClick={(e) => e.stopPropagation()}>{actions}</div>}
    </div>
  );
}
