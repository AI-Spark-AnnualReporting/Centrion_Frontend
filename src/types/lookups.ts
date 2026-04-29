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
