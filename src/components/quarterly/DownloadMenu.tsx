import { useState, useRef, useEffect } from 'react';
import { quarterlyReports } from '@/lib/api';

const ACCENT = '#4040C8';
const ACCENT_LIGHT = 'rgba(64,64,200,.07)';
const RED = '#EF4444';
const DARK = '#1F2340';

// Export dropdown (PDF / Word) — extracted from the old preview footer so the new
// Preview screen reuses it. Wraps quarterlyReports.downloadExport (binary blob).
export function DownloadMenu({
  companyId,
  reportId,
  title,
  disabled = false,
  label = 'Export',
}: {
  companyId: string | null;
  reportId: string | null;
  title?: string;
  disabled?: boolean;
  label?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [downloading, setDownloading] = useState<null | 'pdf' | 'docx'>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Close the menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const handleDownload = async (fmt: 'pdf' | 'docx') => {
    if (!companyId || !reportId) return;
    setMenuOpen(false);
    setDownloadError(null);
    setDownloading(fmt);
    try {
      await quarterlyReports.downloadExport(companyId, reportId, fmt, title);
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : 'Download failed.');
    } finally {
      setDownloading(null);
    }
  };

  const isDisabled = disabled || !!downloading || !companyId || !reportId;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {downloadError && (
        <div
          style={{
            position: 'absolute', bottom: 'calc(100% + 8px)', right: 0,
            background: '#FEF2F2', border: `1px solid ${RED}`, color: RED,
            borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 600,
            maxWidth: 260, zIndex: 20,
          }}
        >
          {downloadError}
        </div>
      )}

      <button
        className="bp"
        style={{ fontSize: 14, padding: '10px 24px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, opacity: isDisabled ? 0.6 : 1 }}
        disabled={isDisabled}
        onClick={() => setMenuOpen((o) => !o)}
      >
        {downloading ? 'Preparing…' : label}
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
          <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {menuOpen && !downloading && (
        <div
          style={{
            position: 'absolute', bottom: 'calc(100% + 8px)', right: 0,
            background: '#fff', border: '1px solid #E5E7EF', borderRadius: 10,
            boxShadow: '0 8px 24px rgba(31,35,64,.14)', padding: 6, minWidth: 180, zIndex: 20,
          }}
        >
          {([
            { fmt: 'pdf' as const, label: 'PDF' },
            { fmt: 'docx' as const, label: 'Word (.docx)' },
          ]).map((opt) => (
            <button
              key={opt.fmt}
              onClick={() => handleDownload(opt.fmt)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '9px 12px', fontSize: 13, fontWeight: 600, color: DARK,
                background: 'transparent', border: 'none', borderRadius: 7,
                cursor: 'pointer', textAlign: 'left',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = ACCENT_LIGHT)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                <path d="M6 1.5v6m0 0L3.5 5m2.5 2.5L8.5 5M2 9.5h8" stroke={ACCENT} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
