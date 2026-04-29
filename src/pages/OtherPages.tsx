const pages = {
  CompliancePage: { title: 'Compliance', desc: 'Regulatory compliance monitoring', content: 'SAMA, CMA, Tadawul regulatory tracking' },
  MeetingsPage: { title: 'Board & Meetings', desc: 'Meeting schedules and board governance', content: 'Upcoming meetings and board activities' },
  CommsPage: { title: 'Comms Hub', desc: 'Stakeholder communication management', content: 'Messages and communications' },
  StakeholdersPage: { title: 'Boards & Investors', desc: 'Stakeholder profiles and management', content: 'Board members and investors' },
};

function PlaceholderPage({ title, desc }: { title: string; desc: string }) {
  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>{title}</h2>
        <p style={{ fontSize: 11, color: '#5A6080', marginTop: 2 }}>{desc}</p>
      </div>
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: '#9BA3C4' }}>Page content ready for backend integration</div>
      </div>
    </div>
  );
}

export function CompliancePage() { return <PlaceholderPage {...pages.CompliancePage} />; }
export function MeetingsPage() { return <PlaceholderPage {...pages.MeetingsPage} />; }
export function CommsPage() { return <PlaceholderPage {...pages.CommsPage} />; }
export function StakeholdersPage() { return <PlaceholderPage {...pages.StakeholdersPage} />; }
