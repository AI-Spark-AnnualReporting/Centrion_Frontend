import { useEffect, useMemo, useState } from 'react';
import { Spinner } from '@/components/shared/Spinner';
import { auth } from '@/lib/api';
import type { DepartmentCategory, DepartmentOption } from '@/types/auth';

const PRIMARY = '#4040C8';
const MIN_REQUIRED = 3;

const CATEGORY_ORDER: { key: DepartmentCategory; label: string; fullWidth?: boolean }[] = [
  { key: 'leadership', label: 'Leadership', fullWidth: true },
  { key: 'core', label: 'Core Operations' },
  { key: 'commercial', label: 'Commercial' },
  { key: 'support', label: 'Support' },
];

function DepartmentCard({
  dept,
  selected,
  onToggle,
}: {
  dept: DepartmentOption;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        display: 'flex',
        gap: 11,
        padding: '13px 14px',
        border: `1.5px solid ${selected ? PRIMARY : '#E2E4F0'}`,
        borderRadius: 10,
        background: selected ? '#F0F1FF' : '#fff',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        transition: 'border-color .15s, background .15s',
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          marginTop: 1,
          borderRadius: 5,
          flexShrink: 0,
          border: selected ? 'none' : '1.5px solid #C9CDE4',
          background: selected ? PRIMARY : '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected && (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 6.2l2.2 2.2L9.5 3.6" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span style={{ minWidth: 0 }}>
        <span
          style={{
            display: 'inline-block',
            fontSize: 10,
            fontWeight: 700,
            fontFamily: "'DM Mono', monospace",
            color: PRIMARY,
            background: '#E5E7FF',
            padding: '2px 6px',
            borderRadius: 4,
            marginBottom: 6,
          }}
        >
          {dept.code}
        </span>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1A1D2E' }}>{dept.name}</span>
        <span style={{ display: 'block', fontSize: 11.5, color: '#5A6080', lineHeight: 1.5, marginTop: 2 }}>
          {dept.description}
        </span>
      </span>
    </button>
  );
}

export default function DepartmentSelectionStep({
  selectedCodes,
  onSelect,
  onBack,
  onSubmit,
  onOptionsLoaded,
}: {
  selectedCodes: string[];
  onSelect: (codes: string[]) => void;
  onBack: () => void;
  onSubmit: () => void;
  onOptionsLoaded: (options: DepartmentOption[]) => void;
}) {
  const [options, setOptions] = useState<DepartmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    auth
      .onboardingDepartmentOptions()
      .then((data) => {
        const opts = data.departments ?? [];
        setOptions(opts);
        onOptionsLoaded(opts);
        if (selectedCodes.length === 0) onSelect(opts.map((d) => d.code));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load departments.'))
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const grouped = useMemo(() => {
    const g: Record<DepartmentCategory, DepartmentOption[]> = {
      leadership: [],
      core: [],
      commercial: [],
      support: [],
    };
    options.forEach((d) => g[d.category]?.push(d));
    return g;
  }, [options]);

  const toggle = (code: string) =>
    onSelect(
      selectedCodes.includes(code)
        ? selectedCodes.filter((c) => c !== code)
        : [...selectedCodes, code],
    );

  const canSubmit = selectedCodes.length >= MIN_REQUIRED;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <button
          type="button"
          onClick={onBack}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#5A6080', fontSize: 12, fontWeight: 600, padding: 0 }}
        >
          ← Back
        </button>
        <span style={{ fontSize: 11, color: '#9BA3C4', fontWeight: 600 }}>Step 2 of 2</span>
      </div>

      <h2>Select Your Departments</h2>
      <p>
        Choose which departments to set up. Each one gets its own AI agent trained on your company
        context. You can add more later.
      </p>

      {loading ? (
        <Spinner pad={32} />
      ) : error ? (
        <div style={{ marginTop: 8, textAlign: 'center', padding: '24px 12px' }}>
          <div style={{ fontSize: 12, color: '#DC2626', fontWeight: 600, marginBottom: 10 }}>{error}</div>
          <button type="button" className="btn bs" onClick={load}>
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* Summary + bulk actions */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              margin: '4px 0 14px',
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: '#1A1D2E' }}>
              {selectedCodes.length} / {options.length} selected
            </span>
            <div style={{ display: 'flex', gap: 14 }}>
              <button
                type="button"
                onClick={() => onSelect(options.map((d) => d.code))}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: PRIMARY, fontSize: 11.5, fontWeight: 700, padding: 0 }}
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => onSelect([])}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#9BA3C4', fontSize: 11.5, fontWeight: 700, padding: 0 }}
              >
                Clear
              </button>
            </div>
          </div>

          {/* Groups — scrolls within a fixed height so the card/footer stay put */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: 300, overflowY: 'auto', paddingRight: 6 }}>
            {CATEGORY_ORDER.map(({ key, label, fullWidth }) => {
              const depts = grouped[key];
              if (!depts || depts.length === 0) return null;
              return (
                <div key={key}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '.6px',
                      textTransform: 'uppercase',
                      color: '#9BA3C4',
                      marginBottom: 8,
                    }}
                  >
                    {label}
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: fullWidth ? '1fr' : 'repeat(2, 1fr)',
                      gap: 10,
                    }}
                  >
                    {depts.map((d) => (
                      <DepartmentCard
                        key={d.code}
                        dept={d}
                        selected={selectedCodes.includes(d.code)}
                        onToggle={() => toggle(d.code)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: 11.5, color: canSubmit ? '#9BA3C4' : '#B45309', marginTop: 14, fontWeight: 600 }}>
            ℹ️ Minimum {MIN_REQUIRED} departments required.
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 18 }}>
            <button type="button" className="btn bs" onClick={onBack}>
              Back
            </button>
            <button type="button" className="btn bp" onClick={onSubmit} disabled={!canSubmit}>
              Complete Setup →
            </button>
          </div>
        </>
      )}
    </>
  );
}
