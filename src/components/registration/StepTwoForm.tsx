import { useState } from 'react';
import type { StepTwoState } from '@/types/register';
import type { Sector } from '@/types/company';

interface StepTwoFormProps {
  initialValues: StepTwoState;
  sectors: Sector[];
  sectorsLoading: boolean;
  onSubmit: (data: StepTwoState) => void;
  onBack: () => void;
  error: string;
  loading: boolean;
}

const JURISDICTIONS = ['KSA', 'UAE', 'Bahrain', 'Kuwait', 'Oman', 'Qatar', 'Other'];

function Spinner() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      style={{ marginRight: 8, animation: 'spin 1s linear infinite' }}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}

export function StepTwoForm({
  initialValues,
  sectors,
  sectorsLoading,
  onSubmit,
  onBack,
  error,
  loading,
}: StepTwoFormProps) {
  const [companyName, setCompanyName] = useState(initialValues.companyName);
  const [sector_id, setSectorId] = useState(initialValues.sector_id);
  const [jurisdiction, setJurisdiction] = useState(initialValues.jurisdiction || 'KSA');

  const handleCreate = () => {
    if (loading) return;
    onSubmit({ companyName, sector_id, jurisdiction });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCreate();
  };

  return (
    <>
      <div className="fl">
        <label>Company name</label>
        <input
          type="text"
          className="inp"
          placeholder="e.g. Al-Noor Capital"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>

      <div className="fl">
        <label>Sector</label>
        <select
          className="inp"
          value={sector_id}
          onChange={(e) => setSectorId(e.target.value)}
          disabled={sectorsLoading}
        >
          {sectorsLoading ? (
            <option value="" disabled>
              Loading sectors…
            </option>
          ) : (
            <>
              <option value="" disabled>
                Select a sector
              </option>
              {sectors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </>
          )}
        </select>
      </div>

      <div className="fl">
        <label>Jurisdiction</label>
        <select
          className="inp"
          value={jurisdiction}
          onChange={(e) => setJurisdiction(e.target.value)}
        >
          {JURISDICTIONS.map((j) => (
            <option key={j} value={j}>
              {j}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div style={{ fontSize: '11px', color: '#E5484D', marginTop: '4px', marginBottom: '8px' }} role="alert">
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          style={{
            padding: '10px 14px',
            fontSize: 12,
            fontWeight: 600,
            color: '#5A6080',
            background: 'transparent',
            border: '1px solid #E5E7EF',
            borderRadius: 8,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          ← Back
        </button>
        <button
          type="button"
          className="btn-auth"
          onClick={handleCreate}
          disabled={loading}
          style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {loading ? (
            <>
              <Spinner />
              Creating account…
            </>
          ) : (
            'Create Account'
          )}
        </button>
      </div>
    </>
  );
}

export default StepTwoForm;
