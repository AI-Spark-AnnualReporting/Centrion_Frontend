export interface StepOneState {
  full_name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface StepTwoState {
  companyName: string;
  jurisdiction: string;
  // Optional sources for background profile extraction (kicked off on submit).
  website?: string;
  file?: File | null;
}

export interface RegisterRequest {
  email: string;
  password: string;
  full_name: string;
  role?: string;
  company_id?: string;
}

export interface RegisterResponse {
  message: string;
  user_id?: string;
  email?: string;
  full_name?: string;
  role?: string;
  company_id?: string | null;
}
