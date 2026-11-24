# Admin Console → Settings (Subscription | Usage | Billing tabs)

**Date:** 2026-11-24
**Status:** Built and tested, not committed
**Repo:** Centrion_Frontend only (no backend, no DB change)

## What changed
- Sidebar → Admin Console: **Subscription** and **Usage** became one item, **Settings**
  (company admin, cloud only, as before). It stays highlighted on every Settings page,
  including checkout and Buy credits.
- Each Settings page starts with "Settings" and the tabs **Subscription | Usage | Billing**.
- **Billing** (new, `/admin-console/billing`): the Payment box and the Invoices table, moved
  unchanged from Usage. **Usage** keeps the plan card and AI credits.
- Each tab keeps its own address, so existing links still work (`/admin-console/subscription`,
  `/admin-console/usage`, checkout, buy-credits, the old `/admin-console/ai-credits` redirect).

## Files
- `src/components/admin/SettingsTabs.tsx` (new): title + tabs; `isSettingsPath` for the sidebar.
- `src/pages/admin/BillingPage.tsx` (new): Payment + Invoices.
- `src/pages/admin/UsagePage.tsx`: tabs at the top; Payment + Invoices removed; `Section` exported.
- `src/pages/admin/SubscriptionPage.tsx`: tabs at the top.
- `src/App.tsx`: `/admin-console/billing` route (admin, cloud).
- `src/components/layout/Sidebar.tsx`: the Settings item (`activeWhen: isSettingsPath`).
- Tests: `usage-page.test.tsx` (Usage, Billing, tabs), `spark-sidebar.test.tsx` (Settings item).

## Notes
- The Subscription page fits the screen; the tab row takes some height, so the cards shrink a
  little to fit (the slider's existing fit-to-height).
- On-prem: none of these pages exist, so Settings is hidden too.

## Usage tab look (2026-11-24)
- The plan card is frosted glass over faint Centriyon-indigo glows (`.glass-stage`, `src/index.css`).
- Usage: full width (no 1040px limit). It scrolls normally.
- Billing: full width and one screen (`AppLayout` fit pages include `/admin-console/billing`):
  Payment at the top, Invoices fills the rest; its rows scroll inside the card under a header
  that stays put, the pager stays at the bottom (`.billing-invoices*` in `src/index.css`).
- A one-screen, branded version (logo watermark, cards side by side) was tried and reverted.
