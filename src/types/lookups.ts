// Lookup endpoint shapes — mirror /api/v1/lookups/*.

export interface RegionsResponse {
  regions: string[];
  total: number;
}

export interface CountryLookup {
  id: string;
  code: string;
  name: string;
  region: string;
}

export interface CountriesResponse {
  countries: CountryLookup[];
  total: number;
}

export type MandateStatus = 'mandatory' | 'voluntary' | 'mixed' | (string & {});

export interface RegulatorLookup {
  id: string;
  code: string;
  full_name: string;
  country_id: string;
  primary_frameworks: string[];
  mandate_status: MandateStatus;
  effective_year: number | null;
}

export interface RegulatorsResponse {
  regulators: RegulatorLookup[];
  total: number;
}

// /api/v1/lookups/scopes — combined catalogue used by the Reports form picker
// AND by the dashboard's framework compliance card.
export interface ScopeUniversal {
  code: string;
  label: string;
  indicator_count: number;
}

export interface ScopeRegional {
  regulator_id: string;
  code: string;
  label: string;
  country_id: string;
  country_code: string;
  country_name: string;
  primary_frameworks: string[];
  indicator_count: number;
}

export interface ScopesResponse {
  universal: ScopeUniversal[];
  regional: ScopeRegional[];
  totals: {
    universal_options: number;
    regional_options: number;
  };
}
