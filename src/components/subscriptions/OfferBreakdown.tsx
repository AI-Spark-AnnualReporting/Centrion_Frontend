// A quote's offer, priced: "How the price adds up" (each module, Users (the
// admin included), then the total — or "Added up" + "Your price" when
// spark_admin typed its own total). Shown on spark_admin's offer page
// (Preview) and in the Send offer popup's email preview. The same sums and
// words as the backend's offer email (subscriptions.offer_added_up, offer_rows).
//
// Plan: Centriton/.claude/plans/quote-offers.md

import type { LicensableModule } from '@/types/license';
import type { OfferPrices, PaidDuration, PlanLimits } from '@/types/subscription';
import { countWord } from './PlanFields';

export const NO_PRICES: OfferPrices = { modules: {}, users: 0 };

// "per year" etc., as the offer's length.
const PER: Record<PaidDuration, string> = { quarterly: 'per quarter', half_year: 'per 6 months', yearly: 'per year' };

/** '$8,400' (cents only when there are some). */
export function dollars(amount: number): string {
  return `$${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

/** One module's part: reports × price per report, or its flat price. */
export function moduleAmount(module: LicensableModule, limits: PlanLimits, prices: OfferPrices): number {
  const price = prices.modules[module.key] ?? 0;
  if (!module.report_type) return price;
  return (limits.report_limits[module.report_type] ?? 1) * price;
}

/** Every module that's switched on, plus the Users card price. */
export function offerAddedUp(limits: PlanLimits, prices: OfferPrices, catalogue: LicensableModule[]): number {
  let total = prices.users;
  for (const module of catalogue) {
    if (limits.modules.includes(module.key)) total += moduleAmount(module, limits, prices);
  }
  return Math.round(total * 100) / 100;
}

/** "Quarterly Report · 3 reports × $500", or the name alone for a flat-price
 *  module — the same words as the offer email (backend offer_rows). */
function moduleLabel(module: LicensableModule, limits: PlanLimits, prices: OfferPrices): string {
  if (!module.report_type) return module.label;
  const reports = limits.report_limits[module.report_type] ?? 1;
  return `${module.label} · ${reports} ${countWord(module.key, reports)} × ${dollars(prices.modules[module.key] ?? 0)}`;
}

export function OfferBreakdown({ limits, prices, price, duration, catalogue }: {
  limits: PlanLimits;
  prices: OfferPrices;
  price: number;            // what the client pays
  duration: PaidDuration;
  catalogue: LicensableModule[];
}) {
  const addedUp = offerAddedUp(limits, prices, catalogue);
  const chosen = catalogue.filter((module) => limits.modules.includes(module.key));
  return (
    <div className="sub-brk">
      <div className="sub-brk-t">How the price adds up</div>
      {chosen.map((module) => (
        <div key={module.key} className="sub-ln">
          <span>{moduleLabel(module, limits, prices)}</span><span>{dollars(moduleAmount(module, limits, prices))}</span>
        </div>
      ))}
      <div className="sub-ln">
        <span>Users · {limits.max_users} (admin included)</span>
        <span>{dollars(prices.users)}</span>
      </div>
      {price !== addedUp ? (
        <>
          <div className="sub-ln"><span>Added up</span><span>{dollars(addedUp)}</span></div>
          <div className="sub-ln total"><span>Your price {PER[duration]}</span><span>{dollars(price)}</span></div>
        </>
      ) : (
        <div className="sub-ln total"><span>Total {PER[duration]}</span><span>{dollars(price)}</span></div>
      )}
    </div>
  );
}
