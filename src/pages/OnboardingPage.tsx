import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import type { OnboardingPayload } from '@/types/auth';

const Req = () => (
  <span style={{ color: '#E5484D', fontWeight: 700 }}> *</span>
);

const LogoMark = () => (
  <svg viewBox="0 0 16 16" fill="none" width="17" height="17">
    <rect x="1" y="1" width="6" height="6" rx="1.2" fill="white" />
    <rect x="9" y="1" width="6" height="6" rx="1.2" fill="white" opacity=".4" />
    <rect x="1" y="9" width="6" height="6" rx="1.2" fill="white" opacity=".4" />
    <rect x="9" y="9" width="6" height="6" rx="1.2" fill="white" />
  </svg>
);

function Spinner() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      style={{ marginRight: 8, animation: 'spin 1s linear infinite' }}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const CURRENCIES: OnboardingPayload['reporting_currency'][] = [
  'SAR', 'AED', 'BHD', 'KWD', 'OMR', 'QAR', 'USD',
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { completeOnboarding } = useAuth();

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Company Setup
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

  const handleComplete = async () => {
    if (loading) return;
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

    const trimmedFounded = foundedYear.trim();
    const payload: OnboardingPayload = {
      description: description.trim(),
      employee_count: count,
      fiscal_year_end_month: Number(fiscalYearEndMonth),
      reporting_currency: reportingCurrency,
      primary_language: primaryLanguage,
      founded_year: trimmedFounded ? Number(trimmedFounded) : null,
      website_url: websiteUrl.trim() || null,
      headquarter_city: headquarterCity.trim() || null,
      listed_exchange: listedExchange.trim() || null,
    };

    setLoading(true);
    try {
      await completeOnboarding(payload);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      );
      setLoading(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-l">
          <div>
            <div className="flex items-center gap-[10px] mb-3">
              <div className="w-9 h-9 bg-[#4040C8] rounded-[10px] flex items-center justify-center flex-shrink-0">
                <LogoMark />
              </div>
              <span className="text-[17px] font-extrabold text-white tracking-tight">
                Centriyon
              </span>
            </div>
            <p
              style={{
                fontSize: '11px',
                color: 'rgba(255,255,255,.4)',
                lineHeight: 1.65,
                marginBottom: '32px',
                maxWidth: '240px',
              }}
            >
              One quick setup and your workspace is ready — GRI 2021, IFRS S1/S2,
              SAMA &amp; CMA pre-configured.
            </p>
          </div>
          <div className="flex flex-col gap-[10px]">
            <div className="auth-stat">
              <div className="auth-sv">Tailored to your org</div>
              <div className="auth-sl">Currency, fiscal year &amp; language</div>
            </div>
            <div className="auth-stat">
              <div className="auth-sv">Done once</div>
              <div className="auth-sl">Straight to the dashboard next time</div>
            </div>
          </div>
        </div>

        <div className="auth-r">
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
              <select
                className="inp"
                value={fiscalYearEndMonth}
                onChange={(e) => setFiscalYearEndMonth(e.target.value)}
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
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
                onChange={(e) =>
                  setReportingCurrency(
                    e.target.value as OnboardingPayload['reporting_currency'],
                  )
                }
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="fl" style={{ flex: 1 }}>
              <label>Primary language<Req /></label>
              <select
                className="inp"
                value={primaryLanguage}
                onChange={(e) =>
                  setPrimaryLanguage(
                    e.target.value as OnboardingPayload['primary_language'],
                  )
                }
              >
                <option value="en">English</option>
                <option value="ar">Arabic</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div className="fl" style={{ flex: 1 }}>
              <label>Founded year</label>
              <input
                type="number"
                className="inp"
                placeholder="e.g. 1995"
                value={foundedYear}
                onChange={(e) => setFoundedYear(e.target.value)}
              />
            </div>
            <div className="fl" style={{ flex: 1 }}>
              <label>Website</label>
              <input
                type="text"
                className="inp"
                placeholder="https://..."
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div className="fl" style={{ flex: 1 }}>
              <label>Headquarter city</label>
              <input
                type="text"
                className="inp"
                value={headquarterCity}
                onChange={(e) => setHeadquarterCity(e.target.value)}
              />
            </div>
            <div className="fl" style={{ flex: 1 }}>
              <label>Listed exchange</label>
              <input
                type="text"
                className="inp"
                placeholder="e.g. Tadawul, DFM"
                value={listedExchange}
                onChange={(e) => setListedExchange(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div
              style={{ fontSize: '11px', color: '#E5484D', marginTop: '4px', marginBottom: '8px' }}
              role="alert"
            >
              {error}
            </div>
          )}

          <button
            type="button"
            className="btn-auth"
            onClick={handleComplete}
            disabled={loading}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {loading ? (
              <>
                <Spinner />
                Setting up…
              </>
            ) : (
              'Complete Setup'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
