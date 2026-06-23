import { useEffect, useState } from 'react';
import type { DepartmentOption, OnboardingPayload } from '@/types/auth';
import type { Sector } from '@/types/company';
import DepartmentSelectionStep from '@/pages/onboarding/DepartmentSelectionStep';
import SetupInProgressAnimation from '@/pages/onboarding/SetupInProgressAnimation';
import CompanyIntelStep from '@/pages/onboarding/CompanyIntelStep';
import UploadReportsStep from '@/pages/onboarding/UploadReportsStep';
import WizardStepper from '@/pages/onboarding/WizardStepper';
import { GeneratingScreen } from '@/components/reports/GeneratingScreen';
import { extractCompanyProfile, getSectors, type ExtractedCompanyProfile } from '@/lib/api';

const LogoMark = () => (
  <svg viewBox="0 0 16 16" fill="none" width="17" height="17">
    <rect x="1" y="1" width="6" height="6" rx="1.2" fill="white" />
    <rect x="9" y="1" width="6" height="6" rx="1.2" fill="white" opacity=".4" />
    <rect x="1" y="9" width="6" height="6" rx="1.2" fill="white" opacity=".4" />
    <rect x="9" y="9" width="6" height="6" rx="1.2" fill="white" />
  </svg>
);

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const CURRENCIES: OnboardingPayload['reporting_currency'][] = [
  'SAR', 'AED', 'BHD', 'KWD', 'OMR', 'QAR', 'USD',
];
const COMPANY_PROFILES: { value: OnboardingPayload['company_profile']; label: string }[] = [
  { value: 'listed', label: 'Listed' },
  { value: 'private', label: 'Private' },
];

const ANALYSE_STEPS = [
  'Reading your sources',
  'Extracting company overview',
  'Identifying sector & jurisdiction',
  'Detecting fiscal year & currency',
  'Finalising company profile',
];

type Step = 'intel' | 'analysing' | 'review' | 'departments' | 'upload' | 'processing';

// Left-panel benefit cards per step.
const LEFT_CARDS: Record<'intel' | 'review' | 'departments' | 'upload', { t: string; s: string }[]> = {
  intel: [
    { t: '🔍 Smart extraction', s: 'We read your website or company profile' },
    { t: '✏️ Fully editable', s: 'Review and correct before you continue' },
    { t: '⚡ Pre-configured', s: 'GRI, SAMA & CMA mapped automatically' },
  ],
  review: [
    { t: '✅ Auto-filled for you', s: 'Description, sector & details from your sources' },
    { t: '🔒 You confirm the rest', s: 'Profile, Shariah, subsidiaries & sukuk' },
  ],
  departments: [
    { t: 'Tailored to your org', s: 'Currency, fiscal year & language' },
    { t: 'AI agents per dept', s: 'Trained on your company context' },
  ],
  upload: [
    { t: '📊 Annual Report', s: 'Full-year financial & narrative' },
    { t: '🌱 Sustainability Report', s: 'ESG & GRI disclosures' },
    { t: '📋 Board Documents', s: 'Governance packs & MD&A' },
  ],
};

// Field label + a red "*" when required. `ai` adds the small AI-picked chip.
const FieldLabel = ({ children, required, ai }: { children: React.ReactNode; required?: boolean; ai?: boolean }) => (
  <label style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
    {children}
    {required && <span style={{ color: '#E5484D', fontWeight: 700 }}>*</span>}
    {ai && <span className="ai-chip">AI</span>}
  </label>
);

// Required Yes/No control (no default — must be answered).
const YesNo = ({
  value, onChange, error,
}: { value: boolean | null; onChange: (v: boolean) => void; error?: boolean }) => (
  <div className={`ob-yesno${error ? ' ob-yesno-error' : ''}`}>
    <button type="button" className={value === true ? 'on' : ''} onClick={() => onChange(true)}>Yes</button>
    <button type="button" className={value === false ? 'on' : ''} onClick={() => onChange(false)}>No</button>
  </div>
);

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>('intel');
  const [reviewErrors, setReviewErrors] = useState<Record<string, string>>({});

  // Company details (Review Details step)
  const [description, setDescription] = useState('');
  const [sectorId, setSectorId] = useState('');               // ESG sector (UUID) — AI-picked, mandatory
  const [companyProfile, setCompanyProfile] = useState('');   // listed/private — mandatory, manual
  const [isShariah, setIsShariah] = useState<boolean | null>(null);
  const [hasSubsidiaries, setHasSubsidiaries] = useState<boolean | null>(null);
  const [hasSukuk, setHasSukuk] = useState<boolean | null>(null);
  const [employeeCount, setEmployeeCount] = useState('');
  const [fiscalYearEndMonth, setFiscalYearEndMonth] = useState('12');
  const [reportingCurrency, setReportingCurrency] = useState<OnboardingPayload['reporting_currency']>('SAR');
  const [primaryLanguage, setPrimaryLanguage] = useState<OnboardingPayload['primary_language']>('en');
  const [foundedYear, setFoundedYear] = useState('');
  const [headquarterCity, setHeadquarterCity] = useState('');
  const [listedExchange, setListedExchange] = useState('');

  // Sector options (mirrors the ESG report form's dropdown).
  const [sectors, setSectors] = useState<Sector[]>([]);
  useEffect(() => {
    getSectors().then(setSectors).catch(() => setSectors([]));
  }, []);

  // Department selection
  const [selectedDeptCodes, setSelectedDeptCodes] = useState<string[]>([]);
  const [deptOptions, setDeptOptions] = useState<DepartmentOption[]>([]);

  // Company-Intel extraction (single combined doc+URL call).
  const [extractPhase, setExtractPhase] = useState<'running' | 'completed' | null>(null);
  const [analyseError, setAnalyseError] = useState('');

  // Apply LLM-extracted fields onto the Review form. Only AI-derived fields are
  // pre-filled; the sensitive fields (profile / shariah / subsidiaries / sukuk)
  // stay manual.
  const applyExtracted = (d: ExtractedCompanyProfile) => {
    if (d.description) setDescription(d.description);
    if (d.sector_id) setSectorId(d.sector_id);
    if (d.employee_count != null) setEmployeeCount(String(d.employee_count));
    if (d.founded_year != null) setFoundedYear(String(d.founded_year));
    if (d.headquarter_city) setHeadquarterCity(d.headquarter_city);
    if (d.fiscal_year_end_month != null) setFiscalYearEndMonth(String(d.fiscal_year_end_month));
    if (d.reporting_currency) setReportingCurrency(d.reporting_currency as OnboardingPayload['reporting_currency']);
    if (d.primary_language) setPrimaryLanguage(d.primary_language as OnboardingPayload['primary_language']);
    if (d.listed_exchange) setListedExchange(d.listed_exchange);
  };

  // "Analyse Company": one combined call (document and/or URL → single LLM pass).
  const handleAnalyse = (file: File | null, url: string) => {
    setAnalyseError('');
    setStep('analysing');
    setExtractPhase('running');
    extractCompanyProfile(file, url)
      .then((data) => {
        applyExtracted(data);
        setExtractPhase('completed');
      })
      .catch((err) => {
        const detail = (err as { body?: { detail?: unknown } })?.body?.detail;
        setAnalyseError(
          typeof detail === 'string'
            ? detail
            : "We couldn't read that document or website. Try another, or fill the details in manually.",
        );
        setStep('intel');
      });
  };

  const buildPayload = (): OnboardingPayload => {
    const trimmedFounded = foundedYear.trim();
    return {
      description: description.trim(),
      employee_count: Number(employeeCount),
      fiscal_year_end_month: Number(fiscalYearEndMonth),
      reporting_currency: reportingCurrency,
      primary_language: primaryLanguage,
      sector_id: sectorId,
      company_profile: companyProfile as OnboardingPayload['company_profile'],
      is_shariah: !!isShariah,
      has_subsidiaries: !!hasSubsidiaries,
      has_sukuk: !!hasSukuk,
      selected_department_codes: selectedDeptCodes,
      founded_year: trimmedFounded ? Number(trimmedFounded) : null,
      website_url: null,
      headquarter_city: headquarterCity.trim() || null,
      listed_exchange: listedExchange.trim() || null,
    };
  };

  const clearReviewError = (key: string) =>
    setReviewErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

  const onReviewContinue = () => {
    const errs: Record<string, string> = {};
    if (description.trim().length < 20) errs.description = 'Description must be at least 20 characters.';
    const count = Number(employeeCount);
    if (!employeeCount.trim() || !Number.isFinite(count) || count < 1) {
      errs.employeeCount = 'Number of employees is required (at least 1).';
    }
    if (!sectorId) errs.sectorId = 'Sector is required.';
    if (!companyProfile) errs.companyProfile = 'Company profile is required.';
    if (isShariah === null) errs.isShariah = 'Required.';
    if (hasSubsidiaries === null) errs.hasSubsidiaries = 'Required.';
    if (hasSukuk === null) errs.hasSukuk = 'Required.';
    setReviewErrors(errs);
    if (Object.keys(errs).length === 0) setStep('departments');
  };

  // ---- Full-screen interstitials (no shell) -------------------------------
  if (step === 'analysing') {
    return (
      <div className="ob-loader-screen">
        <div style={{ width: 'min(520px, 100%)' }}>
          <GeneratingScreen
            title="Analysing Your Company"
            subtitle="Extracting key information from your sources."
            steps={ANALYSE_STEPS}
            phase={extractPhase ?? undefined}
            onComplete={() => setStep('review')}
          />
        </div>
      </div>
    );
  }

  if (step === 'processing') {
    const selected = deptOptions
      .filter((d) => selectedDeptCodes.includes(d.code))
      .map((d) => ({ code: d.code, name: d.name }));
    return <SetupInProgressAnimation payload={buildPayload()} departments={selected} />;
  }

  const stepNumber = { intel: 1, review: 2, departments: 3, upload: 4 }[step];
  const cards = LEFT_CARDS[step];

  return (
    <div className="auth">
      <div className="auth-card auth-card-wide">
        <div className="auth-l">
          <div>
            <div className="flex items-center gap-[10px] mb-3">
              <div className="w-9 h-9 bg-[#4040C8] rounded-[10px] flex items-center justify-center flex-shrink-0">
                <LogoMark />
              </div>
              <span className="text-[17px] font-extrabold text-white tracking-tight">Centriyon</span>
            </div>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,.4)', lineHeight: 1.65, marginBottom: '32px', maxWidth: '240px' }}>
              Turn your source documents into board- and investor-ready reports — GRI 2021,
              IFRS S1/S2, SAMA &amp; CMA pre-configured.
            </p>
          </div>
          <div className="flex flex-col gap-[10px]">
            {cards.map((c) => (
              <div className="auth-stat" key={c.t}>
                <div className="auth-sv">{c.t}</div>
                <div className="auth-sl">{c.s}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="auth-r">
          <WizardStepper current={stepNumber} />

          {step === 'intel' && (
            <CompanyIntelStep
              onAnalyse={handleAnalyse}
              onSkipManual={() => setStep('review')}
              serverError={analyseError}
            />
          )}

          {step === 'review' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <h2 style={{ marginBottom: 0 }}>Review Company Details</h2>
                <span className="ai-badge">AI extracted</span>
              </div>
              <p>Review the auto-filled details and complete the required fields — then continue.</p>

              <div className="fl">
                <FieldLabel required ai>Company description</FieldLabel>
                <textarea
                  className={`inp${reviewErrors.description ? ' inp-error' : ''}`}
                  rows={3}
                  placeholder="Brief description of your company"
                  value={description}
                  onChange={(e) => { setDescription(e.target.value); clearReviewError('description'); }}
                  style={{ resize: 'vertical' }}
                />
                {reviewErrors.description && <div className="fl-err">{reviewErrors.description}</div>}
              </div>

              <div className="ob-review-grid">
                <div className="fl">
                  <FieldLabel required ai>Sector</FieldLabel>
                  <select
                    className={`inp sel${reviewErrors.sectorId ? ' inp-error' : ''}`}
                    value={sectorId}
                    onChange={(e) => { setSectorId(e.target.value); clearReviewError('sectorId'); }}
                  >
                    <option value="">Select a sector</option>
                    {sectors.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  {reviewErrors.sectorId && <div className="fl-err">{reviewErrors.sectorId}</div>}
                </div>
                <div className="fl">
                  <FieldLabel required>Company profile</FieldLabel>
                  <select
                    className={`inp sel${reviewErrors.companyProfile ? ' inp-error' : ''}`}
                    value={companyProfile}
                    onChange={(e) => { setCompanyProfile(e.target.value); clearReviewError('companyProfile'); }}
                  >
                    <option value="">Select a profile</option>
                    {COMPANY_PROFILES.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                  {reviewErrors.companyProfile && <div className="fl-err">{reviewErrors.companyProfile}</div>}
                </div>
                <div className="fl">
                  <FieldLabel required ai>Employees</FieldLabel>
                  <input type="number" min={1} className={`inp${reviewErrors.employeeCount ? ' inp-error' : ''}`} placeholder="e.g. 120" value={employeeCount} onChange={(e) => { setEmployeeCount(e.target.value); clearReviewError('employeeCount'); }} />
                  {reviewErrors.employeeCount && <div className="fl-err">{reviewErrors.employeeCount}</div>}
                </div>
                <div className="fl">
                  <FieldLabel ai>Founded year</FieldLabel>
                  <input type="number" className="inp" placeholder="e.g. 1995" value={foundedYear} onChange={(e) => setFoundedYear(e.target.value)} />
                </div>
                <div className="fl">
                  <FieldLabel ai>HQ city</FieldLabel>
                  <input className="inp" placeholder="e.g. Riyadh" value={headquarterCity} onChange={(e) => setHeadquarterCity(e.target.value)} />
                </div>
                <div className="fl">
                  <FieldLabel required ai>Fiscal year</FieldLabel>
                  <select className="inp sel" value={fiscalYearEndMonth} onChange={(e) => setFiscalYearEndMonth(e.target.value)}>
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="fl">
                  <FieldLabel required ai>Currency</FieldLabel>
                  <select className="inp sel" value={reportingCurrency} onChange={(e) => setReportingCurrency(e.target.value as OnboardingPayload['reporting_currency'])}>
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="fl">
                  <FieldLabel required ai>Language</FieldLabel>
                  <select className="inp sel" value={primaryLanguage} onChange={(e) => setPrimaryLanguage(e.target.value as OnboardingPayload['primary_language'])}>
                    <option value="en">English</option>
                    <option value="ar">Arabic</option>
                  </select>
                </div>
                <div className="fl">
                  <FieldLabel ai>Exchange</FieldLabel>
                  <input className="inp" placeholder="e.g. Tadawul (1010)" value={listedExchange} onChange={(e) => setListedExchange(e.target.value)} />
                </div>
              </div>

              <div className="ob-yesno-row">
                <div className="fl" style={{ marginBottom: 0 }}>
                  <FieldLabel required>Shariah-compliant</FieldLabel>
                  <YesNo value={isShariah} error={!!reviewErrors.isShariah}
                    onChange={(v) => { setIsShariah(v); clearReviewError('isShariah'); }} />
                  {reviewErrors.isShariah && <div className="fl-err">{reviewErrors.isShariah}</div>}
                </div>
                <div className="fl" style={{ marginBottom: 0 }}>
                  <FieldLabel required>Has subsidiaries</FieldLabel>
                  <YesNo value={hasSubsidiaries} error={!!reviewErrors.hasSubsidiaries}
                    onChange={(v) => { setHasSubsidiaries(v); clearReviewError('hasSubsidiaries'); }} />
                  {reviewErrors.hasSubsidiaries && <div className="fl-err">{reviewErrors.hasSubsidiaries}</div>}
                </div>
                <div className="fl" style={{ marginBottom: 0 }}>
                  <FieldLabel required>Has sukuk</FieldLabel>
                  <YesNo value={hasSukuk} error={!!reviewErrors.hasSukuk}
                    onChange={(v) => { setHasSukuk(v); clearReviewError('hasSukuk'); }} />
                  {reviewErrors.hasSukuk && <div className="fl-err">{reviewErrors.hasSukuk}</div>}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 18 }}>
                <button type="button" className="btn bs" onClick={() => setStep('intel')}>← Back</button>
                <button type="button" className="btn bp" onClick={onReviewContinue}>Looks good, Continue →</button>
              </div>
            </>
          )}

          {step === 'departments' && (
            <DepartmentSelectionStep
              selectedCodes={selectedDeptCodes}
              onSelect={setSelectedDeptCodes}
              onBack={() => setStep('review')}
              onSubmit={() => setStep('upload')}
              onOptionsLoaded={setDeptOptions}
            />
          )}

          {step === 'upload' && (
            <UploadReportsStep
              onProcess={() => setStep('processing')}
              onSkip={() => setStep('processing')}
            />
          )}
        </div>
      </div>
    </div>
  );
}
