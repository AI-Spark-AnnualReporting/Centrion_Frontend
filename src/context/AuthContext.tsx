import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  auth as authApi,
  companies,
  getStoredUser,
  getToken,
  login as apiLogin,
  logout as apiLogout,
  setStoredUser,
} from "@/lib/api";
import type { AuthUser, UserProfile } from "@/types/auth";
import type { CompanyRecord } from "@/types/company";

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login(email: string, password: string): Promise<AuthUser>;
  // Forced rotation after first-login. Updates the stored user on success so
  // the must_change_password gate clears immediately.
  changePassword(oldPassword: string, newPassword: string): Promise<void>;
  // Re-fetch /auth/me and replace the cached user. Useful right after a
  // password change to flush must_change_password back to false.
  refreshUser(): Promise<void>;
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
    return res.user;
  }, []);

  const refreshUser = useCallback(async () => {
    const me = await authApi.me<UserProfile>();
    // Reconcile the /auth/me payload with the stored shape — the login
    // response carries `role: "admin" | "user"` while /me widens it to a
    // string, so coerce defensively.
    const next: AuthUser = {
      user_id: me.user_id,
      email: me.email,
      full_name: me.full_name,
      role: (me.role as AuthUser["role"]) ?? "user",
      company_id: me.company_id,
      company_name: me.company_name,
      must_change_password: me.must_change_password ?? false,
    };
    setStoredUser(next);
    setUser(next);
  }, []);

  const changePassword = useCallback(
    async (oldPassword: string, newPassword: string) => {
      await authApi.changePassword({
        old_password: oldPassword,
        new_password: newPassword,
      });
      // Optimistically clear the gate before the /me round-trip so the next
      // navigation doesn't bounce back to /change-password.
      setUser((prev) => {
        if (!prev) return prev;
        const cleared: AuthUser = { ...prev, must_change_password: false };
        setStoredUser(cleared);
        return cleared;
      });
      // Best-effort refresh — failures here don't block the user from
      // entering the app since we've already cleared the flag locally.
      try {
        await refreshUser();
      } catch {
        // Ignore — the optimistic update above is enough to proceed.
      }
    },
    [refreshUser],
  );

  const logout = useCallback(() => {
    apiLogout();
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, token, loading, login, changePassword, refreshUser, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
