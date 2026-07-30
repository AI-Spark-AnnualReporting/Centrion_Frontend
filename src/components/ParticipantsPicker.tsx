import { useEffect, useMemo, useState } from 'react';
import { team, type TeamMember } from '@/lib/api';
import AddPersonDialog from '@/components/AddPersonDialog';

// Participant chooser shared by the Schedule and Edit meeting modals: chips for
// who's in, a type-ahead over the company team, and a shortcut to provision
// someone who isn't on it yet. Chips rather than a comma-separated text field
// because only addresses can actually be invited, and a chip can't be
// half-typed.
export default function ParticipantsPicker({
  value,
  onChange,
  companyId,
  companyName,
}: {
  value: string[];
  onChange: (emails: string[]) => void;
  companyId: string | null;
  companyName: string;
}) {
  const [teamList, setTeamList] = useState<TeamMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  const fetchTeam = async () => {
    if (!companyId) return;
    setTeamLoading(true);
    setTeamError(null);
    try {
      setTeamList(await team.list(companyId));
    } catch (e) {
      setTeamError(e instanceof Error ? e.message : 'Failed to load team.');
    } finally {
      setTeamLoading(false);
    }
  };

  useEffect(() => {
    void fetchTeam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const add = (email: string) => {
    if (!email) return;
    if (!value.includes(email)) onChange([...value, email]);
    setQuery('');
  };

  const remove = (email: string) => onChange(value.filter((p) => p !== email));

  const teamByEmail = useMemo(() => {
    const map = new Map<string, TeamMember>();
    for (const m of teamList) if (m.email) map.set(m.email, m);
    return map;
  }, [teamList]);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return teamList
      .filter((m) => !!m.email && !value.includes(m.email))
      .filter((m) => {
        if (!q) return true;
        return (
          (m.full_name ?? '').toLowerCase().includes(q) ||
          (m.email ?? '').toLowerCase().includes(q)
        );
      })
      .slice(0, 6);
  }, [teamList, value, query]);

  const initialsFor = (m: TeamMember | undefined, email: string): string => {
    const name = m?.full_name?.trim();
    if (name) {
      const parts = name.split(/\s+/).filter(Boolean);
      const first = parts[0]?.[0] ?? '';
      const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
      return (first + last).toUpperCase() || '?';
    }
    return (email[0] ?? '?').toUpperCase();
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}
      >
        <span className="fl-label" style={{ marginBottom: 0 }}>
          Participants
        </span>
        <button
          type="button"
          onClick={() => setAddPersonOpen(true)}
          disabled={!companyId}
          title="Add new person"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            fontWeight: 700,
            color: '#4040C8',
            background: 'rgba(64,64,200,.08)',
            border: '1px solid rgba(64,64,200,.2)',
            borderRadius: 8,
            padding: '3px 9px',
            cursor: companyId ? 'pointer' : 'not-allowed',
            opacity: companyId ? 1 : 0.5,
          }}
        >
          <svg width="9" height="9" viewBox="0 0 11 11" fill="none">
            <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          Add Person
        </button>
      </div>

      <div style={{ position: 'relative' }}>
        <div
          onClick={(e) => {
            const input = (e.currentTarget as HTMLDivElement).querySelector('input');
            (input as HTMLInputElement | null)?.focus();
          }}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 6,
            minHeight: 38,
            padding: '6px 8px',
            border: '1px solid #E2E4F0',
            borderRadius: 10,
            background: '#fff',
            cursor: 'text',
          }}
        >
          {value.map((email) => {
            const m = teamByEmail.get(email);
            const label = m?.full_name || email;
            const org = m?.title || m?.position_type || '';
            return (
              <span
                key={email}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 8px 3px 3px',
                  borderRadius: 999,
                  border: '1px solid #DEE0EE',
                  background: '#F5F6FB',
                  fontSize: 12,
                  color: '#1A1D2E',
                  maxWidth: '100%',
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: '#1F4936',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {initialsFor(m, email)}
                </span>
                <span
                  style={{
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: 200,
                  }}
                >
                  {label}
                  {org ? <span style={{ color: '#5A6080', fontWeight: 500 }}> ({org})</span> : null}
                </span>
                <button
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    remove(email);
                  }}
                  aria-label={`Remove ${label}`}
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'transparent',
                    color: '#5A6080',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="8" height="8" viewBox="0 0 11 11" fill="none">
                    <path d="M2 2l7 7M9 2l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              </span>
            );
          })}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              // Delay so a click on a suggestion lands before the dropdown
              // unmounts.
              setTimeout(() => setFocused(false), 150);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && query === '' && value.length > 0) {
                remove(value[value.length - 1]);
                return;
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                if (suggestions[0]?.email) {
                  add(suggestions[0].email);
                } else if (/\S+@\S+\.\S+/.test(query.trim())) {
                  add(query.trim());
                }
              }
            }}
            placeholder={value.length === 0 ? 'Type an email address…' : ''}
            style={{
              flex: 1,
              minWidth: 140,
              border: 'none',
              outline: 'none',
              fontSize: 12,
              background: 'transparent',
              padding: '4px 2px',
              fontFamily: 'inherit',
              color: '#1A1D2E',
            }}
          />
        </div>

        {focused &&
          (teamLoading || teamError || suggestions.length > 0 || query.trim().length > 0) && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                right: 0,
                maxHeight: 240,
                overflowY: 'auto',
                background: '#fff',
                border: '1px solid #E2E4F0',
                borderRadius: 10,
                boxShadow: '0 8px 24px rgba(20,24,60,.12)',
                zIndex: 50,
                padding: 4,
              }}
            >
              {teamLoading ? (
                <div style={{ fontSize: 11, color: '#9BA3C4', padding: '10px 12px' }}>
                  Loading team…
                </div>
              ) : teamError ? (
                <div style={{ fontSize: 11, color: '#DC2626', padding: '10px 12px' }}>
                  {teamError}
                </div>
              ) : suggestions.length === 0 ? (
                <div style={{ fontSize: 11, color: '#9BA3C4', padding: '10px 12px' }}>
                  {/* Enter only accepts a match or a valid address, so a typed
                      name would otherwise vanish with no reason given. */}
                  {!query.trim()
                    ? 'No more people to add.'
                    : /\S+@\S+\.\S+/.test(query.trim())
                      ? 'Press Enter to invite this address.'
                      : 'No matches. Participants are invited by email — type a full address.'}
                </div>
              ) : (
                suggestions.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      add(m.email);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F5F6FB')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: '50%',
                        background: '#1F4936',
                        color: '#fff',
                        fontSize: 11,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {initialsFor(m, m.email)}
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span
                        style={{ fontSize: 12, fontWeight: 700, color: '#1A1D2E', lineHeight: 1.2 }}
                      >
                        {m.full_name || m.email}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          color: '#5A6080',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {m.email}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
      </div>

      {addPersonOpen && companyId && (
        <AddPersonDialog
          companyId={companyId}
          companyName={companyName}
          onClose={() => setAddPersonOpen(false)}
          onAdded={(member) => {
            void fetchTeam();
            if (member.email) add(member.email);
          }}
        />
      )}
    </div>
  );
}
