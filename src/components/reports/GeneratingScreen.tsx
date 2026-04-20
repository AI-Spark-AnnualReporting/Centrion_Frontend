import { useEffect, useState } from 'react';

const STEPS = [
  'Uploading & reading documents',
  'Extracting ESG data points',
  'Mapping to GRI / IFRS / SAMA metrics',
  'Calculating pillar scores & coverage',
  'Identifying gaps & scoring impacts',
];

interface GeneratingScreenProps {
  onComplete?: () => void;
  onCancel?: () => void;
}

export function GeneratingScreen({ onComplete, onCancel }: GeneratingScreenProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [doneSteps, setDoneSteps] = useState<number[]>([]);
  const [progress, setProgress] = useState(8);

  useEffect(() => {
    const stepDuration = 2200;
    const timers: number[] = [];

    STEPS.forEach((_, i) => {
      timers.push(
        window.setTimeout(() => {
          setDoneSteps((prev) => [...prev, i]);
          setActiveIdx(i + 1);
          setProgress(Math.round(((i + 1) / STEPS.length) * 100));
        }, (i + 1) * stepDuration)
      );
    });

    // Smooth progress trickle between steps.
    const trickle = window.setInterval(() => {
      setProgress((p) => {
        const cap = Math.round(((activeIdx + 1) / STEPS.length) * 100) - 2;
        return p < cap ? p + 1 : p;
      });
    }, 180);
    timers.push(trickle);

    timers.push(
      window.setTimeout(() => {
        onComplete?.();
      }, STEPS.length * stepDuration + 600)
    );

    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="card" style={{ padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', animation: 'fade-in .4s ease-out' }}>
      <div className="proc-ring" style={{ marginBottom: 18 }} />
      <div style={{ fontSize: 18, fontWeight: 800, color: '#1A1D2E', marginBottom: 4 }}>Generating ESG Report</div>
      <div style={{ fontSize: 12, color: '#5A6080', marginBottom: 22 }}>
        Extracting, mapping & scoring metrics from your documents
      </div>

      <div style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {STEPS.map((txt, i) => {
          const isDone = doneSteps.includes(i);
          const isActive = !isDone && i === activeIdx;
          const cls = `proc-step ${isDone ? 'done' : isActive ? 'act' : ''}`;
          return (
            <div key={i} className={cls} style={{ animation: isActive ? 'fade-in .3s ease-out' : undefined }}>
              <div className="proc-dot" />
              <span className="proc-txt">{txt}</span>
              <div className="proc-ck">
                <svg viewBox="0 0 9 9" fill="none">
                  <path d="M2 4.5l1.8 1.8 3.2-3.2" stroke="white" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ width: '100%', maxWidth: 520, height: 5, background: '#E8EAF5', borderRadius: 3, overflow: 'hidden', marginTop: 22 }}>
        <div style={{ height: '100%', background: 'linear-gradient(90deg,#4040C8,#6366F1)', borderRadius: 3, width: `${progress}%`, transition: 'width .4s ease' }} />
      </div>
      <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 8, fontFamily: "'DM Mono',monospace" }}>{progress}% complete</div>

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          style={{ marginTop: 22, padding: '8px 18px', fontSize: 11, fontWeight: 600, color: '#5A6080', background: 'transparent', border: '1px solid #E2E4F0', borderRadius: 8, cursor: 'pointer' }}
        >
          Cancel
        </button>
      )}
    </div>
  );
}
