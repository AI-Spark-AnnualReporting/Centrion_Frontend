// Spark admin → Licenses. Every company with its license, and where spark_admin
// makes license keys and unlock codes. spark_admin only (route + backend).
//
// Cloud companies: a generated key is active straight away.
// On-premises clients: the key is copied and sent to the client admin, who
// pastes it on their own server; they're added here with "Add on-premises client".
//
// Plan: Centriton/.claude/plans/company-licensing.md

import { useCallback, useEffect, useState } from 'react';
import { Spinner } from '@/components/shared/Spinner';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { LicenseKeyForm } from '@/components/spark/LicenseKeyForm';
import { UnlockCodeForm } from '@/components/spark/UnlockCodeForm';
import { PasswordResetCodeForm } from '@/components/spark/PasswordResetCodeForm';
import { sparkLicenses } from '@/lib/api';
import type { LicensableModule, LicenseStatus, SparkLicenseRow } from '@/types/license';

const STATUS_BADGE: Record<LicenseStatus, { label: string; cls: string }> = {
  none: { label: 'No license', cls: 'b-gy' },
  active: { label: 'Active', cls: 'b-gn' },
  expired: { label: 'Expired', cls: 'b-rd' },
  not_started: { label: 'Not started', cls: 'b-am' },
  invalid: { label: 'Invalid key', cls: 'b-rd' },
  locked: { label: 'Locked', cls: 'b-rd' },
};

type Panel =
  | { kind: 'key'; row: SparkLicenseRow }
  | { kind: 'unlock'; row: SparkLicenseRow }
  | { kind: 'reset'; row: SparkLicenseRow }
  | null;

function usersCell(row: SparkLicenseRow): string {
  if (row.deployment === 'on_prem') return row.max_seats != null ? `max ${row.max_seats}` : '—';
  if (row.max_seats == null) return `${row.seats_used ?? 0} / —`;
  return `${row.seats_used ?? 0} / ${row.max_seats}`;
}

function AddOnPremClient({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      await sparkLicenses.addOnPremClient(name.trim());
      setName('');
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the client.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input className="inp" placeholder="On-premises client name" value={name} onChange={(e) => setName(e.target.value)} style={{ width: 240 }} />
      <button type="button" className="btn bs" onClick={add} disabled={saving || !name.trim()}>
        {saving ? 'Adding…' : 'Add on-premises client'}
      </button>
      {error && <span style={{ fontSize: 12, color: '#DC2626' }}>{error}</span>}
    </div>
  );
}

export default function SparkLicensesPage() {
  const [rows, setRows] = useState<SparkLicenseRow[]>([]);
  const [modules, setModules] = useState<LicensableModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    sparkLicenses
      .list()
      .then((res) => {
        setRows(res.licenses);
        setModules(res.modules);
        setError('');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load licenses.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  // The form needs exact usage ("3 used"), which only the detail call counts.
  const openKeyForm = async (row: SparkLicenseRow) => {
    setOpening(row.company_id);
    try {
      const detail = await sparkLicenses.get(row.company_id);
      setPanel({ kind: 'key', row: { ...row, ...detail } });
    } catch {
      setPanel({ kind: 'key', row });
    } finally {
      setOpening(null);
    }
  };

  const closePanel = (reload: boolean) => {
    setPanel(null);
    if (reload) load();
  };

  if (loading && rows.length === 0) return <Spinner pad={80} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>Licenses</div>
          <div style={{ fontSize: 12, color: '#9BA3C4', marginTop: 2 }}>
            Modules, report limits and users for every company. Only Spark admins can change them.
          </div>
        </div>
        <AddOnPremClient onAdded={load} />
      </div>

      {error && <div className="card" style={{ padding: 14, fontSize: 12, color: '#DC2626' }}>{error}</div>}

      {/* The forms open as a popup. A click outside it does NOT close it (a
          half-filled key form or a key shown once must not vanish by accident):
          only ✕, Cancel / Done, or Esc. ✕ reloads the list, since a key may
          already have been made. */}
      <Dialog open={panel !== null} onOpenChange={(open) => { if (!open) closePanel(true); }}>
        <DialogContent
          className="max-w-4xl max-h-[90vh] overflow-y-auto border-0 bg-transparent p-0 shadow-none"
          onInteractOutside={(event) => event.preventDefault()}
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">
            {panel?.kind === 'key' ? 'License key' : panel?.kind === 'unlock' ? 'Unlock code' : 'Password reset code'}
            {panel ? ` — ${panel.row.company_name}` : ''}
          </DialogTitle>
          {panel?.kind === 'key' && (
            <LicenseKeyForm row={panel.row} modules={modules} onDone={() => closePanel(true)} onCancel={() => closePanel(false)} />
          )}
          {panel?.kind === 'unlock' && <UnlockCodeForm row={panel.row} onDone={() => closePanel(true)} />}
          {panel?.kind === 'reset' && <PasswordResetCodeForm row={panel.row} onDone={() => closePanel(false)} />}
        </DialogContent>
      </Dialog>

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#5A6080', fontSize: 11 }}>
              <th style={{ padding: '10px 14px' }}>Company</th>
              <th>Where</th>
              <th>Status</th>
              <th>Users</th>
              <th>Modules</th>
              <th>Ends</th>
              <th style={{ textAlign: 'right', paddingRight: 14 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const badge = STATUS_BADGE[row.lock ? 'locked' : row.status] ?? STATUS_BADGE.none;
              return (
                <tr key={row.company_id} style={{ borderTop: '1px solid #EEF0F7' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: '#1A1D2E' }}>
                    {row.company_name}
                    {row.open_upgrade_requests > 0 && (
                      <span className="badge b-am" style={{ marginLeft: 8 }}>Upgrade requested</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${row.deployment === 'on_prem' ? 'b-pp' : 'b-bl'}`}>
                      {row.deployment === 'on_prem' ? 'On-premises' : 'Cloud'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${badge.cls}`}>{badge.label}</span>
                    {row.lock && <span style={{ marginLeft: 6, fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{row.lock.lock_id}</span>}
                  </td>
                  <td style={{ fontFamily: "'DM Mono', monospace" }}>{usersCell(row)}</td>
                  <td>{row.modules.length || '—'}</td>
                  <td>{row.expires_at ?? '—'}</td>
                  <td style={{ textAlign: 'right', paddingRight: 14, whiteSpace: 'nowrap' }}>
                    {/* On-premises locks live on the client's server, not here, so
                        the button is always there for them: the client admin
                        sends the Lock ID from their red banner. */}
                    {(row.lock || (row.deployment === 'on_prem' && row.status !== 'none')) && (
                      <button type="button" className="btn bs bsm" style={{ marginRight: 6 }} onClick={() => setPanel({ kind: 'unlock', row })}>
                        Unlock code
                      </button>
                    )}
                    {/* On-premises servers may have no email server, so Spark
                        can make a one-use password-reset code for a user. */}
                    {row.deployment === 'on_prem' && row.server_id && (
                      <button type="button" className="btn bs bsm" style={{ marginRight: 6 }} onClick={() => setPanel({ kind: 'reset', row })}>
                        Reset code
                      </button>
                    )}
                    <button type="button" className="btn bp bsm" disabled={opening === row.company_id} onClick={() => openKeyForm(row)}>
                      {opening === row.company_id ? 'Opening…' : row.status === 'none' ? 'Generate key' : 'New key'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
