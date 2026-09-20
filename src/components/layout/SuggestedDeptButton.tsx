import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { isAdminLevel } from '@/constants/roles';
import {
  hasDepartmentSuggestions,
  useDepartmentSuggestions,
} from '@/lib/department-suggestions';

/* ══════════════════════════════════════════════════════════════════════
   Top-bar shortcut to departments the company's annual report implies but
   which they haven't set up.

   Same contract as ActingCompanyChip and AppSwitcher: named export, no
   props, reads useAuth(), and renders nothing for everyone it doesn't apply
   to — so Topbar needs no conditional around it.

   Shown ONLY when there is something to act on. An amber button that is
   always there, whether or not anything is missing, stops being read.
   Dismissing the banner on the departments page clears it too, because both
   read the same cached answer.
═══════════════════════════════════════════════════════════════════════ */

// The app's established amber, not a new one: #B45309 on rgba(245,158,11,.12)
// is the triple named in earnings/ConfidenceBadge.tsx, and report-status.ts
// asks callers to reuse it rather than add another.
const AMBER_FG = '#B45309';
const AMBER_BG = 'rgba(245,158,11,.12)';
const AMBER_BORDER = '1px solid rgba(245,158,11,.28)';

const DEPARTMENTS_ROUTE = '/admin-console/departments';

export function SuggestedDeptButton() {
  const { user, actingCompany } = useAuth();
  const navigate = useNavigate();

  // Gate BEFORE fetching. Only admin-level roles can reach the departments route
  // (App.tsx route guard), and a Spark session without an acting company is
  // redirected away from everything — the same pair Sidebar uses for this route.
  // Passing undefined here means the hook never calls the endpoint at all.
  const eligible =
    isAdminLevel(user?.role) &&
    !(user?.role === 'spark_internal' && !actingCompany) &&
    !!user?.company_id;

  const data = useDepartmentSuggestions(eligible ? user?.company_id : undefined);

  if (!eligible || !hasDepartmentSuggestions(data)) return null;

  return (
    <button
      type="button"
      onClick={() => navigate(DEPARTMENTS_ROUTE)}
      title="Departments your annual report suggests you're missing"
      style={{
        // Geometry copied from AppSwitcher — the tinted pill already in this row —
        // so this sits on the same baseline as its neighbours.
        padding: '6px 12px',
        fontSize: 11,
        fontWeight: 600,
        color: AMBER_FG,
        background: AMBER_BG,
        border: AMBER_BORDER,
        borderRadius: 6,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      Suggested dept
    </button>
  );
}

export default SuggestedDeptButton;
