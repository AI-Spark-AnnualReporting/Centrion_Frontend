// Board of Directors' Report — the setup screen at /board-report.
//
// Financial year plus the issuer profile that resolves the report's sections,
// then Create. The profile is seeded from the company record (reporting_sector,
// sector, is_shariah, has_sukuk) so the operator confirms rather than re-answers
// what onboarding already captured.
//
// This is the only place the profile is set: the build steps that follow
// (Sources → Sections → Report) each have their own route and none of them
// edits it. PATCH /profile therefore has no caller today — a wrong issuer type
// means starting a new report for that year.
//
// Below the form, every board report this company has.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useFeaturePermissions } from '@/lib/features';
import { ApiError, boardReports, companies, getSectors } from '@/lib/api';
import { Spinner } from '@/components/shared/Spinner';
import { BoardReportCard } from '@/components/annual-report/BoardReportCard';
import type { Sector } from '@/types/company';
import type { BoardIssuerProfile, BoardReportSummary } from '@/types/board';
import { errorMessage, profileFromCompany, readBoardConflict } from './board-helpers';
import {
  Block,
  FAINT,
  INK,
  MUTED,
  Notice,
  ProfileFields,
  ResolvedProfilePanel,
  SetupCard,
} from './board-ui';

// Every field the create form needs before the server has anything to say.
const BLANK_PROFILE: BoardIssuerProfile = {
  issuer_type: 'corporate',
  sector: null,
  sharia_compliant: false,
  externally_rated: false,
  has_capital_instruments: false,
};

export default function BoardSetupPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;
  const { canCreate, canRead } = useFeaturePermissions('board_report');

  const thisYear = new Date().getFullYear();
  const [fiscalYear, setFiscalYear] = useState(thisYear - 1);
  const years = Array.from({ length: 8 }, (_, i) => thisYear - i);

  const [profile, setProfile] = useState<BoardIssuerProfile>(BLANK_PROFILE);
  const [prefilled, setPrefilled] = useState(false);
  // A slow /companies/me must never overwrite an answer already given.
  const [touched, setTouched] = useState(false);
  const [sectors, setSectors] = useState<Sector[] | null>(null);

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ message: string; reportId: string | null } | null>(null);

  const [reports, setReports] = useState<BoardReportSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  // Seed the profile and load the sector picklist. The sectors table is both the
  // options here and how the company's sector_id resolves to a name.
  useEffect(() => {
    let cancelled = false;
    Promise.all([companies.getMyCompany(), getSectors()])
      .then(([c, list]) => {
        if (cancelled) return;
        setSectors(list);
        if (!c || touched) return;
        const sectorName = c.sector_name ?? list.find((s) => s.id === c.sector_id)?.name ?? null;
        setProfile(profileFromCompany(c, sectorName));
        setPrefilled(true);
      })
      .catch(() => {
        if (!cancelled) setSectors([]);
      });
    return () => {
      cancelled = true;
    };
    // `touched` is read as a latch, not a trigger — this runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!companyId || !canRead) {
      setListLoading(false);
      return;
    }
    let cancelled = false;
    setListLoading(true);
    setListError(null);
    boardReports
      .listReports(companyId)
      .then((res) => {
        if (!cancelled) setReports(res.reports ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) setListError(errorMessage(err, 'Failed to load your board reports.'));
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, canRead]);

  const setField = useCallback(
    <K extends keyof BoardIssuerProfile>(key: K, value: BoardIssuerProfile[K]) => {
      setTouched(true);
      setProfile((p) => ({ ...p, [key]: value }));
    },
    [],
  );

  const handleCreate = useCallback(async () => {
    if (!companyId || creating) return;
    setCreating(true);
    setError(null);
    setConflict(null);
    try {
      const res = await boardReports.createReport({
        company_id: companyId,
        fiscal_year: fiscalYear,
        issuer_profile: profile,
      });
      navigate(`/board-report/${res.report_id}/sources`);
    } catch (err: unknown) {
      // 409 = one already exists for this year. Offer it rather than making the
      // operator hunt for it in the grid below.
      if (err instanceof ApiError && err.status === 409) setConflict(readBoardConflict(err));
      else setError(errorMessage(err, 'Could not create the board report.'));
    } finally {
      setCreating(false);
    }
  }, [companyId, creating, fiscalYear, profile, navigate]);

  // The sector names the fines regulator and colours the risk framing — the
  // server can't resolve the outline sensibly without it.
  const needsSector = profile.issuer_type !== 'bank' && !profile.sector;
  const blocked = !companyId || creating || needsSector;

  return (
    <div>
      {canCreate && (
      <>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 15, fontWeight: 800, color: INK, margin: '0 0 4px' }}>
          Set up your board report
        </h1>
        <p style={{ margin: 0, fontSize: 12, color: MUTED }}>
          The financial year and the issuer profile — together they decide which of the registry&rsquo;s
          sections the report carries.
        </p>
      </div>

      <SetupCard
        title="Generate Board Report"
        sub="Board of Directors&rsquo; Report for a single financial year"
      >
        {prefilled && (
          <Notice tone="green">
            Issuer profile prefilled from your company profile — change anything that differs for
            this report.
          </Notice>
        )}

        <Block n={1} title="Financial year" hint="appears on the cover">
          <label htmlFor="board-fiscal-year" className="fl-label">
            Financial year
          </label>
          <select
            id="board-fiscal-year"
            className="inp sel"
            style={{ width: 160 }}
            value={fiscalYear}
            onChange={(e) => {
              setFiscalYear(Number(e.target.value));
              setConflict(null);
            }}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </Block>

        <ProfileFields profile={profile} sectors={sectors} startAt={2} onChange={setField} />

        <div style={{ marginBottom: 18 }}>
          <ResolvedProfilePanel profile={profile} />
        </div>

        {conflict && (
          <div
            role="alert"
            style={{
              marginBottom: 14,
              padding: '12px 14px',
              borderRadius: 10,
              background: 'rgba(245,158,11,.08)',
              border: '1px solid rgba(245,158,11,.3)',
              color: '#B4730B',
              fontSize: 12.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <span>{conflict.message}</span>
            {conflict.reportId && (
              <button
                type="button"
                className="btn bs bsm"
                onClick={() => navigate(`/board-report/${conflict.reportId}/sources`)}
              >
                Continue existing report
              </button>
            )}
          </div>
        )}

        {error && <Notice tone="red">{error}</Notice>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <button
            type="button"
            className="btn bp"
            disabled={blocked}
            onClick={handleCreate}
            title={needsSector ? 'Choose a sector to continue' : undefined}
            style={{
              padding: '11px 24px',
              fontSize: 13,
              fontWeight: 700,
              opacity: blocked ? 0.55 : 1,
              cursor: blocked ? 'not-allowed' : 'pointer',
            }}
          >
            {creating ? 'Creating…' : 'Add source documents →'}
          </button>
        </div>
      </SetupCard>
      </>
      )}

      {canRead && (
      <div style={{ marginTop: 28 }}>
        <div style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: INK, margin: 0 }}>Your board reports</h2>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: MUTED }}>
            Open an existing report to continue building it, or to export an approved one.
          </p>
        </div>

        {listLoading ? (
          <Spinner pad={40} />
        ) : listError ? (
          <div className="card" role="alert" style={{ padding: '14px 18px', fontSize: 12.5, color: '#DC2626' }}>
            {listError}
          </div>
        ) : reports.length === 0 ? (
          <div className="card" style={{ padding: '28px 20px', textAlign: 'center', fontSize: 12.5, color: FAINT }}>
            No board reports yet. Create one above to get started.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {reports.map((r) => (
              <BoardReportCard
                key={r.report_id}
                report={r}
                onOpen={(rep) => navigate(`/board-report/${rep.report_id}/sources`)}
              />
            ))}
          </div>
        )}
      </div>
      )}
    </div>
  );
}
