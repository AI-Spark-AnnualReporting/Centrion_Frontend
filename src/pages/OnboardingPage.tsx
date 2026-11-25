import { useEffect, useRef, useState } from 'react';
import { Info, ShieldAlert, Sparkles } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TooltipPortal } from '@radix-ui/react-tooltip';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
import { ApiError, companies, extractCompanyProfile, getSectors, sparkInternal, type ExtractedCompanyProfile } from '@/lib/api';
import { saveNewLogins } from '@/lib/sparkLogins';
import { CYCLE_SECTOR_OPTIONS } from '@/types/cycles';
import { useAuth } from '@/context/AuthContext';

// The reason kept when setup itself failed, so no departments (and therefore
// no lead logins) were made. The Logins dialog puts its own "We couldn't create
// the department lead logins." in front of it, so this is only the reason.
const SETUP_FAILED_LEADS_MESSAGE = "Setup didn't finish.";

/** The reason to keep when creating the lead logins fails (the server's words when there are any). */
function describeCreateLeadsError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Something went wrong.';
}

/**
 * Create the department lead logins for a Spark-made company, after its
 * onboarding (and so its departments) has been saved.
 *
 * Leaves the result in this tab's sessionStorage for the Logins dialog. Every
 * lead gets the fixed Spark temporary password on the server. Never throws:
 * the setup screen must always go on to open the app.
 */
async function createLeadLoginsAfterSetup(companyId: string): Promise<void> {
  try {
    const result = await sparkInternal.createLeads(companyId);
    saveNewLogins(companyId, { ok: true, created: result.created ?? [], skipped: result.skipped ?? [] });
  } catch (error) {
    saveNewLogins(companyId, { ok: false, error: describeCreateLeadsError(error) });
  }
}

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
// TODO: fold into REPORTING_CURRENCIES (@/constants/currency) once the backend
// widens OnboardingPayload['reporting_currency'] — that union is missing EUR/GBP,
// so importing the shared 9-item list here is a type error today.
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
// `info` is drawn BESIDE the <label>, never inside it: a button inside a label
// is "clicked" whenever the label text is clicked, so the help box would pop
// open every time someone clicked the field name.
const FieldLabel = ({
  children,
  required,
  ai,
  htmlFor,
  info,
}: {
  children: React.ReactNode;
  required?: boolean;
  ai?: boolean;
  htmlFor?: string;
  info?: React.ReactNode;
}) => {
  const label = (
    <label htmlFor={htmlFor} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: info ? 0 : undefined }}>
      {children}
      {required && <span style={{ color: '#E5484D', fontWeight: 700 }}>*</span>}
      {ai && <AiChip />}
    </label>
  );
  if (!info) return label;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
      {label}
      {info}
    </div>
  );
};

// Hover text for every "AI" mark on the Review step.
const AI_CHIP_TIP = 'Filled by AI. AI can make mistakes, so please check this.';
const AI_BADGE_TIP = 'Some fields were filled by AI. AI can make mistakes, so please check them.';

// A small tag with a dark hover note. Used for the "AI" chip on field labels
// and the "AI extracted" badge. Own TooltipProvider because the app has no
// global one. Rendered in a portal: the chip sits inside a field <label>, which
// is uppercase, so an in-place tooltip would shout in capitals. z-[10002]: the
// portal is at the end of <body>, behind onboarding's fixed full-screen layer
// (.auth, z-index 100) unless lifted above it.
function AiHint({ className, label, tip }: { className: string; label: string; tip: string }) {
  return (
    <TooltipProvider delayDuration={500}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={className} style={{ cursor: 'help' }}>{label}</span>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent side="top" sideOffset={6} collisionPadding={12} className="ob-ai-tip z-[10002]">
            {tip}
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
}

/** The small "AI" chip on a field label. */
function AiChip() {
  return <AiHint className="ai-chip" label="AI" tip={AI_CHIP_TIP} />;
}

// Shown under the tagline in the blue left panel on every onboarding step:
// everything entered here is what the rest of the product is built on.
function OnboardingReviewNotice() {
  return (
    <div className="ob-notice" role="note">
      <ShieldAlert className="ob-notice-icon" size={16} aria-hidden="true" />
      <div>
        <div className="ob-notice-title">Please review everything carefully</div>
        <div className="ob-notice-body">
          These details set up your workspace. Your departments, reports and AI-written
          content are all built from them.
        </div>
      </div>
    </div>
  );
}

// Review-step fields that can be filled by AI (website scrape at signup, or the
// company profile document uploaded on step 1).
type AiField =
  | 'description' | 'sector' | 'employees' | 'founded' | 'hqCity'
  | 'fiscalYear' | 'currency' | 'language' | 'exchange';

// Which of the company row's values came from the signup scrape. The DB keeps
// no record of this, so it is inferred, and we only claim "AI" when sure:
//  - currency / language have DB defaults (SAR / en), so only a non-default
//    value can be from the AI; the default could be either.
//  - a Spark-created company (created_by set) may have had its sector picked
//    by a person, so it isn't claimed.
//  - fiscal year is never seeded from the row (see applyCompany).
function aiFieldsFromCompanyRow(c: Company): AiField[] {
  const fields: AiField[] = [];
  if (c.description && c.description.trim()) fields.push('description');
  if (c.sector_id && !c.created_by) fields.push('sector');
  if (c.employee_count != null) fields.push('employees');
  if (c.founded_year != null) fields.push('founded');
  if (c.headquarter_city) fields.push('hqCity');
  if (c.reporting_currency && c.reporting_currency !== 'SAR') fields.push('currency');
  if (c.primary_language && c.primary_language !== 'en') fields.push('language');
  if (c.listed_exchange) fields.push('exchange');
  return fields;
}

// Which fields an uploaded profile document's extraction answered.
function aiFieldsFromExtraction(d: ExtractedCompanyProfile): AiField[] {
  const fields: AiField[] = [];
  if (d.description) fields.push('description');
  if (d.sector_id) fields.push('sector');
  if (d.employee_count != null) fields.push('employees');
  if (d.founded_year != null) fields.push('founded');
  if (d.headquarter_city) fields.push('hqCity');
  if (d.fiscal_year_end_month != null) fields.push('fiscalYear');
  if (d.reporting_currency) fields.push('currency');
  if (d.primary_language) fields.push('language');
  if (d.listed_exchange) fields.push('exchange');
  return fields;
}

// Above this many words the description box shows a gentle warning. It never
// blocks Continue — a long description is allowed, just less focused for the AI.
const DESCRIPTION_LONG_WORDS = 400;

/** Count the words in a piece of text. Empty or spaces-only text is 0 words. */
function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

// The "i" help button next to a Review-step field. Opens on hover, on focus
// (keyboard) and on click/tap (touch screens have no hover). A click "pins" it
// open so moving the mouse away doesn't close it; Escape or a click outside
// closes it. The small close delay lets the mouse travel from the icon into the box.
// How long the cursor must rest on an "i" before its box opens on hover.
const HOVER_OPEN_DELAY_MS = 500;

function FieldInfo({
  title,
  ariaLabel,
  align = 'start',
  children,
}: {
  title: string;
  ariaLabel: string;
  align?: 'start' | 'center' | 'end';
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const openTimer = useRef<number | undefined>(undefined);

  const cancelClose = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
  };
  const cancelOpen = () => {
    if (openTimer.current) window.clearTimeout(openTimer.current);
  };
  const openNow = () => {
    cancelOpen();
    cancelClose();
    setOpen(true);
  };
  // Hover opens only once the cursor rests on the icon, so sweeping the mouse
  // across the form doesn't flash boxes open. Click and keyboard focus open at once.
  const openAfterHover = () => {
    cancelOpen();
    cancelClose();
    openTimer.current = window.setTimeout(() => setOpen(true), HOVER_OPEN_DELAY_MS);
  };
  const closeSoon = () => {
    cancelOpen();
    if (pinned) return;
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 150);
  };
  const closeNow = () => {
    cancelOpen();
    cancelClose();
    setPinned(false);
    setOpen(false);
  };
  const togglePin = () => {
    if (pinned) {
      closeNow();
      return;
    }
    setPinned(true);
    openNow();
  };

  useEffect(() => {
    return () => {
      cancelOpen();
      cancelClose();
    };
  }, []);

  return (
    <Popover open={open} onOpenChange={(next) => (next ? openNow() : closeNow())}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="ob-info-btn"
          aria-label={ariaLabel}
          onMouseEnter={openAfterHover}
          onMouseLeave={closeSoon}
          onFocus={openNow}
          onBlur={closeSoon}
          onClick={(e) => {
            // Radix would toggle on click; we pin instead (see comment above).
            e.preventDefault();
            togglePin();
          }}
        >
          <Info size={14} />
        </button>
      </PopoverTrigger>
      {/* z-[10002]: onboarding is a fixed full-screen layer (.auth, z-index 100),
          and the popover renders at the end of <body>, so the default z-50
          would sit hidden behind it. Same value the leads popover uses. */}
      <PopoverContent
        align={align}
        side="bottom"
        sideOffset={6}
        collisionPadding={12}
        className="ob-info-pop z-[10002] bg-white border-[#E2E4F0] rounded-[12px] shadow-[0_18px_48px_rgba(26,29,46,.18)] motion-reduce:animate-none"
        onMouseEnter={openNow}
        onMouseLeave={closeSoon}
        // Keep focus in the textarea/icon — hovering must not steal focus.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <p className="ob-info-title">{title}</p>
        {children}
      </PopoverContent>
    </Popover>
  );
}

// One short line per field saying what it is, plus the same closing sentence
// everywhere. Deliberately not field-specific about where each value is used.
// `align` lines the box up so it stays inside the card: the right-hand tick-box
// opens leftwards, the middle one centred.
const HELP_USED_FOR = 'Centriyon uses this to set up your workspace and reports, so please make sure it is correct.';

const FIELD_HELP: Record<string, { title: string; line: string; align?: 'start' | 'center' | 'end' }> = {
  sector: { title: 'Sector', line: 'The industry your company operates in.' },
  companyProfile: { title: 'Company profile', line: 'Whether your company is listed or private.' },
  reportingSector: { title: 'Reporting sector', line: 'The regulatory category your company reports under.' },
  employees: { title: 'Employees', line: 'The total number of people your company employs.' },
  founded: { title: 'Founded year', line: 'The year your company was founded.' },
  hqCity: { title: 'HQ city', line: 'The city where your head office is.' },
  fiscalYear: { title: 'Fiscal year end', line: 'The month your financial year ends.' },
  currency: { title: 'Currency', line: 'The currency your financial figures are reported in.' },
  language: { title: 'Language', line: "Your company's main language." },
  exchange: { title: 'Exchange', line: 'The stock exchange and ticker your company is listed under.' },
  shariah: { title: 'Shariah-compliant', line: 'Whether your company follows Shariah principles.' },
  subsidiaries: { title: 'Has subsidiaries', line: 'Whether your company owns other companies.', align: 'center' },
  sukuk: { title: 'Has sukuk', line: 'Whether your company has issued sukuk.', align: 'end' },
};

/** The "i" button for one field, using its entry in FIELD_HELP. */
function HelpFor({ field }: { field: keyof typeof FIELD_HELP }) {
  const help = FIELD_HELP[field];
  return (
    <FieldInfo title={help.title} ariaLabel={`About ${help.title}`} align={help.align}>
      <p>{help.line}</p>
      <p className="ob-info-used">{HELP_USED_FOR}</p>
    </FieldInfo>
  );
}

/** The "i" button for Company description (its own wording and aria label). */
function DescriptionInfo() {
  return (
    <FieldInfo title="Company description" ariaLabel="About the company description">
      <p>A short overview of what your company does.</p>
      <p className="ob-info-used">{HELP_USED_FOR}</p>
    </FieldInfo>
  );
}

// Checkbox in its own bordered box (highlights when checked).
// The bordered box is a <div>; the clickable <label> fills it, and the optional
// "i" sits beside the label (not inside it — see FieldLabel for why).
const Checkbox = ({
  label,
  checked,
  onChange,
  info,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  info?: React.ReactNode;
}) => (
  <div
    style={{
      display: 'flex', alignItems: 'center', gap: 6,
      paddingRight: info ? 10 : 0, borderRadius: 10,
      border: `1.5px solid ${checked ? '#4040C8' : '#E2E4F0'}`,
      background: checked ? '#F4F5FF' : '#fff',
      transition: 'border-color .15s, background .15s',
    }}
  >
    <label
      style={{
        display: 'flex', alignItems: 'center', gap: 11, flex: 1, minWidth: 0,
        padding: info ? '13px 0 13px 16px' : '13px 16px',
        cursor: 'pointer', fontSize: 13.5, fontWeight: 600,
        color: checked ? '#4040C8' : '#1A1D2E',
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
    {info}
  </div>
);

export default function OnboardingPage() {
  const { user } = useAuth();
  // Spark staff run this wizard for a company they just created on someone
  // else's behalf, so the Command Center is not where their work is — the
  // client's annual report is, matching what clicking an existing company does.
  // Everyone else is setting up their OWN company and still lands on it.
  const isSpark = user?.role === 'spark_internal';
  const landingPath = isSpark ? '/annual-report' : '/dashboard';

  // Spark only: the company being set up, read ONCE when the wizard opens. A
  // company switch in another tab changes user.company_id, and the lead logins
  // must still go to the company this wizard started on.
  const [sparkCompanyId] = useState<string | null>(() =>
    user?.role === 'spark_internal' ? user.company_id ?? null : null,
  );
  // Spark only: true once the loaded company turns out to be one a Spark user
  // created (companies.created_by is set). The server refuses lead logins for a
  // self-signup company, so the card is not offered there.
  const [createdInSpark, setCreatedInSpark] = useState(false);
  // Spark only: "Create department lead logins" on the Departments step. Off by default.
  const [leadLoginsOn, setLeadLoginsOn] = useState(false);
  const canOfferLeadLogins = sparkCompanyId !== null && createdInSpark;
  const wantsLeadLogins = canOfferLeadLogins && leadLoginsOn;

  /** Switch the lead logins on or off. */
  const handleLeadLoginsChange = (enabled: boolean) => {
    setLeadLoginsOn(enabled);
  };

  /** Move on to the setup screen. */
  const startProcessing = () => {
    setStep('processing');
  };

  const [step, setStep] = useState<Step>('loading');
  const [urlFailed, setUrlFailed] = useState(false);
  const [reviewErrors, setReviewErrors] = useState<Record<string, string>>({});

  // Company details (Review Details step)
  const [description, setDescription] = useState('');
  const descriptionWords = countWords(description);

  // Which fields the AI actually filled. The "AI" chip shows only on these, and
  // only while the field still has a value — an empty field marked "AI" made
  // users ask why the AI didn't pick it up.
  const [aiFilledFields, setAiFilledFields] = useState<Set<AiField>>(new Set());
  /** True when the AI filled this field and it is not empty now. */
  const showAiChip = (field: AiField, value: string): boolean =>
    aiFilledFields.has(field) && value.trim() !== '';
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
    setAiFilledFields((prev) => new Set([...prev, ...aiFieldsFromCompanyRow(c)]));
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
          setCreatedInSpark(Boolean(c.created_by));
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
  //
  // The backend now saves these and returns the MERGED result, so this is applying
  // what the company row actually holds: a re-upload from step 1 overwrites what the
  // new document answers and leaves the rest alone. Setting only truthy values is
  // the same rule on the form side — a field the document is silent about keeps
  // whatever is already in the box.
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
    setAiFilledFields((prev) => new Set([...prev, ...aiFieldsFromExtraction(d)]));
    // website_url is deliberately NOT applied, and sector_name has no field. The
    // Review step has no website input, so taking the document's URL would silently
    // replace the one the user gave at signup — in a value they can neither see nor
    // correct before it is submitted. Same rule the backend follows by leaving
    // website_url out of PERSISTED_PROFILE_FIELDS.
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
        // ApiError.message already carries the backend's `detail` (or a
        // generic message for 429/5xx infra failures) — read it rather than
        // re-parsing `err.body.detail` directly, which would bypass that
        // sanitization.
        setAnalyseError(
          err instanceof ApiError && err.message
            ? err.message
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
    if (description.trim().length < 20) {
      errs.description = 'Add a description of at least 20 characters: what the company does and where it operates.';
    }
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
    return (
      <SetupInProgressAnimation
        payload={buildPayload()}
        files={uploadedFiles}
        landingPath={landingPath}
        onOnboarded={wantsLeadLogins ? () => createLeadLoginsAfterSetup(sparkCompanyId) : undefined}
        onOnboardingFailed={
          wantsLeadLogins
            ? () => saveNewLogins(sparkCompanyId, { ok: false, error: SETUP_FAILED_LEADS_MESSAGE })
            : undefined
        }
      />
    );
  }

  const stepNumber = { intel: 1, review: 2, brand: 3, departments: 4, upload: 5 }[step];
  const cards = LEFT_CARDS[step];

  // The "AI extracted" badge only when at least one field still shows its AI chip.
  const anyAiChipShown =
    showAiChip('description', description) ||
    showAiChip('sector', sectorId) ||
    showAiChip('employees', employeeCount) ||
    showAiChip('founded', foundedYear) ||
    showAiChip('hqCity', headquarterCity) ||
    showAiChip('fiscalYear', fiscalYearEndMonth) ||
    showAiChip('currency', reportingCurrency) ||
    showAiChip('language', primaryLanguage) ||
    showAiChip('exchange', listedExchange);

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
            <OnboardingReviewNotice />
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
                {anyAiChipShown && <AiHint className="ai-badge" label="AI extracted" tip={AI_BADGE_TIP} />}
              </div>
              <p>
                {anyAiChipShown
                  ? 'Review the auto-filled details and complete the required fields — then continue.'
                  : 'Fill in your company details and the required fields — then continue.'}
              </p>

              <div className="fl">
                <FieldLabel required ai={showAiChip('description', description)} htmlFor="company-description" info={<DescriptionInfo />}>
                  Company description
                </FieldLabel>
                <p className="ob-brand-hint" style={{ marginBottom: 8 }}>
                  {showAiChip('description', description)
                    ? 'AI wrote this from your sources. Check the facts and fix anything wrong. '
                    : 'Describe what the company does. '}
                  Aim for 4–8 sentences (about 100–200 words).
                </p>
                {/* 9 rows fits a typical AI description (~900 characters) without
                    scrolling; longer text scrolls and the box can be dragged taller.
                    dir="auto" so Arabic text reads right-to-left. */}
                <textarea
                  id="company-description"
                  className={`inp${reviewErrors.description ? ' inp-error' : ''}`}
                  rows={9}
                  dir="auto"
                  placeholder="What the company does, its main activities, markets and history"
                  value={description}
                  onChange={(e) => { setDescription(e.target.value); clearReviewError('description'); }}
                  style={{ resize: 'vertical', lineHeight: 1.55 }}
                />
                <div className="ob-desc-foot">
                  {reviewErrors.description ? (
                    <div className="fl-err" style={{ marginTop: 0 }}>{reviewErrors.description}</div>
                  ) : descriptionWords > DESCRIPTION_LONG_WORDS ? (
                    <div className="ob-desc-long">
                      This is long. A focused 100–200 word description gives better AI results.
                    </div>
                  ) : null}
                  <span
                    className={`ob-char-count${descriptionWords > DESCRIPTION_LONG_WORDS ? ' long' : ''}`}
                    aria-live="polite"
                  >
                    {descriptionWords.toLocaleString()} {descriptionWords === 1 ? 'word' : 'words'}
                  </span>
                </div>
              </div>

              <div className="ob-review-grid">
                <div className="fl">
                  <FieldLabel required ai={showAiChip('sector', sectorId)} info={<HelpFor field="sector" />}>Sector</FieldLabel>
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
                  <FieldLabel required info={<HelpFor field="companyProfile" />}>Company profile</FieldLabel>
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
                  <FieldLabel required info={<HelpFor field="reportingSector" />}>Reporting sector</FieldLabel>
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
                  <FieldLabel required ai={showAiChip('employees', employeeCount)} info={<HelpFor field="employees" />}>Employees</FieldLabel>
                  <input type="number" min={1} className={`inp${reviewErrors.employeeCount ? ' inp-error' : ''}`} placeholder="e.g. 120" value={employeeCount} onChange={(e) => { setEmployeeCount(e.target.value); clearReviewError('employeeCount'); }} />
                  {reviewErrors.employeeCount && <div className="fl-err">{reviewErrors.employeeCount}</div>}
                </div>
                <div className="fl">
                  <FieldLabel ai={showAiChip('founded', foundedYear)} info={<HelpFor field="founded" />}>Founded year</FieldLabel>
                  <input type="number" className="inp" placeholder="e.g. 1995" value={foundedYear} onChange={(e) => setFoundedYear(e.target.value)} />
                </div>
                <div className="fl">
                  <FieldLabel ai={showAiChip('hqCity', headquarterCity)} info={<HelpFor field="hqCity" />}>HQ city</FieldLabel>
                  <input className="inp" placeholder="e.g. Riyadh" value={headquarterCity} onChange={(e) => setHeadquarterCity(e.target.value)} />
                </div>
                <div className="fl">
                  <FieldLabel required ai={showAiChip('fiscalYear', fiscalYearEndMonth)} info={<HelpFor field="fiscalYear" />}>Fiscal year end</FieldLabel>
                  <select
                    className={`inp sel${reviewErrors.fiscalYearEndMonth ? ' inp-error' : ''}`}
                    value={fiscalYearEndMonth}
                    onChange={(e) => { setFiscalYearEndMonth(e.target.value); clearReviewError('fiscalYearEndMonth'); }}
                  >
                    <option value="">Select the month it ends</option>
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i + 1}>{m}</option>
                    ))}
                  </select>
                  {reviewErrors.fiscalYearEndMonth && <div className="fl-err">{reviewErrors.fiscalYearEndMonth}</div>}
                </div>
                <div className="fl">
                  <FieldLabel required ai={showAiChip('currency', reportingCurrency)} info={<HelpFor field="currency" />}>Currency</FieldLabel>
                  <select className="inp sel" value={reportingCurrency} onChange={(e) => setReportingCurrency(e.target.value as OnboardingPayload['reporting_currency'])}>
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="fl">
                  <FieldLabel required ai={showAiChip('language', primaryLanguage)} info={<HelpFor field="language" />}>Language</FieldLabel>
                  <select className="inp sel" value={primaryLanguage} onChange={(e) => setPrimaryLanguage(e.target.value as OnboardingPayload['primary_language'])}>
                    <option value="en">English</option>
                    <option value="ar">Arabic</option>
                  </select>
                </div>
                <div className="fl">
                  <FieldLabel ai={showAiChip('exchange', listedExchange)} info={<HelpFor field="exchange" />}>Exchange</FieldLabel>
                  <input className="inp" placeholder="e.g. Tadawul (1010)" value={listedExchange} onChange={(e) => setListedExchange(e.target.value)} />
                </div>
              </div>

              <div className="ob-check-row">
                <Checkbox label="Shariah-compliant" checked={isShariah} onChange={setIsShariah} info={<HelpFor field="shariah" />} />
                <Checkbox label="Has subsidiaries" checked={hasSubsidiaries} onChange={setHasSubsidiaries} info={<HelpFor field="subsidiaries" />} />
                <Checkbox label="Has sukuk" checked={hasSukuk} onChange={setHasSukuk} info={<HelpFor field="sukuk" />} />
              </div>

              <div className="ob-review-foot">
                <button type="button" className="btn bs ob-foot-back" onClick={() => setStep('intel')}>← Back</button>
                {/* Only when the AI actually filled something on screen — a
                    warning about AI on hand-typed details would be noise. */}
                {anyAiChipShown && (
                  <span className="ob-ai-note">
                    <Sparkles size={12} aria-hidden="true" />
                    AI can make mistakes. Please check the details before you continue.
                  </span>
                )}
                <button type="button" className="btn bp ob-foot-next" onClick={onReviewContinue}>Looks good, Continue →</button>
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
              leadLogins={
                canOfferLeadLogins && sparkCompanyId
                  ? {
                      enabled: leadLoginsOn,
                      onChange: handleLeadLoginsChange,
                      companyId: sparkCompanyId,
                    }
                  : undefined
              }
            />
          )}

          {step === 'upload' && (
            <UploadReportsStep
              onProcess={(files) => {
                // Persist intent across the post-onboarding ProtectedRoute redirect
                // (which strips router state) so the dashboard lands on the
                // personal workspace, not the welcome screen.
                // Only DashboardPage reads this. Setting it while landing
                // somewhere else leaves it to fire on an unrelated later visit.
                if (files.length && landingPath === '/dashboard') {
                  sessionStorage.setItem('centriyon:freshUpload', '1');
                }
                setUploadedFiles(files);
                startProcessing();
              }}
              onSkip={() => {
                sessionStorage.removeItem('centriyon:freshUpload');
                setUploadedFiles([]);
                startProcessing();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
