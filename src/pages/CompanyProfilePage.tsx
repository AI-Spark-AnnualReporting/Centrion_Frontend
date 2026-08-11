import { useState } from 'react';
import { CompanyDetailsCard } from '@/components/profile/CompanyDetailsCard';
import BrandIdentityPage from '@/pages/BrandIdentityPage';

type Tab = 'details' | 'brand';

// Company-level profile: the company details card (from the old combined
// Profile page) and the whole former Brand Identity page, now folded in as a
// tab here rather than a separate sidebar item. Visible to anyone with
// profile access; editing stays admin-only — CompanyDetailsCard and
// BrandIdentityPage each already gate their own fields on role === 'admin'.
export default function CompanyProfilePage() {
  const [activeTab, setActiveTab] = useState<Tab>('details');

  return (
    <div style={{ paddingBottom: 96 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>
            {activeTab === 'details' ? 'Company Profile' : 'Brand Identity'}
          </h2>
          <p style={{ fontSize: 11, color: '#5A6080', marginTop: 2 }}>
            {activeTab === 'details'
              ? "Your organisation's details, reporting preferences and brand identity"
              : 'Your logo, brand language and colors — used across the reports you generate'}
          </p>
        </div>
        <div className="tabs" style={{ marginBottom: 0 }}>
          <button className={`tab ${activeTab === 'details' ? 'act' : ''}`} onClick={() => setActiveTab('details')}>
            Company Details
          </button>
          <button className={`tab ${activeTab === 'brand' ? 'act' : ''}`} onClick={() => setActiveTab('brand')}>
            Brand Identity
          </button>
        </div>
      </div>

      {activeTab === 'details' && <CompanyDetailsCard />}
      {activeTab === 'brand' && <BrandIdentityPage hideHeading />}
    </div>
  );
}
