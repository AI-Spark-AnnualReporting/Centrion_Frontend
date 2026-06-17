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
  sector_id: string;
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
>;
