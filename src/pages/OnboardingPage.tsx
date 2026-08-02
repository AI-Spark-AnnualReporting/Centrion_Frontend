import { useEffect, useState } from 'react';
import type { OnboardingPayload } from '@/types/auth';
import type { Company, Sector } from '@/types/company';
import type { BrandColors, ExtractedGuideline, PickedLogo } from '@/types/brand';
import { FALLBACK_COLOR_PALETTES } from '@/types/brand';
import BrandStep from '@/pages/onboarding/BrandStep';
import DepartmentSelectionStep from '@/pages/onboarding/DepartmentSelectionStep';
import SetupInProgressAnimation from '@/pages/onboarding/SetupInProgressAnimation';
import CompanyIntelStep from '@/pages/onboarding/CompanyIntelStep';
import UploadReportsStep, { type UploadedReportFile } from '@/pages/onboarding/UploadReportsStep';
import WizardStepper from '@/pages/onboarding/WizardStepper';
import AiLoadingScreen from '@/pages/onboarding/AiLoadingScreen';
import { companies, extractCompanyProfile, getSectors, type ExtractedCompanyProfile } from '@/lib/api';
import { CYCLE_SECTOR_OPTIONS } from '@/types/cycles';

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
  'Reading your document',
  'Extracting company overview',
  'Identifying sector & jurisdiction',
  'Detecting fiscal year & currency',
  'Finalising company profile',
];
const PREPARE_STEPS = [
  'Loading your company',
  'Checking your profile document',
  'Reading your website',
  'Organising your details',
];

type Step = 'loading' | 'intel' | 'analysing' | 'review' | 'brand' | 'departments' | 'upload' | 'processing';

// Seed for the Brand step until the company row (or the user) says otherwise —
// the same first preset the backend falls back to in _resolve_brand.
const DEFAULT_BRAND_COLORS: BrandColors = {
  primary: FALLBACK_COLOR_PALETTES[0].primary,
  secondary: FALLBACK_COLOR_PALETTES[0].secondary,
  palette_key: FALLBACK_COLOR_PALETTES[0].key,
};

// Left-panel benefit cards per step.
const LEFT_CARDS: Record<'intel' | 'review' | 'brand' | 'departments' | 'upload', { t: string; s: string }[]> = {
  intel: [
    { t: '🔍 Smart extraction', s: 'We read your company profile document' },
    { t: '✏️ Fully editable', s: 'Review and correct before you continue' },
    { t: '⚡ Pre-configured', s: 'GRI, SAMA & CMA mapped automatically' },
  ],
  review: [
    { t: '✅ Auto-filled for you', s: 'Description, sector & details from your sources' },
    { t: '🔒 You confirm the rest', s: 'Profile, Shariah, subsidiaries & sukuk' },
  ],
  brand: [
    { t: '🎨 Your colors, your reports', s: 'Applied to headings & cover pages' },
    { t: '🖋 Written in your voice', s: 'Your brand identity shapes the tone' },
    { t: '↩️ Change it anytime', s: 'Override the colors on any single report' },
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

// Checkbox in its own bordered box (highlights when checked).
const Checkbox = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <label
    style={{
      display: 'flex', alignItems: 'center', gap: 11,
      padding: '13px 16px', borderRadius: 10,
      border: `1.5px solid ${checked ? '#4040C8' : '#E2E4F0'}`,
      background: checked ? '#F4F5FF' : '#fff',
      cursor: 'pointer', fontSize: 13.5, fontWeight: 600,
      color: checked ? '#4040C8' : '#1A1D2E',
      transition: 'border-color .15s, background .15s',
    }}
  >
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      style={{ width: 17, height: 17, accentColor: '#4040C8', cursor: 'pointer', flexShrink: 0 }}
    />
    {label}
  </label>
);

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>('loading');
  const [urlFailed, setUrlFailed] = useState(false);
  const [reviewErrors, setReviewErrors] = useState<Record<string, string>>({});

  // Company details (Review Details step)
  const [description, setDescription] = useState('');
  const [sectorId, setSectorId] = useState('');               // ESG sector (UUID) — AI-picked, mandatory
  const [companyProfile, setCompanyProfile] = useState('');   // listed/private — mandatory, manual
  const [reportingSector, setReportingSector] = useState(''); // SAR 5-code — mandatory, manual
  const [isShariah, setIsShariah] = useState(false);
  const [hasSubsidiaries, setHasSubsidiaries] = useState(false);
  const [hasSukuk, setHasSukuk] = useState(false);
  const [employeeCount, setEmployeeCount] = useState('');
  const [fiscalYearEndMonth, setFiscalYearEndMonth] = useState(''); // mandatory — no silent default
  const [reportingCurrency, setReportingCurrency] = useState<OnboardingPayload['reporting_currency']>('SAR');
  const [primaryLanguage, setPrimaryLanguage] = useState<OnboardingPayload['primary_language']>('en');
  const [foundedYear, setFoundedYear] = useState('');
  const [headquarterCity, setHeadquarterCity] = useState('');
  const [listedExchange, setListedExchange] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');

  // Sector options (mirrors the ESG report form's dropdown).
  const [sectors, setSectors] = useState<Sector[]>([]);
  useEffect(() => {
    getSectors().then(setSectors).catch(() => setSectors([]));
  }, []);

  // Brand step. The logo is carried as a base64 data URI and stored inline on
  // the company row (companies.logo_base64) — there is no upload step.
  const [logo, setLogo] = useState<PickedLogo | null>(null);
  // The guideline document's extracted text — saved to companies.brand_identity.
  const [guideline, setGuideline] = useState<ExtractedGuideline | null>(null);
  const [brandColors, setBrandColors] = useState<BrandColors>(DEFAULT_BRAND_COLORS);

  // Department selection
  const [selectedDeptCodes, setSelectedDeptCodes] = useState<string[]>([]);

  // Report documents picked on the final step (with their doc-type labels) —
  // uploaded to the Document Bank + run through report-style extraction.
  const [uploadedFiles, setUploadedFiles] = useState<UploadedReportFile[]>([]);

  // Company-Intel extraction (onboarding doc-upload path).
  const [analyseError, setAnalyseError] = useState('');

  // Seed the Review form from the company record (loaded on entry — signup may
  // have already extracted the profile in the background).
  const applyCompany = (c: Company) => {
    if (c.description) setDescription(c.description);
    if (c.sector_id) setSectorId(c.sector_id);
    if (c.employee_count != null) setEmployeeCount(String(c.employee_count));
    if (c.founded_year != null) setFoundedYear(String(c.founded_year));
    if (c.headquarter_city) setHeadquarterCity(c.headquarter_city);
    // Fiscal year end is intentionally NOT seeded from the company row: the DB defaults
    // it to December, which would silently pre-fill and defeat the mandatory conscious
    // choice on the Review step. It's still pre-filled from AI extraction (applyExtracted).
    if (c.reporting_currency) setReportingCurrency(c.reporting_currency as OnboardingPayload['reporting_currency']);
    if (c.primary_language) setPrimaryLanguage(c.primary_language as OnboardingPayload['primary_language']);
    if (c.listed_exchange) setListedExchange(c.listed_exchange);
    if (c.website_url) setWebsiteUrl(c.website_url);
    if (c.company_profile) setCompanyProfile(c.company_profile);
    if (c.reporting_sector) setReportingSector(c.reporting_sector);
    if (typeof c.is_shariah === 'boolean') setIsShariah(c.is_shariah);
    if (typeof c.has_subsidiaries === 'boolean') setHasSubsidiaries(c.has_subsidiaries);
    if (typeof c.has_sukuk === 'boolean') setHasSukuk(c.has_sukuk);
    // Brand colors are seeded so re-running onboarding shows the existing choice
    // rather than silently resetting to the default palette. The guideline isn't:
    // a stored blob of document text can't be shown back as "a file you uploaded".
    if (c.brand_colors?.primary && c.brand_colors?.secondary) {
      setBrandColors({
        primary: c.brand_colors.primary,
        secondary: c.brand_colors.secondary,
        palette_key: c.brand_colors.palette_key || 'custom',
      });
    }
  };

  // On entry: load the company. If signup extraction is still running, poll;
  // once ready, route to Review (we have data) or step 1 (no data / URL failed).
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let attempts = 0;
    const load = () => {
      companies
        .getMyCompany()
        .then((c) => {
          if (cancelled) return;
          if (c.profile_extraction_status === 'processing' && attempts < 20) {
            attempts += 1;                       // keep polling (~40s cap)
            timer = window.setTimeout(load, 2000);
            return;
          }
          applyCompany(c);
          if (c.description && c.description.trim()) {
            setStep('review');                 // extraction gave us data
          } else {
            setUrlFailed(!!c.website_url);      // URL provided but nothing came back
            setStep('intel');
          }
        })
        .catch(() => {
          if (!cancelled) setStep('intel');
        });
    };
    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Apply LLM-extracted fields onto the Review form (onboarding doc-upload path).
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

  // "Analyse" on step 1 — upload a document and extract from it (single LLM call).
  const handleAnalyse = (file: File | null) => {
    setAnalyseError('');
    setStep('analysing');
    extractCompanyProfile(file, undefined)
      .then((data) => {
        applyExtracted(data);
        setStep('review');
      })
      .catch((err) => {
        const detail = (err as { body?: { detail?: unknown } })?.body?.detail;
        setAnalyseError(
          typeof detail === 'string'
            ? detail
            : "We couldn't read that document. Try another, or fill the details in manually.",
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
      reporting_sector: reportingSector,
      is_shariah: isShariah,
      has_subsidiaries: hasSubsidiaries,
      has_sukuk: hasSukuk,
      selected_department_codes: selectedDeptCodes,
      founded_year: trimmedFounded ? Number(trimmedFounded) : null,
      website_url: websiteUrl.trim() || null,
      headquarter_city: headquarterCity.trim() || null,
      listed_exchange: listedExchange.trim() || null,
      // Brand step.
      brand_identity: guideline?.text ?? null,
      brand_colors: brandColors,
      logo_base64: logo?.dataUri ?? null,
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
    if (!reportingSector) errs.reportingSector = 'Reporting sector is required.';
    if (!fiscalYearEndMonth) errs.fiscalYearEndMonth = 'Fiscal year end is required.';
    setReviewErrors(errs);
    if (Object.keys(errs).length === 0) setStep('brand');
  };

  // ---- Full-screen interstitials (no shell) -------------------------------
  if (step === 'loading') {
    return (
      <AiLoadingScreen
        title="Preparing Your Workspace"
        subtitle="Getting your company details ready…"
        milestones={PREPARE_STEPS}
      />
    );
  }

  if (step === 'analysing') {
    return (
      <AiLoadingScreen
        title="Analysing Your Company"
        subtitle="Extracting key information from your document."
        milestones={ANALYSE_STEPS}
      />
    );
  }

  if (step === 'processing') {
    return <SetupInProgressAnimation payload={buildPayload()} files={uploadedFiles} />;
  }

  const stepNumber = { intel: 1, review: 2, brand: 3, departments: 4, upload: 5 }[step];
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
              urlFailed={urlFailed}
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
                  <FieldLabel required>Reporting sector</FieldLabel>
                  <select
                    className={`inp sel${reviewErrors.reportingSector ? ' inp-error' : ''}`}
                    value={reportingSector}
                    onChange={(e) => { setReportingSector(e.target.value); clearReviewError('reportingSector'); }}
                  >
                    <option value="">Select a reporting sector</option>
                    {CYCLE_SECTOR_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  {reviewErrors.reportingSector && <div className="fl-err">{reviewErrors.reportingSector}</div>}
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
                  <select
                    className={`inp sel${reviewErrors.fiscalYearEndMonth ? ' inp-error' : ''}`}
                    value={fiscalYearEndMonth}
                    onChange={(e) => { setFiscalYearEndMonth(e.target.value); clearReviewError('fiscalYearEndMonth'); }}
                  >
                    <option value="">Select month</option>
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i + 1}>{m}</option>
                    ))}
                  </select>
                  {reviewErrors.fiscalYearEndMonth && <div className="fl-err">{reviewErrors.fiscalYearEndMonth}</div>}
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

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 14 }}>
                <Checkbox label="Shariah-compliant" checked={isShariah} onChange={setIsShariah} />
                <Checkbox label="Has subsidiaries" checked={hasSubsidiaries} onChange={setHasSubsidiaries} />
                <Checkbox label="Has sukuk" checked={hasSukuk} onChange={setHasSukuk} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 18 }}>
                <button type="button" className="btn bs" onClick={() => setStep('intel')}>← Back</button>
                <button type="button" className="btn bp" onClick={onReviewContinue}>Looks good, Continue →</button>
              </div>
            </>
          )}

          {step === 'brand' && (
            <BrandStep
              logo={logo}
              onLogoChange={setLogo}
              guideline={guideline}
              onGuidelineChange={setGuideline}
              brandColors={brandColors}
              onBrandColorsChange={setBrandColors}
              onBack={() => setStep('review')}
              onContinue={() => setStep('departments')}
            />
          )}

          {step === 'departments' && (
            <DepartmentSelectionStep
              selectedCodes={selectedDeptCodes}
              onSelect={setSelectedDeptCodes}
              onBack={() => setStep('brand')}
              onSubmit={() => setStep('upload')}
              onOptionsLoaded={() => {}}
            />
          )}

          {step === 'upload' && (
            <UploadReportsStep
              onProcess={(files) => {
                // Persist intent across the post-onboarding ProtectedRoute redirect
                // (which strips router state) so the dashboard lands on the
                // personal workspace, not the welcome screen.
                if (files.length) sessionStorage.setItem('centriyon:freshUpload', '1');
                setUploadedFiles(files);
                setStep('processing');
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
