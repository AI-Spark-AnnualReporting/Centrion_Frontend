import { useEffect, useRef, useState } from 'react';
import { auth } from '@/lib/api';
import type { UserProfile } from '@/types/auth';

// Header certification chips — also static placeholders.
const CERTIFICATIONS = ['SAMA Licensed', 'GRI Certified'];

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function titleCase(s: string): string {
  return s
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    auth
      .me<UserProfile>()
      .then((res) => {
        if (requestId !== requestIdRef.current) return;
        setProfile(res);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (requestId !== requestIdRef.current) return;
        setLoading(false);
        setError(err instanceof Error ? err.message : 'Failed to load profile.');
      });
  }, []);

  return (
    <div style={{ paddingBottom: 96 }}>
      {/* Page heading */}
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>User Profile</h2>
        <p style={{ fontSize: 11, color: '#5A6080', marginTop: 2 }}>
          Your account details
        </p>
      </div>

      {loading && !profile && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: '#9BA3C4', fontSize: 13 }}>
          <div className="proc-ring" style={{ margin: '0 auto 12px', width: 32, height: 32, borderWidth: 2.5 }} />
          Loading profile…
        </div>
      )}

      {error && !loading && (
        <div
          style={{
            background: 'rgba(239,68,68,.04)',
            border: '1px solid rgba(239,68,68,.25)',
            borderRadius: 12,
            padding: '14px 18px',
            color: '#DC2626',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      )}

      {profile && (
        <>
          {/* Identity bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              marginBottom: 16,
              padding: '14px 4px',
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                background: 'linear-gradient(135deg,#4040C8,#5A5AE0)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: 18,
                flexShrink: 0,
              }}
            >
              {initialsFor(profile.full_name)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#1A1D2E' }}>
                {profile.full_name}
              </div>
              <div style={{ fontSize: 11, color: '#5A6080', marginTop: 2 }}>
                {titleCase(profile.role)}
                {profile.company_name ? ` · ${profile.company_name}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
              {CERTIFICATIONS.map((c) => (
                <span key={c} style={{ fontSize: 11, fontWeight: 700, color: '#5A6080' }}>
                  {c}
                </span>
              ))}
            </div>
          </div>

          {/* Personal Information */}
          <div
            style={{
              background: '#fff',
              borderRadius: 14,
              border: '1px solid #E2E4F0',
              padding: '18px 22px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 14,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 800, color: '#1A1D2E' }}>
                Personal Information
              </span>
              <button
                type="button"
                disabled
                title="Profile edit will be wired up when the backend exposes the endpoint."
                style={{
                  padding: '5px 14px',
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#5A6080',
                  background: '#fff',
                  border: '1px solid #E2E4F0',
                  borderRadius: 999,
                  cursor: 'not-allowed',
                  opacity: 0.7,
                }}
              >
                Edit
              </button>
            </div>

            <ProfileRow label="Full name" value={profile.full_name} />
            <ProfileRow label="Email" value={profile.email} valueColor="#4040C8" />
            <ProfileRow label="Phone" value={null} />
            <ProfileRow label="Role" value={titleCase(profile.role)} />
            <ProfileRow
              label="Organisation"
              value={profile.company_name ?? null}
            />
            <ProfileRow label="Location" value={null} />
          </div>
        </>
      )}
    </div>
  );
}

function ProfileRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string | null;
  valueColor?: string;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '120px 1fr',
        alignItems: 'center',
        padding: '8px 0',
        borderBottom: '1px solid #ECEEF8',
      }}
    >
      <span style={{ fontSize: 11, color: '#5A6080' }}>{label}</span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: value ? valueColor ?? '#1A1D2E' : '#9BA3C4',
        }}
      >
        {value ?? '—'}
      </span>
    </div>
  );
}
