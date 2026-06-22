import { useState } from 'react';
import type { DepartmentOption, OnboardingPayload } from '@/types/auth';
import DepartmentSelectionStep from '@/pages/onboarding/DepartmentSelectionStep';
import SetupInProgressAnimation from '@/pages/onboarding/SetupInProgressAnimation';
import CompanyIntelStep from '@/pages/onboarding/CompanyIntelStep';
import UploadReportsStep from '@/pages/onboarding/UploadReportsStep';
import WizardStepper from '@/pages/onboarding/WizardStepper';
import { GeneratingScreen } from '@/components/reports/GeneratingScreen';
import { extractCompanyProfile, type ExtractedCompanyProfile } from '@/lib/api';

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

const ANALYSE_STEPS = [
  'Fetching website content',
  'Extracting company overview',
  'Identifying sector & jurisdiction',
  'Detecting fiscal year & currency',
  'Mapping regulatory frameworks',
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
    { t: '✅ 9 fields extracted', s: 'From website & public records' },
    { t: '✏️ All editable', s: 'Correct anything before continuing' },
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

// Uppercase field label with an "AI" chip (Review Details step).
const AiLabel = ({ children }: { children: React.ReactNode }) => (
  <label style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
    {children}
    <span className="ai-chip">AI</span>
  </label>
);

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>('intel');
  const [error, setError] = useState('');

  // Company details (Review Details step)
  const [description, setDescription] = useState('');
  const [sector, setSector] = useState(''); // display-only for now (not in payload)
  const [employeeCount, setEmployeeCount] = useState('');
  const [fiscalYearEndMonth, setFiscalYearEndMonth] = useState('12');
  const [reportingCurrency, setReportingCurrency] = useState<OnboardingPayload['reporting_currency']>('SAR');
  const [primaryLanguage, setPrimaryLanguage] = useState<OnboardingPayload['primary_language']>('en');
  const [foundedYear, setFoundedYear] = useState('');
  const [headquarterCity, setHeadquarterCity] = useState('');
  const [listedExchange, setListedExchange] = useState('');

  // Department selection
  const [selectedDeptCodes, setSelectedDeptCodes] = useState<string[]>([]);
  const [deptOptions, setDeptOptions] = useState<DepartmentOption[]>([]);

  // Company-Intel extraction (real, doc-upload path).
  const [analyseFile, setAnalyseFile] = useState<File | null>(null);
  const [extractPhase, setExtractPhase] = useState<'running' | 'completed' | null>(null);

  // Mock "AI extraction" — fills the Review form with sample data (used only on
  // the no-file / URL path until website scraping is wired).
  const prefillFromAnalysis = () => {
    setDescription(
      'Al-Noor Capital is a leading Saudi investment bank providing comprehensive financial advisory, asset management, and capital markets services to institutional and high-net-worth clients across the GCC and MENA region.',
    );
    setSector('Financial Services');
    setEmployeeCount('1247');
    setFoundedYear('1987');
    setHeadquarterCity('Riyadh');
    setFiscalYearEndMonth('12');
    setReportingCurrency('SAR');
    setPrimaryLanguage('en');
    setListedExchange('Tadawul (1010)');
  };

  // Apply LLM-extracted fields onto the Review form (defaults are kept for nulls).
  const applyExtracted = (d: ExtractedCompanyProfile) => {
    if (d.description) setDescription(d.description);
    if (d.sector) setSector(d.sector);
    if (d.employee_count != null) setEmployeeCount(String(d.employee_count));
    if (d.founded_year != null) setFoundedYear(String(d.founded_year));
    if (d.headquarter_city) setHeadquarterCity(d.headquarter_city);
    if (d.fiscal_year_end_month != null) setFiscalYearEndMonth(String(d.fiscal_year_end_month));
    if (d.reporting_currency) setReportingCurrency(d.reporting_currency as OnboardingPayload['reporting_currency']);
    if (d.primary_language) setPrimaryLanguage(d.primary_language as OnboardingPayload['primary_language']);
    if (d.listed_exchange) setListedExchange(d.listed_exchange);
  };

  // "Analyse Company": with a file → real backend extraction (phase-driven
  // loader); without → keep the mock prefill path (URL scraping comes later).
  const handleAnalyse = (file: File | null) => {
    setAnalyseFile(file);
    setStep('analysing');
    if (!file) {
      setExtractPhase(null);
      return;
    }
    setExtractPhase('running');
    extractCompanyProfile(file)
      .then((data) => {
        applyExtracted(data);
        setExtractPhase('completed');
      })
      // On extraction failure, fall through to the Review form for manual entry.
      .catch(() => setStep('review'));
  };

  const buildPayload = (): OnboardingPayload => {
    const trimmedFounded = foundedYear.trim();
    return {
      description: description.trim(),
      employee_count: Number(employeeCount),
      fiscal_year_end_month: Number(fiscalYearEndMonth),
      reporting_currency: reportingCurrency,
      primary_language: primaryLanguage,
      selected_department_codes: selectedDeptCodes,
      founded_year: trimmedFounded ? Number(trimmedFounded) : null,
      website_url: null,
      headquarter_city: headquarterCity.trim() || null,
      listed_exchange: listedExchange.trim() || null,
    };
  };

  const onReviewContinue = () => {
    setError('');
    if (description.trim().length < 20) {
      setError('Description must be at least 20 characters');
      return;
    }
    const count = Number(employeeCount);
    if (!Number.isFinite(count) || count < 1) {
      setError('Number of employees must be at least 1');
      return;
    }
    setStep('departments');
  };

  // ---- Full-screen interstitials (no shell) -------------------------------
  if (step === 'analysing') {
    return (
      <div className="ob-loader-screen">
        <div style={{ width: 'min(520px, 100%)' }}>
          <GeneratingScreen
            title="Analysing Your Company"
            subtitle="Extracting key information from your company profile."
            steps={ANALYSE_STEPS}
            phase={extractPhase ?? undefined}
            onComplete={() => {
              if (!analyseFile) prefillFromAnalysis(); // mock path (no file)
              setStep('review');
            }}
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
            />
          )}

          {step === 'review' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <h2 style={{ marginBottom: 0 }}>Review Company Details</h2>
                <span className="ai-badge">AI extracted</span>
              </div>
              <p>Review and edit anything — then continue.</p>

              <div className="fl">
                <AiLabel>Company description</AiLabel>
                <textarea
                  className="inp"
                  rows={3}
                  placeholder="Brief description of your company"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div className="ob-review-grid">
                <div className="fl">
                  <AiLabel>Sector</AiLabel>
                  <input className="inp" placeholder="e.g. Financial Services" value={sector} onChange={(e) => setSector(e.target.value)} />
                </div>
                <div className="fl">
                  <AiLabel>Employees</AiLabel>
                  <input type="number" min={1} className="inp" placeholder="e.g. 120" value={employeeCount} onChange={(e) => setEmployeeCount(e.target.value)} />
                </div>
                <div className="fl">
                  <AiLabel>Founded year</AiLabel>
                  <input type="number" className="inp" placeholder="e.g. 1995" value={foundedYear} onChange={(e) => setFoundedYear(e.target.value)} />
                </div>
                <div className="fl">
                  <AiLabel>HQ city</AiLabel>
                  <input className="inp" placeholder="e.g. Riyadh" value={headquarterCity} onChange={(e) => setHeadquarterCity(e.target.value)} />
                </div>
                <div className="fl">
                  <AiLabel>Fiscal year</AiLabel>
                  <select className="inp sel" value={fiscalYearEndMonth} onChange={(e) => setFiscalYearEndMonth(e.target.value)}>
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="fl">
                  <AiLabel>Currency</AiLabel>
                  <select className="inp sel" value={reportingCurrency} onChange={(e) => setReportingCurrency(e.target.value as OnboardingPayload['reporting_currency'])}>
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="fl">
                  <AiLabel>Language</AiLabel>
                  <select className="inp sel" value={primaryLanguage} onChange={(e) => setPrimaryLanguage(e.target.value as OnboardingPayload['primary_language'])}>
                    <option value="en">English</option>
                    <option value="ar">Arabic</option>
                  </select>
                </div>
                <div className="fl">
                  <AiLabel>Exchange</AiLabel>
                  <input className="inp" placeholder="e.g. Tadawul (1010)" value={listedExchange} onChange={(e) => setListedExchange(e.target.value)} />
                </div>
              </div>

              {error && (
                <div style={{ fontSize: '11px', color: '#E5484D', marginTop: '4px', marginBottom: '8px' }} role="alert">
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
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
