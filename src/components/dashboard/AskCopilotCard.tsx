import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Ask Copilot — a compact composer that hands the typed question to the AI Copilot
 * page (/ai) via route state; AIPage auto-sends it once the session hydrates.
 */

const SUGGESTIONS = ['Draft a board summary', 'GRI gap analysis', 'Summarise our ESG disclosures', 'Draft an AGM notice'];

export function AskCopilotCard() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  const go = (text: string) => {
    const t = text.trim();
    if (!t) return;
    navigate('/ai', { state: { q: t } });
  };

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 14, padding: '18px 20px', color: '#fff', background: 'linear-gradient(135deg, #4A47D4 0%, #3736AE 55%, #2E2D93 100%)', boxShadow: '0 14px 30px rgba(53,53,181,.28)' }}>
      <div style={{ position: 'absolute', top: -40, right: -30, width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,.12), transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
            <path d="M8 1l1.4 4.1L13.5 6.5 9.4 8 8 12 6.6 8 2.5 6.5 6.6 5.1 8 1z" fill="#fff" />
          </svg>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.6px', textTransform: 'uppercase', color: 'rgba(255,255,255,.9)' }}>Ask Copilot</span>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') go(q); }}
            placeholder="Ask anything about disclosures, KPIs, or draft content…"
            style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: '#fff', background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)', borderRadius: 9, padding: '9px 12px', outline: 'none', fontFamily: 'inherit' }}
          />
          <button
            type="button"
            onClick={() => go(q)}
            style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 800, color: '#3736AE', background: '#fff', border: 'none', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}
          >
            Open Copilot
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => go(s)}
              style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.92)', background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.16)', borderRadius: 20, padding: '5px 11px', cursor: 'pointer' }}
            >
              {s} ↗
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default AskCopilotCard;
