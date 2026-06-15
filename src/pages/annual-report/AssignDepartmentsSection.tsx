import { useMemo, useState } from 'react';
import type { Department, AdminUserRow } from '@/types/admin';

const PRIMARY = '#4040C8';

export interface DepartmentAssignment {
  department_id: string;
  department_name: string;
  department_code: string;
  assigned_user_id: string | null;
}

// Draft-only section: admin picks departments and a responsible department_user
// per department. Nothing persists until the page's Submit (assign + activate).
export default function AssignDepartmentsSection({
  allDepartments,
  departmentUsers,
  assigned,
  onAdd,
  onRemove,
  onChangeUser,
}: {
  allDepartments: Department[];
  departmentUsers: AdminUserRow[];
  assigned: DepartmentAssignment[];
  onAdd: (dept: Department) => void;
  onRemove: (departmentId: string) => void;
  onChangeUser: (departmentId: string, userId: string) => void;
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

  const usersFor = (deptId: string) =>
    departmentUsers.filter((u) => u.department_id === deptId);

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
              Select which departments participate in this cycle and assign one responsible user per department.
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
            Each department will get an AI-generated questionnaire after assignments are saved. The
            responsible user will fill in their department’s answers.
          </span>
        </div>

        {/* Search + add */}
        <div style={{ position: 'relative', marginBottom: assigned.length ? 14 : 0 }}>
          <input
            className="inp"
            placeholder="Search and add departments…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 120)}
          />
          {focused && available.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                right: 0,
                zIndex: 30,
                background: '#fff',
                border: '1px solid #E2E4F0',
                borderRadius: 10,
                boxShadow: '0 12px 32px rgba(20,22,40,.12)',
                maxHeight: 240,
                overflowY: 'auto',
                padding: 4,
              }}
            >
              {available.map((d) => (
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
              ))}
            </div>
          )}
          {focused && query.trim() !== '' && available.length === 0 && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                right: 0,
                zIndex: 30,
                background: '#fff',
                border: '1px solid #E2E4F0',
                borderRadius: 10,
                padding: '12px',
                fontSize: 12,
                color: '#9BA3C4',
              }}
            >
              No matching departments.
            </div>
          )}
        </div>

        {/* Assigned rows */}
        {assigned.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {assigned.map((row) => {
              const users = usersFor(row.department_id);
              return (
                <div
                  key={row.department_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    border: '1px solid #ECEEF8',
                    borderRadius: 10,
                    background: '#FAFBFE',
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
                    {users.length === 0 ? (
                      <div style={{ fontSize: 10.5, color: '#B45309', marginTop: 2, fontWeight: 600 }}>
                        No department users available. Invite one from the admin portal.
                      </div>
                    ) : (
                      <div style={{ fontSize: 10.5, color: '#9BA3C4', marginTop: 1 }}>Responsible user</div>
                    )}
                  </div>
                  <select
                    className="inp sel"
                    style={{ width: 210, padding: '7px 28px 7px 10px' }}
                    value={row.assigned_user_id ?? ''}
                    disabled={users.length === 0}
                    onChange={(e) => onChangeUser(row.department_id, e.target.value)}
                  >
                    <option value="">Select responsible user</option>
                    {users.map((u) => (
                      <option key={u.user_id} value={u.user_id}>
                        {u.full_name}
                      </option>
                    ))}
                  </select>
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
