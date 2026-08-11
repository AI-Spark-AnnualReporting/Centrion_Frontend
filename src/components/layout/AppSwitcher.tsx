// Lets a user with access to both apps jump from Centriyon over to the other
// workspace app (spark_studio). Only ever renders here — default_app is
// always centriton_dashboard when a user has both, so this component never
// needs to exist on the spark_studio side (a separate repo).
//
// Placement/copy/icon are a first draft — check in with the user before
// treating them as final.

import { useAuth } from '@/context/AuthContext';
import { redirectToApp } from '@/lib/appRouting';
import type { AppKey } from '@/types/auth';

const APP_LABELS: Record<AppKey, string> = {
  centriton_dashboard: 'Centriton',
  spark_studio: 'Annual Report',
};

export function AppSwitcher() {
  const { user } = useAuth();
  const apps = user?.apps ?? [];

  if (apps.length <= 1) return null;

  const other = apps.find((a) => a !== 'centriton_dashboard');
  if (!other) return null;

  return (
    <button
      type="button"
      onClick={() => redirectToApp(other)}
      style={{
        padding: '6px 12px',
        fontSize: 11,
        fontWeight: 600,
        color: '#4040C8',
        background: '#EEF0FD',
        border: '1px solid #DCE0FA',
        borderRadius: 6,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      Switch to {APP_LABELS[other]}
    </button>
  );
}
