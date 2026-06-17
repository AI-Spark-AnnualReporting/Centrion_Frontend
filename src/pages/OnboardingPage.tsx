import { useState } from 'react';
import type { DepartmentOption, OnboardingPayload } from '@/types/auth';
import DepartmentSelectionStep from '@/pages/onboarding/DepartmentSelectionStep';
import SetupInProgressAnimation from '@/pages/onboarding/SetupInProgressAnimation';

const Req = () => <span style={{ color: '#E5484D', fontWeight: 700 }}> *</span>;

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

type Step = 'details' | 'departments' | 'setup';

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>('details');
  const [error, setError] = useState('');

  // Company Setup (step 1)
  const [description, setDescription] = useState('');
  const [employeeCount, setEmployeeCount] = useState('');
  const [fiscalYearEndMonth, setFiscalYearEndMonth] = useState('12');
  const [reportingCurrency, setReportingCurrency] =
    useState<OnboardingPayload['reporting_currency']>('SAR');
  const [primaryLanguage, setPrimaryLanguage] =
    useState<OnboardingPayload['primary_language']>('en');
  const [foundedYear, setFoundedYear] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [headquarterCity, setHeadquarterCity] = useState('');
  const [listedExchange, setListedExchange] = useState('');

  // Department selection (step 2)
  const [selectedDeptCodes, setSelectedDeptCodes] = useState<string[]>([]);
  const [deptOptions, setDeptOptions] = useState<DepartmentOption[]>([]);

  // Validate the company details, then advance to department selection.
  const goToDepartments = () => {
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
      website_url: websiteUrl.trim() || null,
      headquarter_city: headquarterCity.trim() || null,
      listed_exchange: listedExchange.trim() || null,
    };
  };

  // Step 3 — full-screen setup animation (fires the actual onboarding API).
  if (step === 'setup') {
    const selected = deptOptions
      .filter((d) => selectedDeptCodes.includes(d.code))
      .map((d) => ({ code: d.code, name: d.name }));
    return <SetupInProgressAnimation payload={buildPayload()} departments={selected} />;
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-l">
          <div>
            <div className="flex items-center gap-[10px] mb-3">
              <div className="w-9 h-9 bg-[#4040C8] rounded-[10px] flex items-center justify-center flex-shrink-0">
                <LogoMark />
              </div>
              <span className="text-[17px] font-extrabold text-white tracking-tight">Centriyon</span>
            </div>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,.4)', lineHeight: 1.65, marginBottom: '32px', maxWidth: '240px' }}>
              One quick setup and your workspace is ready — GRI 2021, IFRS S1/S2, SAMA &amp; CMA pre-configured.
            </p>
          </div>
          <div className="flex flex-col gap-[10px]">
            <div className="auth-stat">
              <div className="auth-sv">Tailored to your org</div>
              <div className="auth-sl">Currency, fiscal year &amp; language</div>
            </div>
            <div className="auth-stat">
              <div className="auth-sv">AI agents per department</div>
              <div className="auth-sl">Trained on your company context</div>
            </div>
          </div>
        </div>

        <div className="auth-r">
          {step === 'details' ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: '#9BA3C4', fontWeight: 600 }}>Step 1 of 2</span>
              </div>
              <h2>Company Setup</h2>
              <p>Tell us about your organisation</p>

              <div className="fl">
                <label>Description<Req /></label>
                <textarea
                  className="inp"
                  placeholder="Brief description of your company"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <div className="fl" style={{ flex: 1 }}>
                  <label>Number of employees<Req /></label>
                  <input
                    type="number"
                    min={1}
                    className="inp"
                    placeholder="e.g. 120"
                    value={employeeCount}
                    onChange={(e) => setEmployeeCount(e.target.value)}
                  />
                </div>
                <div className="fl" style={{ flex: 1 }}>
                  <label>Fiscal year end month<Req /></label>
                  <select className="inp" value={fiscalYearEndMonth} onChange={(e) => setFiscalYearEndMonth(e.target.value)}>
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <div className="fl" style={{ flex: 1 }}>
                  <label>Reporting currency<Req /></label>
                  <select
                    className="inp"
                    value={reportingCurrency}
                    onChange={(e) => setReportingCurrency(e.target.value as OnboardingPayload['reporting_currency'])}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="fl" style={{ flex: 1 }}>
                  <label>Primary language<Req /></label>
                  <select
                    className="inp"
                    value={primaryLanguage}
                    onChange={(e) => setPrimaryLanguage(e.target.value as OnboardingPayload['primary_language'])}
                  >
                    <option value="en">English</option>
                    <option value="ar">Arabic</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <div className="fl" style={{ flex: 1 }}>
                  <label>Founded year</label>
                  <input type="number" className="inp" placeholder="e.g. 1995" value={foundedYear} onChange={(e) => setFoundedYear(e.target.value)} />
                </div>
                <div className="fl" style={{ flex: 1 }}>
                  <label>Website</label>
                  <input type="text" className="inp" placeholder="https://..." value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <div className="fl" style={{ flex: 1 }}>
                  <label>Headquarter city</label>
                  <input type="text" className="inp" value={headquarterCity} onChange={(e) => setHeadquarterCity(e.target.value)} />
                </div>
                <div className="fl" style={{ flex: 1 }}>
                  <label>Listed exchange</label>
                  <input type="text" className="inp" placeholder="e.g. Tadawul, DFM" value={listedExchange} onChange={(e) => setListedExchange(e.target.value)} />
                </div>
              </div>

              {error && (
                <div style={{ fontSize: '11px', color: '#E5484D', marginTop: '4px', marginBottom: '8px' }} role="alert">
                  {error}
                </div>
              )}

              <button type="button" className="btn-auth" onClick={goToDepartments}>
                Continue →
              </button>
            </>
          ) : (
            <DepartmentSelectionStep
              selectedCodes={selectedDeptCodes}
              onSelect={setSelectedDeptCodes}
              onBack={() => setStep('details')}
              onSubmit={() => setStep('setup')}
              onOptionsLoaded={setDeptOptions}
            />
          )}
        </div>
      </div>
    </div>
  );
}
