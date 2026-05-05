export interface AuthUser {
  user_id: string;
  email: string;
  full_name: string;
  role: "admin" | "user";
  company_id?: string | null;
  company_name?: string | null;
  // Set TRUE for users created via /companies/{id}/team — backend flags
  // the row with must_change_password until they hit /auth/change-password.
  must_change_password?: boolean | null;
}

export interface LoginResponse {
  access_token: string;
  token_type: "bearer";
  user: AuthUser;
}

export interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
}

// GET /api/v1/auth/me — richer than the login payload (carries `status` and
// keeps company_name flat).
export interface UserProfile {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  status: string;
  company_id: string | null;
  company_name: string | null;
  must_change_password?: boolean | null;
}
