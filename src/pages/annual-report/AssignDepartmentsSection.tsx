import { DepartmentSuggestionsBanner } from '@/components/shared/DepartmentSuggestionsBanner';
import type { DepartmentSuggestionsResponse } from '@/types/company';
import { useMemo, useState, type ReactNode } from 'react';
import type { Department } from '@/types/admin';
import { departmentHasLead, sparkLeadChoice } from './departmentLead';
import { colorFor } from '@/lib/departmentColors';

const PRIMARY = '#4040C8';

// Who heads a department's session when Spark runs the cycle:
// 'department' = the department's real lead, 'self' = the Spark user.
export type DepartmentLeadChoice = 'department' | 'self';

export interface DepartmentAssignment {
  department_id: string;
  department_name: string;
  department_code: string;
  // Spark only, and only for rows not yet saved on the cycle. Set when the
  // department is added (real lead if it has one, otherwise 'self').
  lead?: DepartmentLeadChoice;
}

// The lead already stored on a saved department's session (from the cycle
// overview). `isYou` = the session is headed by the person looking at the page.
export interface SavedDepartmentLead {
  name: string | null;
  isYou: boolean;
}

const initials = (name?: string | null) =>
  (name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';

// Avatar colours: blue for a department's own lead (today's chip), indigo for "you".
const LEAD_AVATAR = { background: 'rgba(37,99,235,.12)', color: '#2563EB' };
const YOU_AVATAR = { background: '#EEEEFF', color: PRIMARY };

const SAVED_LEAD_TITLE = "Already saved. The lead can't be changed on this cycle.";

/** The 24px round initials avatar shown inside a lead chip or picker. */
function LeadAvatar({ name, colors }: { name?: string | null; colors: { background: string; color: string } }) {
  return (
    <span
      aria-hidden
      style={{
        width: 24,
        height: 24,
        borderRadius: '50%',
        background: colors.background,
        color: colors.color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        fontWeight: 800,
        flexShrink: 0,
      }}
    >
      {initials(name)}
    </span>
  );
}

/** Small padlock glyph for a lead that is already saved and can't change. */
function LockIcon() {
  return (
    <svg aria-hidden viewBox="0 0 12 12" width="12" height="12" fill="none" style={{ flexShrink: 0, color: '#9BA3C4' }}>
      <rect x="2.5" y="5.5" width="7" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/**
 * A read-only Spark lead chip (no-lead rows and saved rows). Same 210px white box
 * as the client admin's chip, with the label read out as "Led by …".
 */
function StaticLeadChip({
  name,
  label,
  colors,
  ariaLabel,
  title,
  locked,
}: {
  name: string | null;
  label: string;
  colors: { background: string; color: string };
  ariaLabel: string;
  title: string;
  locked: boolean;
}) {
  return (
    <span
      aria-label={ariaLabel}
      title={title}
      style={{
        width: 210,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        border: '1px solid #E2E4F0',
        borderRadius: 8,
        background: '#fff',
        flexShrink: 0,
      }}
    >
      <LeadAvatar name={name} colors={colors} />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 12,
          fontWeight: 600,
          color: '#1A1D2E',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      {locked && <LockIcon />}
    </span>
  );
}

/**
 * The Spark picker for a new row whose department has a real lead: a native
 * select (same control as the cycle form) choosing that lead (default) or "you".
 */
function SparkLeadPicker({
  row,
  departmentLeadName,
  youLabel,
  youName,
  choice,
  onChange,
}: {
  row: DepartmentAssignment;
  departmentLeadName: string;
  youLabel: string;
  youName: string;
  choice: DepartmentLeadChoice;
  onChange: (lead: DepartmentLeadChoice) => void;
}) {
  const departmentOption = `${departmentLeadName}, ${row.department_code} Lead`;
  const chosenLabel = choice === 'self' ? youLabel : departmentOption;
  return (
    <div style={{ position: 'relative', width: 210, flexShrink: 0 }}>
      {/* The avatar sits over the select's left padding; clicks pass through to it. */}
      <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
        <LeadAvatar
          name={choice === 'self' ? youName : departmentLeadName}
          colors={choice === 'self' ? YOU_AVATAR : LEAD_AVATAR}
        />
      </span>
      <select
        className="inp sel"
        data-testid={`lead-picker-${row.department_code}`}
        aria-label={`Who leads ${row.department_name}`}
        title={chosenLabel}
        value={choice}
        onChange={(e) => onChange(e.target.value === 'self' ? 'self' : 'department')}
        style={{
          padding: '7px 28px 7px 40px',
          borderRadius: 8,
          fontWeight: 600,
          textOverflow: 'ellipsis',
          cursor: 'pointer',
        }}
      >
        <option value="department">{departmentOption}</option>
        <option value="self">{youLabel}</option>
      </select>
    </div>
  );
}

/** The grey sub-line under the department name, as a plain div. */
function LeadSubLine({ text }: { text: string }) {
  return <div style={{ fontSize: 10.5, color: '#9BA3C4', marginTop: 2 }}>{text}</div>;
}

/**
 * Builds the sub-line and lead control for one row on Spark's screen (a plain
 * function returning two pieces, because they sit in different columns):
 *   - saved on the cycle → the session's stored lead, locked;
 *   - department has no real lead → "you", as a calm fallback (not a warning);
 *   - otherwise → the picker, defaulting to the department's real lead.
 */
function buildSparkLeadCell({
  row,
  dept,
  saved,
  youName,
  onLeadChange,
}: {
  row: DepartmentAssignment;
  dept: Department | undefined;
  saved: SavedDepartmentLead | undefined;
  youName: string;
  onLeadChange?: (departmentId: string, lead: DepartmentLeadChoice) => void;
}): { subLine: ReactNode; control: ReactNode } {
  const youLabel = `${youName} (you)`;

  if (saved) {
    const savedLabel = saved.isYou ? youLabel : saved.name || 'Saved lead';
    return {
      subLine: <LeadSubLine text="Saved on this cycle" />,
      control: (
        <StaticLeadChip
          name={saved.isYou ? youName : saved.name}
          label={savedLabel}
          colors={saved.isYou ? YOU_AVATAR : LEAD_AVATAR}
          ariaLabel={`Led by ${savedLabel}, saved`}
          title={SAVED_LEAD_TITLE}
          locked
        />
      ),
    };
  }

  if (!departmentHasLead(dept)) {
    return {
      subLine: <LeadSubLine text={`No ${row.department_code} Lead yet, so you'll lead it.`} />,
      control: (
        <StaticLeadChip
          name={youName}
          label={youLabel}
          colors={YOU_AVATAR}
          ariaLabel={`Led by ${youLabel}`}
          title={youLabel}
          locked={false}
        />
      ),
    };
  }

  const choice = sparkLeadChoice(row, dept);
  const subLineText = choice === 'self' ? 'You lead this department' : `${row.department_code} Lead`;
  return {
    subLine: <LeadSubLine text={subLineText} />,
    control: (
      <SparkLeadPicker
        row={row}
        departmentLeadName={dept?.hod_name || `${row.department_code} Lead`}
        youLabel={youLabel}
        youName={youName}
        choice={choice}
        onChange={(lead) => onLeadChange?.(row.department_id, lead)}
      />
    ),
  };
}

// Draft-only section: admin picks the departments that participate. Each department's
// questions route to that department's lead (role key `hod`), set in the admin console.
// A department with no lead assigned is blocked. Nothing persists until the page's Submit
// (assign only; the cycle stays draft and only goes active when the PM kicks off).
//
// `isSpark` is the Spark case (staff running a cycle for a client), with
// `selfLeadName` as their name. A department's real lead heads its session by
// default and Spark can pick "(you)" instead, per new row; a department with no
// lead falls back to Spark. Rows already saved on the cycle show the lead stored
// on their session, locked, because the backend never rewrites a saved session.
// The page sends the same choice as `lead`, so the chip is not just a label.
// Every other role gets the original screen, untouched.
export default function AssignDepartmentsSection({
  allDepartments,
  assigned,
  onAdd,
  onRemove,
  selfLeadName,
  isSpark,
  savedLeads,
  onLeadChange,
  departmentSuggestions,
}: {
  allDepartments: Department[];
  assigned: DepartmentAssignment[];
  onAdd: (dept: Department) => void;
  onRemove: (departmentId: string) => void;
  selfLeadName?: string | null;
  // Defaults to "a self-lead name was given", which only ever happens for Spark.
  isSpark?: boolean;
  // Saved departments (keyed by department id) and the lead on their session.
  savedLeads?: Map<string, SavedDepartmentLead>;
  onLeadChange?: (departmentId: string, lead: DepartmentLeadChoice) => void;
  // Passed in rather than fetched: this component is presentational, the same reason
  // `allDepartments` arrives as a prop. Undefined simply renders nothing.
  departmentSuggestions?: DepartmentSuggestionsResponse | null;
}) {
  const sparkMode = isSpark ?? !!selfLeadName;
  const youName = selfLeadName || 'You';
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allDepartments.filter(
      (d) =>
        d.is_active !== false &&
        !assigned.some((a) => a.department_id === d.id) &&
        (q === '' ||
          d.department_name.toLowerCase().includes(q) ||
          d.department_code.toLowerCase().includes(q)),
    );
  }, [allDepartments, assigned, query]);

  const deptById = useMemo(
    () => new Map(allDepartments.map((d) => [d.id, d])),
    [allDepartments],
  );

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #ECEEF8' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              background: '#EEEEFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: PRIMARY,
              flexShrink: 0,
            }}
          >
            <svg viewBox="0 0 14 14" width="14" height="14" fill="none">
              <rect x="2" y="1.5" width="10" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M4.5 5h5M4.5 7.5h5M4.5 10h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1D2E' }}>Assign Departments</div>
            <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 1 }}>
              Select which departments participate in this cycle. Each one's questions go to its department lead.
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {/* Info banner */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '10px 12px',
            borderRadius: 10,
            background: 'rgba(64,64,200,.06)',
            border: '1px solid rgba(64,64,200,.18)',
            fontSize: 11.5,
            color: '#3A3F5C',
            lineHeight: 1.5,
            marginBottom: 14,
          }}
        >
          <span aria-hidden>ℹ️</span>
          <span>
            After kickoff, each department's AI-generated questions go to its department lead, who
            reviews them and assigns a team member to answer.
          </span>
        </div>

        {/* Departments the company's annual report implies but which don't exist yet.
            One line only — they're mid-task setting up a cycle. */}
        <DepartmentSuggestionsBanner variant="compact" data={departmentSuggestions} />

        {/* Search + add — inline results (in normal flow so the card's
            overflow:hidden can't clip them). */}
        <div style={{ marginBottom: assigned.length || focused ? 14 : 0 }}>
          <input
            className="inp"
            placeholder="Search and add departments…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
          />
          {focused && (
            <div
              style={{
                marginTop: 6,
                border: '1px solid #E2E4F0',
                borderRadius: 10,
                background: '#fff',
                maxHeight: 200,
                overflowY: 'auto',
                padding: 4,
              }}
            >
              {available.length === 0 ? (
                <div style={{ padding: '10px 8px', fontSize: 12, color: '#9BA3C4' }}>
                  {query.trim() ? 'No matching departments.' : 'All departments added.'}
                </div>
              ) : (
                available.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onAdd(d);
                      setQuery('');
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '9px 10px',
                      border: 'none',
                      background: 'transparent',
                      borderRadius: 8,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F4F5FB')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span className="badge b-gy" style={{ fontFamily: "'DM Mono', monospace" }}>
                      {d.department_code}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#1A1D2E' }}>
                      {d.department_name}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Assigned rows */}
        {assigned.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {assigned.map((row) => {
              const dept = deptById.get(row.department_id);
              // Spark: a lead is always settled (real lead, "you", or the saved one).
              const sparkCell = sparkMode
                ? buildSparkLeadCell({
                    row,
                    dept,
                    saved: savedLeads?.get(row.department_id),
                    youName,
                    onLeadChange,
                  })
                : null;
              const leadName = dept?.hod_name;
              const hasLead = sparkMode || departmentHasLead(dept);
              const leadLabel = leadName || `${row.department_code} Lead`;
              // Spark sees the same department colour as in the wizard and the
              // Logins dialog. Everyone else keeps the plain indigo tile.
              const codeTileColor = sparkMode ? colorFor(row.department_code) : PRIMARY;
              return (
                <div
                  key={row.department_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    border: `1px solid ${hasLead ? '#ECEEF8' : '#F4C7C7'}`,
                    borderRadius: 10,
                    background: hasLead ? '#FAFBFE' : '#FFF7F7',
                  }}
                >
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 8,
                      background: codeTileColor,
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      fontWeight: 800,
                      fontFamily: "'DM Mono', monospace",
                      flexShrink: 0,
                    }}
                  >
                    {row.department_code}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1A1D2E' }}>
                      {row.department_name}
                    </div>
                    {sparkCell ? (
                      sparkCell.subLine
                    ) : hasLead ? (
                      <div style={{ fontSize: 10.5, color: '#9BA3C4', marginTop: 2 }}>{row.department_code} Lead</div>
                    ) : (
                      <div style={{ fontSize: 10.5, color: '#B45309', marginTop: 2, fontWeight: 600 }}>
                        No {row.department_code} Lead assigned — set one in the admin console before adding this department.
                      </div>
                    )}
                  </div>
                  {sparkCell ? (
                    sparkCell.control
                  ) : hasLead ? (
                    <div
                      style={{
                        width: 210,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 10px',
                        border: '1px solid #E2E4F0',
                        borderRadius: 8,
                        background: '#fff',
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          background: 'rgba(37,99,235,.12)',
                          color: '#2563EB',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 10,
                          fontWeight: 800,
                          flexShrink: 0,
                        }}
                      >
                        {initials(leadName)}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: '#1A1D2E',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={leadLabel}
                      >
                        {leadLabel}
                      </span>
                    </div>
                  ) : (
                    <span
                      className="badge b-am"
                      style={{ width: 210, justifyContent: 'center', flexShrink: 0 }}
                    >
                      ⚠ No {row.department_code} Lead assigned
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemove(row.department_id)}
                    aria-label={`Remove ${row.department_name}`}
                    title="Remove"
                    style={{
                      width: 30,
                      height: 30,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid #F1D4D4',
                      background: '#fff',
                      borderRadius: 8,
                      cursor: 'pointer',
                      color: '#DC2626',
                    }}
                  >
                    🗑
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 12 }}>
          {assigned.length} department{assigned.length === 1 ? '' : 's'} added
          {assigned.length === 0 && (
            <span style={{ color: PRIMARY, fontWeight: 600 }}> — search above to add one.</span>
          )}
        </div>
      </div>
    </div>
  );
}
