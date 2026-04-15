import { useState } from 'react';

interface ESGModalProps {
  onClose: () => void;
}

export function ESGModal({ onClose }: ESGModalProps) {
  const [step, setStep] = useState<'config' | 'processing' | 'result'>('config');
  const [activeSteps, setActiveSteps] = useState<number[]>([]);
  const [progress, setProgress] = useState(0);

  const startGeneration = () => {
    setStep('processing');
    const delays = [600, 1400, 2400, 3400, 4400];
    delays.forEach((dl, i) => {
      setTimeout(() => {
        setActiveSteps((prev) => [...prev, i]);
        setProgress((i + 1) * 20);
      }, dl);
    });
    setTimeout(() => setStep('result'), 5500);
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" style={{ width: 660 }}>
        {step === 'config' && (
          <>
            <div style={{ padding: '22px 26px 18px', borderBottom: '1px solid #ECEEF8', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#1A1D2E', marginBottom: 2 }}>Generate ESG Report</div>
                <div style={{ fontSize: 11, color: '#5A6080' }}>Configure parameters & upload source documents</div>
              </div>
              <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: '50%', border: '1.5px solid #E2E4F0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="#5A6080" strokeWidth="1.4" strokeLinecap="round" /></svg>
              </button>
            </div>
            <div style={{ padding: '22px 26px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div><label className="fl-label">Reporting Year</label><select className="inp sel"><option>FY 2025</option></select></div>
                <div><label className="fl-label">Industry Sector</label><select className="inp sel"><option>Financial Services – Asset Mgmt</option></select></div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label className="fl-label">ESG Frameworks</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7, marginTop: 4 }}>
                  {['GRI 2021', 'IFRS S1/S2', 'TCFD', 'SAMA ESG', 'CMA CGR', 'SGI'].map((fw) => (
                    <label key={fw} className="fw-chip sel">
                      <input type="checkbox" defaultChecked />
                      <div><div style={{ fontSize: 11, fontWeight: 700, color: '#1A1D2E' }}>{fw}</div></div>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="fl-label">Upload Source Documents</label>
                <div className="upload-z">
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1D2E', marginBottom: 3 }}>Click to upload documents</div>
                  <div style={{ fontSize: 11, color: '#9BA3C4' }}>PDF, Excel, CSV, Word · Annual reports, HR data, financial statements</div>
                </div>
              </div>
            </div>
            <div style={{ padding: '14px 26px', borderTop: '1px solid #ECEEF8', display: 'flex', justifyContent: 'flex-end', gap: 9 }}>
              <button className="btn bs" onClick={onClose}>Cancel</button>
              <button className="btn bp" onClick={startGeneration}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ marginRight: 5 }}><path d="M6 1l1.1 3.3H11L8.5 6.4l1.1 3.3L6 7.8l-3.6 2 1.1-3.3L1 4.3h3.9z" fill="white" /></svg>
                Generate ESG Report
              </button>
            </div>
          </>
        )}

        {step === 'processing' && (
          <div style={{ padding: '30px 26px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div className="proc-ring" style={{ marginBottom: 16 }} />
            <div style={{ fontSize: 16, fontWeight: 800, color: '#1A1D2E', marginBottom: 3 }}>Processing Your Documents</div>
            <div style={{ fontSize: 12, color: '#5A6080', marginBottom: 18 }}>This takes 15–30 seconds</div>
            <div style={{ width: '100%', maxWidth: 360 }}>
              {['Uploading & reading documents', 'Extracting ESG data points', 'Mapping to GRI / IFRS / SAMA metrics', 'Calculating pillar scores & coverage', 'Identifying gaps & generating questions'].map((txt, i) => (
                <div key={i} className={`proc-step ${activeSteps.includes(i) ? 'done' : ''}`}>
                  <div className="proc-dot" />
                  <span className="proc-txt">{txt}</span>
                  <div className="proc-ck"><svg viewBox="0 0 9 9" fill="none"><path d="M2 4.5l1.8 1.8 3.2-3.2" stroke="white" strokeWidth="1.3" strokeLinecap="round" /></svg></div>
                </div>
              ))}
            </div>
            <div style={{ width: '100%', height: 4, background: '#E8EAF5', borderRadius: 2, overflow: 'hidden', marginTop: 12 }}>
              <div style={{ height: '100%', background: 'linear-gradient(90deg,#4040C8,#6366F1)', borderRadius: 2, width: `${progress}%`, transition: 'width .4s ease' }} />
            </div>
            <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 7 }}>{progress}% complete</div>
          </div>
        )}

        {step === 'result' && (
          <div style={{ padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#1A1D2E', marginBottom: 2 }}>ESG Report Generated</div>
                <div style={{ fontSize: 12, color: '#5A6080' }}>Al-Noor Capital · FY 2025 · 33 of 36 metrics</div>
              </div>
              <div style={{ display: 'flex', gap: 7 }}>
                <button className="btn bs bsm" onClick={onClose}>Close</button>
                <button className="btn bp bsm" onClick={onClose}>View Report →</button>
              </div>
            </div>
            <div className="pillar-cards">
              {[
                { cls: 'e', emoji: '🌿', label: 'Environmental', score: 82, name: 'Environmental Score', meta: '10 of 12 · GRI 300 Series', pct: 83, fill: 'linear-gradient(90deg,#16A34A,#10B981)', color: '#059669' },
                { cls: 's', emoji: '👥', label: 'Social', score: 74, name: 'Social Score', meta: '11 of 12 · GRI 400 Series', pct: 91, fill: 'linear-gradient(90deg,#0369A1,#06B6D4)', color: '#0891B2' },
                { cls: 'g', emoji: '🏛', label: 'Governance', score: 79, name: 'Governance Score', meta: '9 of 12 · GRI 200 / CMA', pct: 75, fill: 'linear-gradient(90deg,#4C1D95,#7C3AED)', color: '#7C3AED' },
              ].map((p) => (
                <div key={p.cls} className={`pc ${p.cls}`}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 7, opacity: .8, color: p.color }}>{p.emoji} {p.label}</div>
                  <div className="pc-score" style={{ color: p.color }}>{p.score}</div>
                  <div className="pc-name">{p.name}</div>
                  <div className="pc-meta">{p.meta}</div>
                  <div className="pc-bar"><div className="pc-fill" style={{ width: `${p.pct}%`, background: p.fill }} /></div>
                  <div className="pc-pct" style={{ color: p.color }}>{p.pct}% coverage</div>
                </div>
              ))}
            </div>
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 9, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 9 }}>
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="6" stroke="#F59E0B" strokeWidth="1.3" /><path d="M7.5 5v3.5M7.5 10v.3" stroke="#F59E0B" strokeWidth="1.3" strokeLinecap="round" /></svg>
              <span style={{ fontSize: 12, color: '#92400E', flex: 1 }}><b>3 critical gaps</b> found — up to +27 score points recoverable.</span>
              <button className="btn bp bsm">Generate Questions</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
