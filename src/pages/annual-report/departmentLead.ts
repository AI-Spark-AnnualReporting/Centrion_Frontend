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
  return departmentsWithoutLead(assigned, allDepartments, selfLeadName) === 0;
}

/**
 * How many of the assigned departments still have no lead. 0 when the caller leads
 * them all (`selfLeadName`, the Spark case). Feeds the Cycle setup panel's
 * "N without a lead"; everyDepartmentHasLead is this count being 0.
 */
export function departmentsWithoutLead(
  assigned: DepartmentAssignment[],
  allDepartments: Department[],
  selfLeadName?: string | null,
): number {
  if (selfLeadName) return 0;
  let missing = 0;
  for (const a of assigned) {
    const d = allDepartments.find((x) => x.id === a.department_id);
    const hasLead = d?.has_hod ?? !!d?.hod_user_id;
    if (!hasLead) missing += 1;
  }
  return missing;
}
