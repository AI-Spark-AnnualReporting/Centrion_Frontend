import type { BrandColors } from "@/types/brand";

export interface Sector {
  id: string;
  code: string;
  name: string;
}

export interface SectorsResponse {
  sectors: Sector[];
  total: number;
}

export interface CreateCompanyRequest {
  name: string;
  // Sector is captured on a separate onboarding step, not at signup, so it is
  // optional here and omitted from the request when not provided.
  sector_id?: string;
  jurisdiction?: string;
}

export interface CompanyRecord {
  id: string;
  name: string;
  jurisdiction: string | null;
  operating_mode: string;
  fiscal_year_end_month: number;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  sector_id: string;
}

export interface CreateCompanyResponse {
  company: CompanyRecord;
}

// Full company profile shown/edited on the Profile page (GET/PATCH
// /api/v1/companies/me). Superset of CompanyRecord; most fields are nullable.
export interface Company {
  id: string;
  name: string;
  sector_id: string | null;
  sector_name?: string; // populated by a backend join when available
  jurisdiction: string | null;
  description: string | null;
  employee_count: number | null;
  founded_year: number | null;
  website_url: string | null;
  headquarter_city: string | null;
  listed_exchange: string | null;
  reporting_currency: string | null;
  primary_language: string | null;
  fiscal_year_end_month: number | null;
  // Company-profile attributes (also editable on the Profile page). The
  // annual-report cycle inherits these from the company.
  company_profile: string | null;
  is_shariah: boolean | null;
  has_subsidiaries: boolean | null;
  has_sukuk: boolean | null;
  // SAR reporting sector (bank/insurance/general/reit/finance_co) — inherited by the cycle.
  reporting_sector: string | null;
  // Status of the signup-time background profile extraction (processing | done).
  profile_extraction_status?: string | null;
  // Report style extracted (background) from the docs uploaded at onboarding.
  // report_tone = the prose style "directive"; report_tone_profile = the
  // structured dimensions + verbatim exemplar sentences; theme = prose;
  // outline = merged table-of-contents.
  report_tone?: string | null;
  report_tone_profile?: { dimensions?: Record<string, string>; exemplars?: string[] } | null;
  // Key themes: name (shown on the dashboard) + a 2-3 sentence explanation (kept for later use).
  report_theme?: { name: string; explanation?: string }[] | null;
  report_outline?: string[] | null;
  // AI-extracted key highlights from the uploaded reports ({category, text}); shown on the workspace dashboard.
  report_highlights?: { category: string; text: string }[] | null;
  // Reporting/regulatory frameworks referenced by the uploaded ESG report (names).
  esg_frameworks?: string[] | null;
  // Branding captured on the onboarding Brand step. brand_colors is the company
  // default for report headings/covers — a report's own picker choice wins over it.
  // The logo is NOT here: GET /companies/me strips logo_base64 to keep the
  // payload small. Use companies.getMyCompanyLogo() when you need to render it.
  brand_identity?: string | null;
  // brand_identity distilled into the writing rules the report narrative prompts
  // actually carry (agents/narrative/brand_voice.py renders it). Written in the
  // background after a guideline is saved; brand_voice_status tracks that run.
  brand_voice?: BrandVoice | null;
  brand_voice_status?: string | null;   // 'processing' | 'done' | 'failed'
  brand_colors?: BrandColors | null;
  // The company's default cover layout + typography, set on the Brand Identity
  // page. Same rule as brand_colors: seeds a report, a report's own pick wins.
  report_design?: CompanyReportDesign | null;
  // Onboarding deep-ingest state — drives the dashboard card (fetch) + the setup screen.
  report_extraction_status?: string | null; // 'processing' | 'done' | 'failed'
  onboarding_progress?: { stage?: string; detail?: string; percent?: number } | null;
  plan_name: string | null;
  plan_renewal_date: string | null;
  max_seats: number | null;
  created_at: string;
  updated_at: string;
}

// The subset of fields an admin can change via PATCH /companies/me.
export type CompanyEditableFields = Pick<
  Company,
  | "name"
  | "sector_id"
  | "jurisdiction"
  | "employee_count"
  | "founded_year"
  | "website_url"
  | "headquarter_city"
  | "listed_exchange"
  | "reporting_currency"
  | "primary_language"
  | "fiscal_year_end_month"
  | "company_profile"
  | "is_shariah"
  | "has_subsidiaries"
  | "has_sukuk"
  | "reporting_sector"
>;

// The branding an admin can change via PATCH /companies/me, from the Brand
// Identity page. Separate from Company because logo_base64 is WRITE-ONLY here:
// PATCH accepts it, GET /companies/me strips it (read it back from
// companies.getMyCompanyLogo()), so putting it on Company would misdescribe
// every GET response. Passing null for any of the three clears that column.
// The condensed writing voice, as stored in companies.brand_voice. Fixed keys —
// the backend drops anything else and caps every list, so a hand-edit here can
// never grow the block appended to each narrative prompt.
export type BrandVoice = {
  register?: string | null;
  person?: string | null;
  sentence_style?: string | null;
  tone_adjectives?: string[];
  preferred_words?: string[];
  banned_words?: string[];
  do?: string[];
  dont?: string[];
};

export type CompanyBrandUpdate = {
  brand_identity?: string | null;
  brand_voice?: BrandVoice | null;
  brand_colors?: BrandColors | null;
  logo_base64?: string | null;
  // The company's default report look — cover layout + type. Colours are NOT
  // here; they stay in brand_colors, which already seeds a report's brand.
  report_design?: CompanyReportDesign | null;
};

// Mirrors companies.report_design. Both halves nullable: null means "no company
// default", and a report then falls through to the picked layout's blueprint.
export type CompanyReportDesign = {
  cover_template_key?: string | null;
  typography?: import('@/types/quarterly').Typography | null;
};
