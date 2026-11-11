// Coloured code badge per department. Shared by the onboarding Departments
// step, the Spark Logins dialog and Spark's Assign Departments rows (the code
// tile next to the lead picker), so a department keeps the same colour on
// every screen.

const FALLBACK_COLOR = '#4040C8';

export const DEPT_COLORS: Record<string, string> = {
  FIN: '#3B82F6', ESG: '#16A34A', IR: '#7C5CFC', HR: '#F59E0B', OPS: '#EF4444',
  LGL: '#64748B', COM: '#F97316', TECH: '#06B6D4', RISK: '#E11D48', STRAT: '#8B5CF6',
  EXEC: '#4F46E5',
};

/** The badge colour for a department code. Unknown codes fall back to indigo. */
export function colorFor(code: string): string {
  return DEPT_COLORS[code.toUpperCase()] ?? FALLBACK_COLOR;
}
