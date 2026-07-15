import { ReportStartCards } from '@/components/dashboard/ReportStartCards';

// First-run welcome screen — shown on the dashboard when the company has no
// reports AND no uploaded documents. Guides the user to start their first report
// (ESG / Quarterly / Annual). Once documents are uploaded the personal
// DashboardWorkspace takes over.

export function DashboardWelcome({ company }: { company: string }) {
  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '8px 0 24px' }}>
      {/* Intro */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 12,
            background: '#4040C8',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 14,
            boxShadow: '0 8px 22px rgba(64,64,200,.28)',
          }}
        >
          <svg viewBox="0 0 16 16" fill="none" width="20" height="20">
            <rect x="1" y="1" width="6" height="6" rx="1.2" fill="white" />
            <rect x="9" y="1" width="6" height="6" rx="1.2" fill="white" opacity=".4" />
            <rect x="1" y="9" width="6" height="6" rx="1.2" fill="white" opacity=".4" />
            <rect x="9" y="9" width="6" height="6" rx="1.2" fill="white" />
          </svg>
        </div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '1px',
            color: '#9BA3C4',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          Centriyon · {company}
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#1A1D2E', letterSpacing: '-.5px', marginBottom: 10 }}>
          Welcome to Centriyon
        </h1>
        <p style={{ fontSize: 12.5, color: '#5A6080', lineHeight: 1.7, maxWidth: 580, margin: '0 auto' }}>
          Your AI workspace for regulated corporate reporting. Centriyon turns source documents into
          board- and investor-ready reports — with traceable figures, linked drivers, and CMA / Tadawul-aligned
          disclosures. Pick a report below to begin.
        </p>
      </div>

      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '.6px',
          color: '#9BA3C4',
          textTransform: 'uppercase',
          marginBottom: 12,
        }}
      >
        Choose a report to start
      </div>

      {/* Report cards */}
      <div style={{ marginBottom: 16 }}>
        <ReportStartCards />
      </div>

      {/* How it works */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          padding: '14px 18px',
          borderRadius: 12,
          background: 'rgba(64,64,200,.05)',
          border: '1px solid rgba(64,64,200,.15)',
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: '#EEEEFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: '#4040C8',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M7.5 1L2 8h4l-.5 5L11 6H7l.5-5z" fill="currentColor" />
          </svg>
        </div>
        <div style={{ fontSize: 11.5, color: '#3A3F5C', lineHeight: 1.6 }}>
          <strong style={{ color: '#1A1D2E' }}>How Centriyon works.</strong> Every report is document-first —
          upload your source files, and the AI extracts the numbers and the reasons behind them, asks only about
          what it couldn't find, and never invents a figure. You review, edit, and publish — with full source
          traceability on every line.
        </div>
      </div>
    </div>
  );
}
