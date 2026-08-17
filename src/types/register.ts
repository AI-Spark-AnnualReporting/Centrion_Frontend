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
  company_id?: string | null;
}

// Registration no longer logs the user in — it only queues a verification
// email. `user_id` is the account created in an unverified state.
export interface RegisterResponse {
  message: string;
  email: string;
  user_id: string;
}
