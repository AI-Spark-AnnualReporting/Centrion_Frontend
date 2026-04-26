export interface AuthUser {
  user_id: string;
  email: string;
  full_name: string;
  role: "admin" | "user";
  company_id?: string | null;
  company_name?: string | null;
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
