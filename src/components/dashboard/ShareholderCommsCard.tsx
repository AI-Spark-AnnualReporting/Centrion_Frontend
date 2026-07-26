/**
 * Shareholder Comms — static mockup. The backend for shareholder communications is
 * being built by a teammate; this is the front-end design only, to be wired up later.
 */

const ACCENT = '#4040C8';

interface Comm {
  initials: string;
  avatarColor: string;
  title: string;
  subtitle: string;
  status: { text: string; color: string; bg: string };
}

const COMMS: Comm[] = [
  {
    initials: 'EH',
    avatarColor: '#0F9D6B',
    title: 'Q3 Earnings Highlights',
    subtitle: 'Sent Nov 12 · 68% open rate',
    status: { text: 'SENT', color: '#16A34A', bg: 'rgba(34,197,94,.12)' },
  },
  {
    initials: 'ES',
    avatarColor: '#4040C8',
    title: 'ESG Progress Update',
    subtitle: 'Pending approval · Dec 15',
    status: { text: 'APPROVAL', color: '#4040C8', bg: 'rgba(64,64,200,.12)' },
  },
  {
    initials: 'AG',
    avatarColor: '#E5484D',
    title: 'AGM Notice — Apr 15',
    subtitle: 'Action needed · Mar 25',
    status: { text: 'URGENT', color: '#E5484D', bg: 'rgba(229,72,77,.12)' },
  },
];

export function ShareholderCommsCard() {
  return (
    <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4040C8', flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.6px', textTransform: 'uppercase', color: '#5A6080' }}>Shareholder Comms</span>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#C7CBDA' }}>Hub →</span>
      </div>
      <div style={{ height: 1, background: '#ECEEF8', margin: '8px 0 2px' }} />

      {COMMS.map((c, i) => (
        <div key={c.title} style={{ display: 'flex', gap: 11, alignItems: 'center', padding: '11px 0', borderTop: i ? '1px solid #F4F5FA' : 'none' }}>
          <span style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: c.avatarColor, background: `${c.avatarColor}1A` }}>{c.initials}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1A1D2E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
            <div style={{ fontSize: 10.5, color: '#9BA3C4', marginTop: 1 }}>{c.subtitle}</div>
          </div>
          <span style={{ fontSize: 9, fontWeight: 800, color: c.status.color, background: c.status.bg, padding: '3px 8px', borderRadius: 999, letterSpacing: '.4px', flexShrink: 0 }}>{c.status.text}</span>
        </div>
      ))}

      <div style={{ marginTop: 'auto', paddingTop: 12, fontSize: 10, color: '#C7CBDA', fontStyle: 'italic' }}>Preview — comms hub coming soon</div>
    </div>
  );
}

export default ShareholderCommsCard;
