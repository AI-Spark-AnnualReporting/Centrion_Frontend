// The company admin's AI credits banner, above every page (cloud only):
// "running low" under the low-balance percent, "AI is paused" at zero or
// below, each with a Buy more link. Hidden on the Usage page itself
// (it says the same thing in full) and for everyone but the company admin.
// Plan: Centriton/.claude/plans/ai-credits.md

import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { license } from '@/lib/api';
import { IS_ON_PREM } from '@/lib/deployment';
import type { LicenseUsage } from '@/types/license';
import { formatCredits } from './creditFormat';

export const AI_CREDITS_PAGE = '/admin-console/usage';

/** The banner's sentence, or null when there's nothing to say. */
export function bannerText(credits: LicenseUsage['ai_credits']): string | null {
  if (!credits) return null;
  if (credits.balance <= 0) {
    return credits.balance < 0
      ? `AI is paused: your credits are ${formatCredits(-credits.balance)} below zero.`
      : 'AI is paused: you have no AI credits left.';
  }
  if (credits.low) return `Your AI credits are running low: ${formatCredits(credits.balance)} left.`;
  return null;
}

export function AiCreditsBanner() {
  const { user } = useAuth();
  const location = useLocation();
  const [credits, setCredits] = useState<LicenseUsage['ai_credits']>(null);
  const shown = !IS_ON_PREM && user?.role === 'admin';

  const refresh = useCallback(() => {
    if (!shown) return;
    license.usage()
      .then((usage) => setCredits(usage?.ai_credits ?? null))
      .catch(() => setCredits(null));
  }, [shown]);

  // Again on every page change and when the tab comes back, so it clears
  // right after a pack is bought.
  useEffect(refresh, [refresh, location.pathname]);
  useEffect(() => {
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refresh]);

  const text = bannerText(credits);
  // Usage and its Buy credits screen already say this in full.
  if (!shown || !text || location.pathname.startsWith(AI_CREDITS_PAGE)) return null;
  const paused = (credits?.balance ?? 0) <= 0;
  return (
    <div role="status" className="card" style={{
      padding: '10px 14px', marginBottom: 12, fontSize: 12, display: 'flex', justifyContent: 'space-between',
      alignItems: 'center', gap: 12, background: paused ? '#FEF2F2' : '#FFF7ED', color: paused ? '#B91C1C' : '#B45309',
    }}>
      <span><b>{text}</b></span>
      <Link to={AI_CREDITS_PAGE} className="btn bs">Buy more</Link>
    </div>
  );
}
