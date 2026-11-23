// Who counts as leading a department on a draft cycle.
//
// Its own module so that AssignDepartmentsSection stays a component-only file
// (exporting a function alongside a component breaks fast refresh), and so the
// section's lead chip, the page's Submit button and the page's request all read
// the same rule instead of each carrying their own copy of it.

import type { Department } from '@/types/admin';
import type { DepartmentAssignment, DepartmentLeadChoice } from './AssignDepartmentsSection';

/**
 * Whether the department has a real lead (a user with the `hod` role) set in the
 * admin console. An unknown department (dropped out of the list) has none.
 */
export function departmentHasLead(dept: Department | undefined): boolean {
  return dept?.has_hod ?? !!dept?.hod_user_id;
}

/**
 * Who leads a new (not yet saved) row when Spark runs the cycle: the department's
 * real lead by default, or the Spark user when they picked "(you)" — and always
 * the Spark user when the department has no real lead, as a fallback.
 *
 * The section draws its picker from this and the page sends it as `lead`, so
 * what the screen shows is what the server is told.
 */
export function sparkLeadChoice(
  row: DepartmentAssignment,
  dept: Department | undefined,
): DepartmentLeadChoice {
  if (!departmentHasLead(dept)) return 'self';
  if (row.lead === 'self') return 'self';
  return 'department';
}

/**
 * `selfLeadName` short-circuits it. That is the Spark case — staff running a
 * cycle themselves: a department's real lead heads it by default, and Spark
 * itself is the fallback for any department without one, so nothing is ever
 * missing a lead. The backend applies the same fallback from the caller's own
 * identity when the departments are saved.
 */
export function everyDepartmentHasLead(
  assigned: DepartmentAssignment[],
  allDepartments: Department[],
  selfLeadName?: string | null,
): boolean {
  return departmentsWithoutLead(assigned, allDepartments, selfLeadName) === 0;
}

/**
 * How many of the assigned departments still have no lead. 0 for Spark
 * (`selfLeadName`): the real lead by default, Spark as the fallback, so none is
 * left without one. Feeds the Cycle setup panel's "N without a lead";
 * everyDepartmentHasLead is this count being 0.
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
    if (!departmentHasLead(d)) missing += 1;
  }
  return missing;
}
