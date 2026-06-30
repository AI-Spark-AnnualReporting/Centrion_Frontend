import { useEffect, useState } from 'react';
import { Spinner } from '@/components/shared/Spinner';
import { adminConsole } from '@/lib/api';
import type { Department } from '@/types/admin';

const PRIMARY = '#4040C8';

// Default / system-seeded departments are locked: they can't be edited or
// deleted from the UI. Treat either backend flag as the marker.
const isDefaultDepartment = (d: Department) => d.is_default === true || d.is_system === true;

// ── Create / edit modal ────────────────────────────────────────────────────
function DepartmentModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Department | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!initial;
  const [code, setCode] = useState(initial?.department_code ?? '');
  const [name, setName] = useState(initial?.department_name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // AI prompts — generated server-side. Shown read-only in the edit view; the
  // "Advanced: Override prompts" toggle makes them editable and sends them in
  // the update payload (otherwise the backend regenerates them automatically).
  const [showPrompts, setShowPrompts] = useState(false);
  const [overridePrompts, setOverridePrompts] = useState(false);
  const [initialPrompt, setInitialPrompt] = useState(initial?.initial_prompt ?? '');
  const [systemPrompt, setSystemPrompt] = useState(initial?.system_prompt ?? '');

  const submit = async () => {
    if (busy) return;
    setErr('');
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) return setErr('Department code is required');
    if (cleanCode.length > 10) return setErr('Department code must be 10 characters or fewer');
    if (!name.trim()) return setErr('Department name is required');
    setBusy(true);
    try {
      const payload = {
        department_code: cleanCode,
        department_name: name.trim(),
        description: description.trim() || undefined,
        // Only forward manual prompts when overriding in the edit view.
        ...(editing && overridePrompts
          ? {
              initial_prompt: initialPrompt,
              system_prompt: systemPrompt,
            }
          : {}),
      };
      if (editing && initial) await adminConsole.updateDepartment(initial.id, payload);
      else await adminConsole.createDepartment(payload);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save department.');
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ width: 440 }} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            padding: '20px 24px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 800, color: '#1A1D2E' }}>
            {editing ? 'Edit department' : 'New department'}
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: '1.5px solid #E2E4F0',
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: '4px 24px 8px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="fl">
            <label className="fl-label">Department code</label>
            <input
              className="inp"
              value={code}
              maxLength={10}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. FIN"
              style={{ textTransform: 'uppercase', fontFamily: "'DM Mono', monospace" }}
            />
          </div>
          <div className="fl">
            <label className="fl-label">Department name</label>
            <input
              className="inp"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Finance"
            />
          </div>
          <div className="fl">
            <label className="fl-label">Description</label>
            <textarea
              className="inp"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              style={{ resize: 'vertical' }}
            />
          </div>

          {/* AI prompts — edit view only. Generated automatically server-side. */}
          {editing && (
            <div
              style={{
                border: '1px solid #ECEEF8',
                borderRadius: 10,
                background: '#FAFBFE',
                overflow: 'hidden',
              }}
            >
              <button
                type="button"
                onClick={() => setShowPrompts((s) => !s)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '11px 13px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: '#1A1D2E' }}>
                  View AI Prompts
                </span>
                <svg
                  viewBox="0 0 12 12"
                  width="12"
                  height="12"
                  fill="none"
                  style={{
                    color: '#9BA3C4',
                    transition: '.15s',
                    transform: showPrompts ? 'rotate(180deg)' : 'none',
                  }}
                >
                  <path d="M3 4.5L6 7.5l3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {showPrompts && (
                <div style={{ padding: '0 13px 13px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#5A6080',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={overridePrompts}
                      onChange={(e) => setOverridePrompts(e.target.checked)}
                      style={{ accentColor: PRIMARY }}
                    />
                    Advanced: Override prompts
                  </label>
                  {overridePrompts && (
                    <div
                      style={{
                        fontSize: 10,
                        color: '#B45309',
                        background: 'rgba(245,158,11,.1)',
                        borderRadius: 6,
                        padding: '6px 9px',
                      }}
                    >
                      ⚠ Manual prompts replace the auto-generated ones. Leave this off to let the
                      backend regenerate them from the name &amp; description.
                    </div>
                  )}
                  <div className="fl" style={{ margin: 0 }}>
                    <label className="fl-label">Initial prompt</label>
                    <textarea
                      className="inp"
                      rows={3}
                      value={initialPrompt}
                      onChange={(e) => setInitialPrompt(e.target.value)}
                      readOnly={!overridePrompts}
                      placeholder={initialPrompt ? undefined : 'Generated on save…'}
                      style={{
                        resize: 'vertical',
                        fontFamily: "'DM Mono', monospace",
                        fontSize: 11,
                        background: overridePrompts ? '#fff' : '#F2F3FA',
                        color: overridePrompts ? '#1A1D2E' : '#5A6080',
                      }}
                    />
                  </div>
                  <div className="fl" style={{ margin: 0 }}>
                    <label className="fl-label">System prompt</label>
                    <textarea
                      className="inp"
                      rows={4}
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                      readOnly={!overridePrompts}
                      placeholder={systemPrompt ? undefined : 'Generated on save…'}
                      style={{
                        resize: 'vertical',
                        fontFamily: "'DM Mono', monospace",
                        fontSize: 11,
                        background: overridePrompts ? '#fff' : '#F2F3FA',
                        color: overridePrompts ? '#1A1D2E' : '#5A6080',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {err && (
            <div style={{ fontSize: 11, color: '#E5484D' }} role="alert">
              {err}
            </div>
          )}
        </div>
        <div
          style={{
            padding: '14px 24px 18px',
            borderTop: '1px solid #ECEEF8',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button className="btn bs" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="btn bp" onClick={submit} type="button" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Create department'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete confirm ─────────────────────────────────────────────────────────
function ConfirmDelete({
  dept,
  onClose,
  onConfirmed,
}: {
  dept: Department;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async () => {
    setBusy(true);
    setErr('');
    try {
      await adminConsole.deleteDepartment(dept.id);
      onConfirmed();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to delete department.');
      setBusy(false);
    }
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ width: 400, padding: 24 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#1A1D2E' }}>Delete department</div>
        <div style={{ fontSize: 12, color: '#5A6080', marginTop: 8 }}>
          Delete <strong>{dept.department_name}</strong> ({dept.department_code})? It will be
          deactivated (soft-deleted).
        </div>
        {err && (
          <div style={{ fontSize: 11, color: '#E5484D', marginTop: 8 }} role="alert">
            {err}
          </div>
        )}
        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn bs" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={run}
            style={{ background: '#DC2626', color: '#fff' }}
          >
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminDepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Department | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Department | null>(null);

  const fetchDepartments = () => {
    setLoading(true);
    setError('');
    adminConsole
      .listDepartments()
      .then((res) => {
        // Accept either a raw array or a `{ departments: [...] }` wrapper.
        const list = Array.isArray(res)
          ? res
          : Array.isArray(res?.departments)
            ? res.departments
            : [];
        setDepartments(list);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load departments.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDepartments();
  }, []);

  const th: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    color: '#9BA3C4',
    textTransform: 'uppercase',
    letterSpacing: '.5px',
    textAlign: 'left',
    padding: '14px 16px',
  };
  const td: React.CSSProperties = { fontSize: 12, color: '#1A1D2E', padding: '14px 16px' };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1A1D2E' }}>Departments</h2>
          <p style={{ fontSize: 12, color: '#5A6080', marginTop: 2 }}>
            Organise your company into departments.
          </p>
        </div>
        <button className="btn bp" type="button" onClick={() => setCreating(true)}>
          + New Department
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <Spinner />
        ) : error ? (
          <div style={{ padding: 32, textAlign: 'center', fontSize: 12, color: '#5A6080' }}>{error}</div>
        ) : departments.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1D2E' }}>No departments yet</div>
            <div style={{ fontSize: 12, color: '#9BA3C4', marginTop: 6 }}>
              Create your first department to get started.
            </div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #ECEEF8' }}>
                <th style={th}>Code</th>
                <th style={th}>Name</th>
                <th style={th}>Description</th>
                <th style={{ ...th, textAlign: 'right' }}>Members</th>
                <th style={{ ...th, textAlign: 'center' }}>Status</th>
                <th style={{ ...th, width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {departments.map((d) => {
                const locked = isDefaultDepartment(d);
                return (
                <tr key={d.id} style={{ borderTop: '1px solid #F4F5FB' }}>
                  <td style={{ ...td, fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>
                    {d.department_code}
                  </td>
                  <td style={{ ...td, fontWeight: 700 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      {d.department_name}
                      {locked && (
                        <span
                          className="badge b-gy"
                          title="Default department — can't be edited or deleted"
                        >
                          Default
                        </span>
                      )}
                    </span>
                  </td>
                  <td style={{ ...td, color: '#5A6080' }}>{d.description || '—'}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: "'DM Mono', monospace" }}>
                    {d.member_count ?? 0}
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <span className={`badge ${d.is_active === false ? 'b-gy' : 'b-gn'}`}>
                      {d.is_active === false ? 'Inactive' : 'Active'}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {locked ? (
                      <span style={{ fontSize: 11, color: '#9BA3C4' }}>Locked</span>
                    ) : (
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button
                          className="btn bs bsm"
                          type="button"
                          onClick={() => setEditing(d)}
                          style={{ padding: '4px 8px' }}
                        >
                          Edit
                        </button>
                        <button
                          className="btn bsm"
                          type="button"
                          onClick={() => setDeleting(d)}
                          style={{ padding: '4px 8px', color: '#DC2626', border: '1px solid #F1D4D4', background: '#fff' }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {(creating || editing) && (
        <DepartmentModal
          initial={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            fetchDepartments();
          }}
        />
      )}
      {deleting && (
        <ConfirmDelete
          dept={deleting}
          onClose={() => setDeleting(null)}
          onConfirmed={() => {
            setDeleting(null);
            fetchDepartments();
          }}
        />
      )}
    </div>
  );
}
