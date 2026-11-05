// One pricing card, the same on spark_admin's Subscriptions page, the editor's
// Preview and the client's Subscription page: a coloured name tab, the price
// for the plan's duration, ✓ / ✗ per module, the people lines — or, for
// Enterprise, "Let's talk" and the contact details.
//
// Only the client gets a button (Buy now / Contact us). spark_admin's cards are
// clickable instead and show Edit / Delete when selected.
//
// Plan: Centriton/.claude/plans/cloud-subscriptions-v2-redesign.md

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
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
      {/* The module lines on their own: past 15 modules this list scrolls inside the card. */}
      <ul className="sub-pc-mods">
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
      </ul>
      <ul>
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

// ── One row of cards that never makes the page scroll ───────────────

const CARD_STEP = 256;   // a card's width + the gap between cards

// Room the strip keeps above (the cards' name tabs) and below (Edit / Delete bar).
const STRIP_PADDING_Y = 22 + 28;
// Up to this many modules the cards shrink a little to fit; past it the text
// would get too small, so they stay full size and the module list scrolls.
export const SCROLL_AFTER_MODULES = 15;
const MIN_LIST_HEIGHT = 120;

/** The module list's height when it scrolls: what's left after taking off
 *  how much the card is too tall (never below a readable minimum). */
export function scrollingListHeight(listHeight: number, cardNeeds: number, heightThereIs: number): number {
  return Math.max(MIN_LIST_HEIGHT, listHeight - (cardNeeds - heightThereIs));
}

/** How much to shrink the cards so the tallest fits the height there is
 *  (1 = full size; never bigger than full size). */
export function fitScale(available: number, tallestCard: number): number {
  if (available <= 0 || tallestCard <= 0) return 1;
  return Math.min(1, available / (tallestCard + STRIP_PADDING_Y));
}

/** The cards in one row, all the same height. They never scroll up or down:
 *  on a short screen they shrink to fit — or, past 15 modules, stay full size
 *  and their module lists scroll inside. If they don't all fit across, the row
 *  scrolls sideways inside the band, with ‹ › arrows. The page never grows. */
export function CardStrip({ children }: { children: ReactNode }) {
  const strip = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const [canGoLeft, setCanGoLeft] = useState(false);
  const [canGoRight, setCanGoRight] = useState(false);

  const updateArrows = useCallback(() => {
    const el = strip.current;
    if (!el) return;
    setCanGoLeft(el.scrollLeft > 4);
    setCanGoRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  // CSS zoom on the inner row shrinks the cards and their layout together (so
  // the sideways scroll width stays right). The outer strip keeps the band's
  // height, which is what the cards must fit. Measured at full size, then set.
  const fitHeight = useCallback(() => {
    const box = strip.current;
    const cards = row.current;
    if (!box || !cards) return;
    const lists = Array.from(cards.querySelectorAll<HTMLElement>('.sub-pc-mods'));
    cards.style.zoom = '1';
    for (const list of lists) { list.style.maxHeight = ''; list.classList.remove('scroll'); }

    let tallest = 0;
    for (const card of Array.from(cards.children) as HTMLElement[]) tallest = Math.max(tallest, card.offsetHeight);
    const needs = tallest + STRIP_PADDING_Y;
    const there = box.clientHeight;
    const moduleCount = lists[0]?.children.length ?? 0;

    if (moduleCount > SCROLL_AFTER_MODULES && there > 0 && needs > there) {
      // Same height for every list, so the cards stay equal.
      let tallestList = 0;
      for (const list of lists) tallestList = Math.max(tallestList, list.offsetHeight);
      const height = scrollingListHeight(tallestList, needs, there);
      for (const list of lists) { list.style.maxHeight = `${height}px`; list.classList.add('scroll'); }
    } else {
      cards.style.zoom = String(fitScale(there, tallest));
    }
    updateArrows();
  }, [updateArrows]);

  useEffect(() => {
    fitHeight();
    window.addEventListener('resize', fitHeight);
    return () => window.removeEventListener('resize', fitHeight);
  }, [fitHeight, children]);

  const move = (direction: number) => strip.current?.scrollBy({ left: direction * CARD_STEP, behavior: 'smooth' });

  return (
    <div className="sub-strip-wrap">
      {canGoLeft && <button type="button" className="sub-arrow left" aria-label="Earlier plans" onClick={() => move(-1)}>‹</button>}
      <div ref={strip} className="sub-strip" onScroll={updateArrows}>
        <div ref={row} className="sub-strip-row">{children}</div>
      </div>
      {canGoRight && <button type="button" className="sub-arrow right" aria-label="More plans" onClick={() => move(1)}>›</button>}
    </div>
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
  actions?: ReactNode;           // spark_admin: Edit / Delete, when selected
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
      {button ? <div className="sub-pc-line sub-pc-bottom" /> : <div className="sub-pc-gap sub-pc-bottom" />}
      {button}
      {actions && <div className="sub-pc-actions" onClick={(e) => e.stopPropagation()}>{actions}</div>}
    </div>
  );
}
