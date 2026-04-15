import { useState } from 'react';

const AI_RESPONSES = [
  'Your ESG score is <b>78/100</b>. Environmental 82, Social 74, Governance 79. Resolving 3 missing metrics adds ~27 pts.',
  'Next deadline: <b>SAMA Q1 Filing — April 18</b> (5 days away). Sector concentration breach (40.1% vs 35% limit) needs urgent attention.',
  'Missing: <b>Carbon Intensity (GRI 305-4)</b> — CRITICAL, <b>Board Size (GRI 2-9)</b> — CRITICAL, <b>Executive Pay Ratio (GRI 2-21)</b> — HIGH.',
];

export default function AIPage() {
  const [messages, setMessages] = useState([
    { type: 'ai', text: 'Hi Ahmad! I have full access to your ESG data, reports and compliance requirements. Ask me anything.', time: 'Just now' },
  ]);
  const [input, setInput] = useState('');
  const [aiIdx, setAiIdx] = useState(0);

  const sendMessage = (text?: string) => {
    const msg = text || input.trim();
    if (!msg) return;
    setInput('');
    setMessages((prev) => [...prev, { type: 'user', text: msg, time: 'Just now' }]);
    setTimeout(() => {
      setMessages((prev) => [...prev, { type: 'ai', text: AI_RESPONSES[aiIdx % AI_RESPONSES.length], time: 'Just now' }]);
      setAiIdx((prev) => prev + 1);
    }, 800);
  };

  return (
    <div>
      <div style={{ marginBottom: 14 }}><h2 style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>IR Copilot</h2><p style={{ fontSize: 11, color: '#5A6080', marginTop: 2 }}>AI-powered ESG & IR assistant</p></div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="chat-area" style={{ height: 500 }}>
          <div className="chat-msgs" id="chat-messages">
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.type === 'user' ? 'u' : 'ai'}`}>
                {m.type === 'ai' && <div className="av" style={{ background: 'linear-gradient(135deg,#4040C8,#7C3AED)', width: 24, height: 24, fontSize: 8, flexShrink: 0, marginTop: 2 }}>AI</div>}
                <div>
                  <div className="msg-bub" dangerouslySetInnerHTML={{ __html: m.text }} />
                  <div className="msg-time">{m.time}</div>
                </div>
                {m.type === 'user' && <div className="av" style={{ background: '#3535B5', width: 24, height: 24, fontSize: 8 }}>AR</div>}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderTop: '1px solid #ECEEF8', flexWrap: 'wrap' }}>
            {['ESG score breakdown', 'Next deadline?', 'Missing metrics', 'Draft Q4 summary'].map((chip) => (
              <span key={chip} onClick={() => sendMessage(chip)} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 10, background: '#F2F3FA', border: '1px solid #E2E4F0', color: '#5A6080', cursor: 'pointer' }}>{chip}</span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #E2E4F0', background: '#fff' }}>
            <input className="inp" style={{ flex: 1, borderRadius: 22, padding: '9px 13px' }} placeholder="Ask about ESG, reports, compliance..." value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} />
            <button onClick={() => sendMessage()} style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: '#4040C8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 3px 10px rgba(64,64,200,.3)' }}>
              <svg viewBox="0 0 13 13" fill="none" width="14" height="14"><path d="M11 6.5H2M8.5 4l2.5 2.5-2.5 2.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
