import { useMemo, useState } from 'react';
import type { Department } from '@/types/admin';

const PRIMARY = '#4040C8';

export interface DepartmentAssignment {
  department_id: string;
  department_name: string;
  department_code: string;
}

const initials = (name?: string | null) =>
  (name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';

// Draft-only section: admin picks the departments that participate. Each department's
// questions route to that department's HOD (Head of Department), set in the admin console.
// A department with no HOD is blocked. Nothing persists until the page's Submit (assign only;
// the cycle stays draft and only goes active when the PM kicks off).
export default function AssignDepartmentsSection({
  allDepartments,
  assigned,
  onAdd,
  onRemove,
}: {
  allDepartments: Department[];
  assigned: DepartmentAssignment[];
  onAdd: (dept: Department) => void;
  onRemove: (departmentId: string) => void;
}) {
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
              Select which departments participate in this cycle. Each one's questions go to its Head of Department.
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
            After kickoff, each department's AI-generated questions go to its Head of Department, who reviews
            them and assigns a team member to answer.
          </span>
        </div>

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
              const hasHod = dept?.has_hod ?? !!dept?.hod_user_id;
              const hodName = dept?.hod_name;
              return (
                <div
                  key={row.department_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    border: `1px solid ${hasHod ? '#ECEEF8' : '#F4C7C7'}`,
                    borderRadius: 10,
                    background: hasHod ? '#FAFBFE' : '#FFF7F7',
                  }}
                >
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 8,
                      background: PRIMARY,
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
                    {hasHod ? (
                      <div style={{ fontSize: 10.5, color: '#9BA3C4', marginTop: 2 }}>Head of Department</div>
                    ) : (
                      <div style={{ fontSize: 10.5, color: '#B45309', marginTop: 2, fontWeight: 600 }}>
                        No HOD assigned — set one in the admin console before adding this department.
                      </div>
                    )}
                  </div>
                  {hasHod ? (
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
                        {initials(hodName)}
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
                        title={hodName ?? undefined}
                      >
                        {hodName || 'HOD'}
                      </span>
                    </div>
                  ) : (
                    <span
                      className="badge b-am"
                      style={{ width: 210, justifyContent: 'center', flexShrink: 0 }}
                    >
                      ⚠ No HOD assigned
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
