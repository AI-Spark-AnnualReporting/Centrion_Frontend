// Shared recipient chip — used by the History → Email sends compose flow
// (CommunicationHubPage's ExternalEmailModal) and the per-thread "Send
// externally" action (SendExternalModal), which both compose to the same
// { name, org, contact, email } recipient shape.
export function RecipientChip({ label, count, onRemove }: { label: string; count?: number; onRemove?: () => void }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 9px 6px 12px',
        borderRadius: 20,
        background: '#E7F7EE',
        color: '#15803D',
        fontSize: 12.5,
        fontWeight: 600,
      }}
    >
      {label}
      {count != null && <span style={{ fontSize: 11.5, fontWeight: 800, color: '#16A34A', opacity: 0.85 }}>{count}</span>}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        style={{ display: 'inline-flex', border: 'none', background: 'transparent', color: '#4BAF79', cursor: 'pointer', padding: 0 }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
    </span>
  );
}
