import { useState } from 'react';
import { DashboardESG } from './DashboardESG';
import { DashboardFinancial } from './DashboardFinancial';
import { DashboardBoard } from './DashboardBoard';
import { ESGModal } from '../shared/ESGModal';

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<'esg' | 'fin' | 'brd'>('esg');
  const [esgModalOpen, setEsgModalOpen] = useState(false);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1A1D2E', letterSpacing: '-.5px', marginBottom: 3 }}>Command Center</h2>
          <p style={{ fontSize: 12, color: '#5A6080' }}>Al-Noor Capital &nbsp;·&nbsp; FY 2025 &nbsp;·&nbsp; ESG & IR Intelligence Overview</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="tabs" style={{ marginBottom: 0 }}>
            <button className={`tab ${activeTab === 'esg' ? 'act' : ''}`} onClick={() => setActiveTab('esg')}>ESG</button>
            <button className={`tab ${activeTab === 'fin' ? 'act' : ''}`} onClick={() => setActiveTab('fin')}>Financial</button>
            <button className={`tab ${activeTab === 'brd' ? 'act' : ''}`} onClick={() => setActiveTab('brd')}>Board</button>
          </div>
          <button className="btn bp bsm" onClick={() => setEsgModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="white" strokeWidth="1.5" strokeLinecap="round" /></svg>
            Generate Report
          </button>
        </div>
      </div>

      {activeTab === 'esg' && <DashboardESG />}
      {activeTab === 'fin' && <DashboardFinancial />}
      {activeTab === 'brd' && <DashboardBoard />}

      {/* News */}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#1A1D2E', letterSpacing: '-.2px' }}>ESG & Regulatory News</div>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#22C55E', fontWeight: 700 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', animation: 'dpulse 2s infinite' }} />Live Feed
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 12 }}>
          {[
            { tag: 'SAMA Update', tagBg: '#EEEEFF', tagColor: '#4040C8', time: '2h ago', title: 'SAMA releases updated ESG disclosure framework for Q1 2025 filings', desc: 'New requirements include Scope 3 and board diversity metrics for all licensed fund managers.' },
            { tag: 'GRI Standard', tagBg: 'rgba(34,197,94,.1)', tagColor: '#16A34A', time: '1d ago', title: 'GRI confirms IFRS S2 alignment for climate disclosures effective Jan 2025', desc: 'Cross-referencing between GRI 305 and IFRS S2 now streamlined for dual-standard reporters.' },
            { tag: 'Tadawul', tagBg: '#EEEEFF', tagColor: '#4040C8', time: '2d ago', title: 'Saudi Exchange mandates ESG score disclosure for all listed entities by Mar 2025', desc: 'All listed companies must disclose certified ESG scores using CMA-approved methodology.' },
            { tag: 'Vision 2030', tagBg: 'rgba(34,197,94,.1)', tagColor: '#16A34A', time: '3d ago', title: 'Saudi Green Initiative reaches 400M tree planting milestone ahead of 2030 target', desc: 'SGI-aligned fund managers see 14% improvement in ESG ratings from international agencies.' },
          ].map((n, i) => (
            <div key={i} className="card" style={{ padding: 14, cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 9, fontWeight: 700, background: n.tagBg, color: n.tagColor, padding: '2px 8px', borderRadius: 4 }}>{n.tag}</span>
                <span style={{ fontSize: 9, color: '#9BA3C4', marginLeft: 'auto' }}>{n.time}</span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1A1D2E', lineHeight: 1.45, marginBottom: 6 }}>{n.title}</div>
              <div style={{ fontSize: 10, color: '#5A6080', lineHeight: 1.5 }}>{n.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {esgModalOpen && <ESGModal onClose={() => setEsgModalOpen(false)} />}
    </div>
  );
}
