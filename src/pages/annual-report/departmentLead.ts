// Who counts as leading a department on a draft cycle.
//
// Its own module so that AssignDepartmentsSection stays a component-only file
// (exporting a function alongside a component breaks fast refresh), and so the
// section's warning badge and the page's Submit button read the same rule
// instead of each carrying their own copy of it.

import type { Department } from '@/types/admin';
import type { DepartmentAssignment } from './AssignDepartmentsSection';

/**
 * `selfLeadName` short-circuits it: when the caller leads them all, a department
 * without a client lead is no longer missing anything. That is the Spark case —
 * staff running a cycle themselves — and the backend makes the same
 * substitution from the caller's own identity when the departments are saved.
 */
export function everyDepartmentHasLead(
  assigned: DepartmentAssignment[],
  allDepartments: Department[],
  selfLeadName?: string | null,
): boolean {
  if (selfLeadName) return true;
  return assigned.every((a) => {
    const d = allDepartments.find((x) => x.id === a.department_id);
    return d?.has_hod ?? !!d?.hod_user_id;
  });
}
