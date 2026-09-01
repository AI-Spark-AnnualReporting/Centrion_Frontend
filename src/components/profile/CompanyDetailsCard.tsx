import { useEffect, useState } from 'react';
import { Spinner } from '@/components/shared/Spinner';
import { companies, getSectors } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { Company, CompanyEditableFields, Sector } from '@/types/company';
import { CYCLE_SECTOR_OPTIONS } from '@/types/cycles';
import { REPORTING_CURRENCIES } from '@/constants/currency';

// Fields an admin may PATCH. Save diffs these against the loaded company so we
// only send what actually changed.
const EDITABLE_FIELDS: (keyof CompanyEditableFields)[] = [
  'name',
  'sector_id',
  'jurisdiction',
  'employee_count',
  'founded_year',
  'website_url',
  'headquarter_city',
  'listed_exchange',
  'reporting_currency',
  'primary_language',
  'fiscal_year_end_month',
  'company_profile',
  'is_shariah',
  'has_subsidiaries',
  'has_sukuk',
  'reporting_sector',
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#9BA3C4', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#1A1D2E', fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

// On/off pill toggle for the company-structure booleans.
function Toggle({
  label, value, onChange, disabled,
}: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!value)}
      style={{
        flex: 1, display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px', borderRadius: 10,
        border: `1.5px solid ${value ? '#4040C8' : '#E2E4F0'}`,
        background: value ? '#EEEEFF' : '#fff',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 12, fontWeight: 600, color: value ? '#4040C8' : '#5A6080',
      }}
    >
      <span style={{
        width: 16, height: 16, borderRadius: 5, flexShrink: 0,
        border: value ? 'none' : '1.5px solid #C9CDE4', background: value ? '#4040C8' : '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {value && (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 6.2l2.2 2.2L9.5 3.6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {label}
    </button>
  );
}

export function CompanyDetailsCard() {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin';

  const [company, setCompany] = useState<Company | null>(null);
  const [form, setForm] = useState<Partial<Company>>({});
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([companies.getMyCompany(), getSectors()])
      .then(([companyData, sectorsData]) => {
        if (cancelled) return;
        setCompany(companyData);
        setForm(companyData);
        setSectors(sectorsData);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load company');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isDirty = company !== null && JSON.stringify(form) !== JSON.stringify(company);

  const updateField = <K extends keyof Company>(key: K, value: Company[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!company) return;
    const payload: Partial<Company> = {};
    for (const key of EDITABLE_FIELDS) {
      if (form[key] !== company[key]) {
        (payload as Record<string, unknown>)[key] = form[key];
      }
    }
    if (Object.keys(payload).length === 0) {
      setSuccess('No changes to save');
      setTimeout(() => setSuccess(null), 2000);
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const updated = await companies.updateMyCompany(payload);
      setCompany(updated);
      setForm(updated);
      setSuccess('Company details updated successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update company');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="ch">
        <div>
          <div className="ct">Company Details</div>
          <div style={{ fontSize: 10, color: '#9BA3C4', marginTop: 2 }}>
            Your company's profile and reporting preferences
          </div>
        </div>
      </div>

      <div className="cb">
        {loading ? (
          <Spinner pad={32} />
        ) : error && !company ? (
          <div
            role="alert"
            style={{
              background: 'rgba(239,68,68,.04)',
              border: '1px solid rgba(239,68,68,.25)',
              borderRadius: 10,
              padding: '12px 14px',
              color: '#DC2626',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {error}
          </div>
        ) : (
          <>
            {/* Section 1 — Basic Info */}
            <div className="fl-row">
              <div className="fl">
                <label className="fl-label">Company Name *</label>
                <input
                  className="inp"
                  value={form.name ?? ''}
                  onChange={(e) => updateField('name', e.target.value)}
                  disabled={!canEdit}
                />
              </div>
              <div className="fl">
                <label className="fl-label">Sector</label>
                <select
                  className="inp sel"
                  value={form.sector_id ?? ''}
                  onChange={(e) => updateField('sector_id', e.target.value || null)}
                  disabled={!canEdit}
                >
                  <option value="">Select sector</option>
                  {sectors.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="fl-row">
              <div className="fl">
                <label className="fl-label">Jurisdiction</label>
                <input
                  className="inp"
                  value={form.jurisdiction ?? ''}
                  onChange={(e) => updateField('jurisdiction', e.target.value || null)}
                  disabled={!canEdit}
                  placeholder="e.g. Saudi Arabia"
                />
              </div>
              <div className="fl">
                <label className="fl-label">Headquarter City</label>
                <input
                  className="inp"
                  value={form.headquarter_city ?? ''}
                  onChange={(e) => updateField('headquarter_city', e.target.value || null)}
                  disabled={!canEdit}
                />
              </div>
            </div>

            {/* Section 2 — Business Details */}
            <div className="fl-row">
              <div className="fl">
                <label className="fl-label">Employee Count</label>
                <input
                  type="number"
                  className="inp"
                  value={form.employee_count ?? ''}
                  onChange={(e) =>
                    updateField('employee_count', e.target.value ? parseInt(e.target.value, 10) : null)
                  }
                  disabled={!canEdit}
                  min={1}
                />
              </div>
              <div className="fl">
                <label className="fl-label">Founded Year</label>
                <input
                  type="number"
                  className="inp"
                  value={form.founded_year ?? ''}
                  onChange={(e) =>
                    updateField('founded_year', e.target.value ? parseInt(e.target.value, 10) : null)
                  }
                  disabled={!canEdit}
                  min={1800}
                  max={new Date().getFullYear()}
                />
              </div>
            </div>
            <div className="fl-row">
              <div className="fl">
                <label className="fl-label">Website URL</label>
                <input
                  type="url"
                  className="inp"
                  value={form.website_url ?? ''}
                  onChange={(e) => updateField('website_url', e.target.value || null)}
                  disabled={!canEdit}
                  placeholder="https://example.com"
                />
              </div>
              <div className="fl">
                <label className="fl-label">Listed Exchange</label>
                <input
                  className="inp"
                  value={form.listed_exchange ?? ''}
                  onChange={(e) => updateField('listed_exchange', e.target.value || null)}
                  disabled={!canEdit}
                  placeholder="e.g. Tadawul, NYSE"
                />
              </div>
            </div>

            {/* Section 3 — Reporting Preferences */}
            <div className="fl-row">
              <div className="fl">
                <label className="fl-label">Reporting Currency</label>
                <select
                  className="inp sel"
                  value={form.reporting_currency ?? ''}
                  onChange={(e) => updateField('reporting_currency', e.target.value || null)}
                  disabled={!canEdit}
                >
                  <option value="">Select currency</option>
                  {REPORTING_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="fl">
                <label className="fl-label">Primary Language</label>
                <select
                  className="inp sel"
                  value={form.primary_language ?? ''}
                  onChange={(e) => updateField('primary_language', e.target.value || null)}
                  disabled={!canEdit}
                >
                  <option value="">Select language</option>
                  <option value="en">English</option>
                  <option value="ar">العربية</option>
                </select>
              </div>
            </div>
            <div className="fl-row">
              <div className="fl">
                <label className="fl-label">Fiscal Year End Month</label>
                <select
                  className="inp sel"
                  value={form.fiscal_year_end_month ?? ''}
                  onChange={(e) =>
                    updateField('fiscal_year_end_month', e.target.value ? parseInt(e.target.value, 10) : null)
                  }
                  disabled={!canEdit}
                >
                  <option value="">Select month</option>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="fl" />
            </div>

            {/* Section 3b — Company Profile & Structure (drives annual-report sections) */}
            <div className="fl-row">
              <div className="fl">
                <label className="fl-label">Company Profile</label>
                <select
                  className="inp sel"
                  value={form.company_profile ?? ''}
                  onChange={(e) => updateField('company_profile', e.target.value || null)}
                  disabled={!canEdit}
                >
                  <option value="">Select profile</option>
                  <option value="listed">Listed</option>
                  <option value="private">Private</option>
                </select>
              </div>
              <div className="fl">
                <label className="fl-label">Reporting Sector</label>
                <select
                  className="inp sel"
                  value={form.reporting_sector ?? ''}
                  onChange={(e) => updateField('reporting_sector', e.target.value || null)}
                  disabled={!canEdit}
                >
                  <option value="">Select a reporting sector</option>
                  {CYCLE_SECTOR_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="fl" style={{ marginBottom: 4 }}>
              <label className="fl-label">Structure</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <Toggle label="Shariah-compliant" value={!!form.is_shariah} onChange={(v) => updateField('is_shariah', v)} disabled={!canEdit} />
                <Toggle label="Has subsidiaries" value={!!form.has_subsidiaries} onChange={(v) => updateField('has_subsidiaries', v)} disabled={!canEdit} />
                <Toggle label="Has sukuk" value={!!form.has_sukuk} onChange={(v) => updateField('has_sukuk', v)} disabled={!canEdit} />
              </div>
            </div>

            {/* Section 4 — Description (read-only for everyone) */}
            <div className="fl" style={{ marginTop: 8 }}>
              <label className="fl-label">
                Company Description
                <span style={{ marginLeft: 8, fontSize: 10, color: '#9BA3C4', fontWeight: 600 }}>
                  Read-only
                </span>
              </label>
              <textarea
                className="inp"
                value={form.description ?? ''}
                disabled
                readOnly
                rows={4}
                style={{ background: '#F5F6FA', cursor: 'not-allowed', color: '#5A6080', resize: 'vertical' }}
              />
              <p style={{ fontSize: 10.5, color: '#9BA3C4', marginTop: 4 }}>
                This field drives AI prompts for your departments. Contact support to update it.
              </p>
            </div>

            {/* Section 5 — Plan & Account (always read-only chips) */}
            {company && (
              <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #E2E4F0' }}>
                <h3 style={{ marginBottom: 14, fontSize: 12, fontWeight: 800, color: '#5A6080' }}>
                  Plan &amp; Account
                </h3>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 16,
                  }}
                >
                  <InfoItem label="Plan" value={company.plan_name ?? 'Enterprise'} />
                  <InfoItem label="Max Seats" value={String(company.max_seats ?? 12)} />
                  <InfoItem label="Plan Renewal" value={fmtDate(company.plan_renewal_date)} />
                  <InfoItem label="Account Created" value={fmtDate(company.created_at)} />
                </div>
              </div>
            )}

            {/* Save error (inline) */}
            {error && (
              <div
                role="alert"
                style={{
                  marginTop: 16,
                  background: 'rgba(239,68,68,.04)',
                  border: '1px solid rgba(239,68,68,.25)',
                  borderRadius: 10,
                  padding: '10px 14px',
                  color: '#DC2626',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {error}
              </div>
            )}
            {success && (
              <div
                role="status"
                style={{
                  marginTop: 16,
                  background: 'rgba(34,197,94,.08)',
                  border: '1px solid rgba(34,197,94,.25)',
                  borderRadius: 10,
                  padding: '10px 14px',
                  color: '#16A34A',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {success}
              </div>
            )}

            {canEdit && (
              <div style={{ marginTop: 22, display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn bp" type="button" onClick={handleSave} disabled={saving || !isDirty}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
