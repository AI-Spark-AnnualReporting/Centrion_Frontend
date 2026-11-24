// Admin Console → Settings: the title and the Subscription | Usage | Billing
// tabs shown at the top of each of those three pages. Each tab keeps its own
// address, so older links (banners, "Buy more", checkout) still land on the
// right tab. Plan: Centrion_Frontend/.claude/plans/admin-settings-tabs.md

import { useLocation, useNavigate } from 'react-router-dom';

export const SETTINGS_TABS = [
  { label: 'Subscription', path: '/admin-console/subscription' },
  { label: 'Usage', path: '/admin-console/usage' },
  { label: 'Billing', path: '/admin-console/billing' },
];

/** Is this address one of the Settings pages (a tab, or a page under one)? */
export function isSettingsPath(pathname: string): boolean {
  return SETTINGS_TABS.some((tab) => pathname === tab.path || pathname.startsWith(`${tab.path}/`));
}

/** "Settings" and its tabs; the tab for the current address is selected. */
export function SettingsTabs() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>Settings</div>
      <div className="tabs" role="tablist" aria-label="Settings" style={{ alignSelf: 'flex-start', marginBottom: 0 }}>
        {SETTINGS_TABS.map((tab) => {
          const selected = location.pathname === tab.path || location.pathname.startsWith(`${tab.path}/`);
          return (
            <button key={tab.path} type="button" role="tab" aria-selected={selected}
              className={`tab ${selected ? 'act' : ''}`} onClick={() => navigate(tab.path)}>
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
