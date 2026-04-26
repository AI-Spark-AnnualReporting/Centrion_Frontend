import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  companies,
  getStoredUser,
  getToken,
  login as apiLogin,
  logout as apiLogout,
  setStoredUser,
} from "@/lib/api";
import type { AuthUser } from "@/types/auth";
import type { CompanyRecord } from "@/types/company";

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Rehydrate synchronously so the first render already reflects stored auth.
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  const [token, setToken] = useState<string | null>(() => getToken());
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    setLoading(false);
  }, []);

  // Backfill `company_name` once per session — the login response doesn't
  // include it, but the topbar (and other surfaces) need a human-readable name.
  useEffect(() => {
    if (!user || !user.company_id || user.company_name) return;
    let cancelled = false;
    companies
      .get<CompanyRecord>(user.company_id)
      .then((company) => {
        if (cancelled || !company?.name) return;
        const enriched: AuthUser = { ...user, company_name: company.name };
        setStoredUser(enriched);
        setUser(enriched);
      })
      .catch(() => {
        // Silent — topbar simply renders without the company name.
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiLogin(email, password);
    setToken(res.access_token);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    apiLogout();
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
