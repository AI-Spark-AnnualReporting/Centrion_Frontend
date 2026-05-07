import { useState } from 'react';
import { DashboardESG } from '@/components/dashboard/DashboardESG';
import { DashboardBoard } from '@/components/dashboard/DashboardBoard';
import { ESGModal } from '@/components/shared/ESGModal';
import { useAuth } from '@/context/AuthContext';

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<'esg' | 'brd'>('esg');
  const [esgModalOpen, setEsgModalOpen] = useState(false);
  const { user } = useAuth();
  const company = user?.company_name ?? 'Your company';

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1A1D2E', letterSpacing: '-.5px', marginBottom: 3 }}>Command Center</h2>
          <p style={{ fontSize: 12, color: '#5A6080' }}>{company} &nbsp;·&nbsp; ESG &amp; IR Intelligence Overview</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="tabs" style={{ marginBottom: 0 }}>
            <button className={`tab ${activeTab === 'esg' ? 'act' : ''}`} onClick={() => setActiveTab('esg')}>ESG</button>
            {/* Financial tab hidden until the financial dashboard is wired up. */}
            <button className={`tab ${activeTab === 'brd' ? 'act' : ''}`} onClick={() => setActiveTab('brd')}>Board</button>
          </div>
          <button className="btn bp bsm" onClick={() => setEsgModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="white" strokeWidth="1.5" strokeLinecap="round" /></svg>
            Generate Report
          </button>
        </div>
      </div>

      {activeTab === 'esg' && <DashboardESG />}
      {activeTab === 'brd' && <DashboardBoard />}

      {esgModalOpen && <ESGModal onClose={() => setEsgModalOpen(false)} />}
    </div>
  );
}
