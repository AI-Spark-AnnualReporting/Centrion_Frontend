import { useEffect, useMemo, useState } from 'react';
import { auth } from '@/lib/api';
import type { DepartmentCategory, DepartmentOption } from '@/types/auth';

const PRIMARY = '#4040C8';
const MIN_REQUIRED = 3;

// Coloured code badge per department (falls back to indigo for unknown codes).
const DEPT_COLORS: Record<string, string> = {
  FIN: '#3B82F6', ESG: '#16A34A', IR: '#7C5CFC', HR: '#F59E0B', OPS: '#EF4444',
  LGL: '#64748B', COM: '#F97316', TECH: '#06B6D4', RISK: '#E11D48', STRAT: '#8B5CF6',
  EXEC: '#4F46E5',
};
const colorFor = (code: string) => DEPT_COLORS[code.toUpperCase()] ?? PRIMARY;

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
  const c = colorFor(dept.code);
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        position: 'relative',
        display: 'block',
        padding: '16px 18px',
        border: `1.5px solid ${selected ? c : '#E8EAF3'}`,
        borderRadius: 12,
        background: selected ? `${c}0D` : '#fff',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        transition: 'border-color .15s, background .15s',
      }}
    >
      {/* check circle, top-right */}
      <span
        style={{
          position: 'absolute',
          top: 14,
          right: 14,
          width: 22,
          height: 22,
          borderRadius: '50%',
          flexShrink: 0,
          border: selected ? 'none' : '1.5px solid #D2D6E6',
          background: selected ? c : '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 6.2l2.2 2.2L9.5 3.6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>

      <span
        style={{
          display: 'inline-block',
          fontSize: 10.5,
          fontWeight: 800,
          fontFamily: "'DM Mono', monospace",
          letterSpacing: '.5px',
          color: c,
          background: `${c}1A`,
          padding: '3px 8px',
          borderRadius: 5,
          marginBottom: 10,
        }}
      >
        {dept.code}
      </span>
      <span style={{ display: 'block', fontSize: 15, fontWeight: 800, color: '#1A1D2E', paddingRight: 28 }}>
        {dept.name}
      </span>
      <span style={{ display: 'block', fontSize: 12.5, color: '#5A6080', lineHeight: 1.5, marginTop: 4 }}>
        {dept.description}
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
      leadership: [], core: [], commercial: [], support: [],
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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <h2 style={{ marginBottom: 4 }}>Select Your Departments</h2>
        {!loading && !error && (
          <div style={{ display: 'flex', gap: 14, paddingTop: 6 }}>
            <button type="button" onClick={() => onSelect(options.map((d) => d.code))}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: PRIMARY, fontSize: 12.5, fontWeight: 700, padding: 0 }}>
              Select all
            </button>
            <span style={{ color: '#C9CDE4' }}>·</span>
            <button type="button" onClick={() => onSelect([])}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: PRIMARY, fontSize: 12.5, fontWeight: 700, padding: 0 }}>
              Clear
            </button>
          </div>
        )}
      </div>
      <p>Each gets its own AI agent trained on your context. Add more later.</p>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skel" style={{ height: 92, borderRadius: 12 }} />
          ))}
        </div>
      ) : error ? (
        <div style={{ marginTop: 8, textAlign: 'center', padding: '24px 12px' }}>
          <div style={{ fontSize: 12, color: '#DC2626', fontWeight: 600, marginBottom: 10 }}>{error}</div>
          <button type="button" className="btn bs" onClick={load}>Retry</button>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: PRIMARY, margin: '2px 0 14px' }}>
            {selectedCodes.length} / {options.length} selected
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxHeight: 340, overflowY: 'auto', paddingRight: 6 }}>
            {CATEGORY_ORDER.map(({ key, label, fullWidth }) => {
              const depts = grouped[key];
              if (!depts || depts.length === 0) return null;
              return (
                <div key={key}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.7px', textTransform: 'uppercase', color: '#9BA3C4', marginBottom: 9 }}>
                    {label}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: fullWidth ? '1fr' : 'repeat(2, 1fr)', gap: 12 }}>
                    {depts.map((d) => (
                      <DepartmentCard key={d.code} dept={d} selected={selectedCodes.includes(d.code)} onToggle={() => toggle(d.code)} />
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
            <button type="button" className="btn bs" onClick={onBack}>Back</button>
            <button type="button" className="btn bp" onClick={onSubmit} disabled={!canSubmit}>Continue →</button>
          </div>
        </>
      )}
    </>
  );
}
