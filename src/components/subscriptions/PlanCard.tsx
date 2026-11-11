// One pricing card, the same on spark_admin's Subscriptions page, the editor's
// Preview and the client's Subscription page: a coloured name tab, the price
// for the plan's duration, ✓ / ✗ per module, the people lines — or, for
// Enterprise, "Let's talk" and the contact details.
//
// Only the client gets a button (Buy now / Contact us). spark_admin's cards are
// clickable instead and show Edit / Delete when selected.
//
// Plan: Centriton/.claude/plans/cloud-subscriptions-v2-redesign.md

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { LicensableModule } from '@/types/license';
import type { Duration, PlanContact, PlanLimits } from '@/types/subscription';
import { countWord, departmentsSummary, durationPer, usersSummary } from './PlanFields';
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
              <span>{module.label}{on && reports != null ? ` · ${reports} ${countWord(module.key, reports)}` : ''}</span>
            </li>
          );
        })}
      </ul>
      <ul>
        <li><span className="sub-ic sub-ok">✓</span><span>1 admin (included)</span></li>
        <li>
          <span className="sub-ic sub-ok">✓</span>
          <span>{usersSummary(plan)}</span>
        </li>
        <li><span className="sub-ic sub-ok">✓</span><span>{departmentsSummary(plan)}</span></li>
      </ul>
    </>
  );
}

// ── One row of cards that never makes the page scroll ───────────────

const CARD_STEP = 256;   // a card's width + the gap between cards (used before cards are measured)
const AUTO_SLIDE_MS = 4000;          // the slider moves one card this often
const QUIET_AFTER_USE_MS = 8000;     // ...but waits this long after someone moves it

/** True when the computer asks for less motion (then there's no auto-slide). */
function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

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

/** The cards in one row, all the same height, as a slider (approved mockup:
 *  plan-slider-mockup.html). They never scroll up or down: on a short screen
 *  they shrink to fit — or, past 15 modules, stay full size and their module
 *  lists scroll inside. More cards than fit across: ‹ › arrows on the edges,
 *  a soft fade where more are hidden, dots under them (click to jump), and the
 *  row always comes to rest on a card (scroll snap). It also slides itself
 *  every 4 seconds, back to the first card after the last, but pauses while
 *  the mouse is over it, for 8 seconds after someone moves it, while `paused`
 *  (e.g. a card is selected), and when the computer asks for reduced motion. */
export function CardStrip({ children, paused = false }: { children: ReactNode; paused?: boolean }) {
  const strip = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const [canGoLeft, setCanGoLeft] = useState(false);
  const [canGoRight, setCanGoRight] = useState(false);
  const [activeCard, setActiveCard] = useState(0);
  const [cardsInView, setCardsInView] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [quiet, setQuiet] = useState(false);
  const [cycle, setCycle] = useState(0);            // restarts the active dot's fill
  const quietTimer = useRef<number | undefined>(undefined);
  const cardCount = Children.count(children);
  const overflow = canGoLeft || canGoRight;

  /** Arrows, the active dot and how many cards are in view, from where the row is. */
  const updatePosition = useCallback(() => {
    const box = strip.current;
    const cards = row.current;
    if (!box || !cards) return;
    setCanGoLeft(box.scrollLeft > 4);
    setCanGoRight(box.scrollLeft + box.clientWidth < box.scrollWidth - 4);
    const view = box.getBoundingClientRect();
    const middle = view.left + view.width / 2;
    let nearest = 0;
    let nearestDistance = Infinity;
    let inView = 0;
    (Array.from(cards.children) as HTMLElement[]).forEach((card, index) => {
      const rect = card.getBoundingClientRect();
      const distance = Math.abs(rect.left + rect.width / 2 - middle);
      if (distance < nearestDistance) { nearestDistance = distance; nearest = index; }
      if (rect.right > view.left + 4 && rect.left < view.right - 4) inView += 1;
    });
    setActiveCard(nearest);
    setCardsInView(inView);
  }, []);

  // CSS zoom on the inner row shrinks the cards and their layout together (so
  // the sideways scroll width stays right). The outer strip keeps the space
  // above the dots, which is what the cards must fit. Measured at full size, then set.
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
    updatePosition();
  }, [updatePosition]);

  // The dots appearing or going away changes the height there is, so fit again.
  useEffect(() => {
    fitHeight();
    window.addEventListener('resize', fitHeight);
    return () => window.removeEventListener('resize', fitHeight);
  }, [fitHeight, children, overflow]);

  /** The real distance from one card to the next (cards may be zoomed). */
  const cardStep = (): number => {
    const cards = row.current?.children;
    if (!cards || cards.length < 2) return CARD_STEP;
    return cards[1].getBoundingClientRect().left - cards[0].getBoundingClientRect().left;
  };

  const slideBy = (direction: number) => strip.current?.scrollBy?.({ left: direction * cardStep(), behavior: 'smooth' });

  const slideTo = (index: number) => {
    const box = strip.current;
    const card = row.current?.children[index] as HTMLElement | undefined;
    if (!box || !card) return;
    const view = box.getBoundingClientRect();
    const rect = card.getBoundingClientRect();
    const left = box.scrollLeft + rect.left - view.left - (view.width - rect.width) / 2;
    box.scrollTo?.({ left, behavior: 'smooth' });
  };

  /** Someone moved the row: no auto-slide for the next 8 seconds. */
  const markMoved = () => {
    setQuiet(true);
    window.clearTimeout(quietTimer.current);
    quietTimer.current = window.setTimeout(() => setQuiet(false), QUIET_AFTER_USE_MS);
  };
  useEffect(() => () => window.clearTimeout(quietTimer.current), []);

  const autoSlideOff = paused || hovering || quiet || !overflow || prefersReducedMotion();
  useEffect(() => {
    if (autoSlideOff) return;
    const timer = window.setTimeout(() => {
      const box = strip.current;
      if (box && box.scrollLeft + box.clientWidth >= box.scrollWidth - 4) box.scrollTo?.({ left: 0, behavior: 'smooth' });
      else slideBy(1);
      setCycle((n) => n + 1);
    }, AUTO_SLIDE_MS);
    return () => window.clearTimeout(timer);
  // slideBy reads the refs at the moment it runs; cycle restarts the wait after each slide.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSlideOff, cycle]);

  const dots = [];
  for (let index = 0; index < cardCount; index++) {
    const on = index === activeCard;
    dots.push(
      <button key={`${index}-${on ? cycle : 0}`} type="button" aria-label={`Go to plan ${index + 1}`} aria-current={on || undefined}
        className={`sub-dot ${on ? 'on' : ''} ${on && !autoSlideOff ? 'timing' : ''}`}
        onClick={() => { markMoved(); slideTo(index); }} />,
    );
  }

  return (
    <div className="sub-strip-wrap" onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}>
      <div className="sub-strip-view">
        <button type="button" className={`sub-arrow left ${canGoLeft ? '' : 'hide'}`} aria-label="Previous plans"
          tabIndex={canGoLeft ? 0 : -1} onClick={() => { markMoved(); slideBy(-1); }}>‹</button>
        <div ref={strip} className={`sub-strip ${canGoLeft ? 'fade-left' : ''} ${canGoRight ? 'fade-right' : ''}`} onScroll={updatePosition}
          onWheel={markMoved} onTouchStart={markMoved}>
          <div ref={row} className="sub-strip-row">{children}</div>
        </div>
        <button type="button" className={`sub-arrow right ${canGoRight ? '' : 'hide'}`} aria-label="More plans"
          tabIndex={canGoRight ? 0 : -1} onClick={() => { markMoved(); slideBy(1); }}>›</button>
      </div>
      {overflow && (
        <>
          <div className="sub-dots">{dots}</div>
          <div className="sub-strip-count">{cardsInView} of {cardCount} plans in view</div>
        </>
      )}
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

export function PlanCard({ plan, position, catalogue, flag, button, selected, current, onClick, actions, enterpriseTab }: {
  plan: CardPlan;
  position: number;              // picks the tab colour
  catalogue: LicensableModule[];
  flag?: ReactNode;              // "Your plan" / "Made for you" / "2 companies"
  button?: ReactNode;            // client only: Buy now / Contact us
  selected?: boolean;
  current?: boolean;
  onClick?: () => void;          // spark_admin: select the card
  actions?: ReactNode;           // spark_admin: Edit / Delete, when selected
  enterpriseTab?: boolean;       // an Enterprise offer (a priced quote): the dark Enterprise tab
}) {
  const enterprise = plan.duration === 'enterprise';
  const colour = enterprise || enterpriseTab ? ENTERPRISE_COLOUR : TAB_COLOURS[position % TAB_COLOURS.length];
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
