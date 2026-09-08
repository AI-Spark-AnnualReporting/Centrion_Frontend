import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  setAuthToken,
  setStoredUser,
} from "@/lib/api";
import {
  clearActingCompany,
  getActingCompany,
  setActingCompany,
  type ActingCompany,
} from "@/lib/acting-company";
import type { AuthUser, OnboardingPayload, UserProfile } from "@/types/auth";
import type { CompanyRecord } from "@/types/company";

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login(email: string, password: string): Promise<AuthUser>;
  // Forced rotation after first-login. Updates the stored user on success so
  // the must_change_password gate clears immediately.
  changePassword(newPassword: string): Promise<void>;
  // Re-fetch /auth/me and replace the cached user. Useful right after a
  // password change to flush must_change_password back to false.
  refreshUser(): Promise<void>;
  // Submit the first-login onboarding form. Stores the freshly-issued token +
  // user (onboarding_completed = true) so the gate clears immediately.
  completeOnboarding(payload: OnboardingPayload): Promise<void>;
  logout(): void;
  // The company a `spark_internal` session is acting on, or null. Always null
  // for every other role — they cannot act outside their own company.
  actingCompany: ActingCompany | null;
  // Enter a company. Does NOT navigate: AuthProvider is mounted outside
  // <BrowserRouter> (see main.tsx), so it has no router context — callers
  // navigate themselves.
  switchCompany(company: ActingCompany): void;
  leaveCompany(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Rehydrate synchronously so the first render already reflects stored auth.
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  const [token, setToken] = useState<string | null>(() => getToken());
  const [loading, setLoading] = useState<boolean>(true);
  // Same synchronous rehydrate as above, so the very first request already
  // carries X-Company-Id and the first render already knows where it is.
  const [actingCompany, setActing] = useState<ActingCompany | null>(() => getActingCompany());

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
    // Reconcile the /auth/me payload with the stored shape — /me types `role`
    // as a plain string while AuthUser narrows it to the 3 known roles, so
    // coerce defensively (default to the least-privileged role).
    setUser((prev) => {
      const next: AuthUser = {
        user_id: me.user_id,
        email: me.email,
        full_name: me.full_name,
        role: (me.role as AuthUser["role"]) ?? "department_user",
        company_id: me.company_id,
        company_name: me.company_name,
        must_change_password: me.must_change_password ?? false,
        // Carry the onboarding flag through — omitting it here would silently
        // wipe the gate when refreshUser runs (e.g. after changePassword).
        onboarding_completed: me.onboarding_completed ?? null,
        // /auth/me doesn't carry the permission system's fields — preserve
        // whatever was already in state so a refresh (e.g. after
        // changePassword) doesn't silently wipe them.
        permissions: prev?.permissions,
        visible_features: prev?.visible_features,
        apps: prev?.apps,
        default_app: prev?.default_app,
      };
      setStoredUser(next);
      return next;
    });
  }, []);

  const completeOnboarding = useCallback(
    async (payload: OnboardingPayload) => {
      const data = await authApi.onboarding(payload);
      setAuthToken(data.access_token);
      setToken(data.access_token);
      // Merge onto the previous user, don't replace it. `data.user` is the raw
      // users row and carries none of the permission fields; replacing wholesale
      // empties visible_features, and isFeatureVisible() fails closed — which
      // hides every sidebar item and bounces off /dashboard (it sits behind
      // requiredFeature="command_center"). Same defensive merge as refreshUser.
      setUser((prev) => {
        const updated: AuthUser = {
          ...(prev ?? {}),
          ...data.user,
          onboarding_completed: true,
          permissions: data.user.permissions ?? prev?.permissions,
          visible_features: data.user.visible_features ?? prev?.visible_features,
          apps: data.user.apps ?? prev?.apps,
          default_app: data.user.default_app ?? prev?.default_app,
        } as AuthUser;
        setStoredUser(updated);
        return updated;
      });
    },
    [],
  );

  const changePassword = useCallback(
    async (newPassword: string) => {
      await authApi.changePassword({
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
    apiLogout(); // also clears the acting company from storage
    setToken(null);
    setUser(null);
    setActing(null);
  }, []);

  const switchCompany = useCallback((company: ActingCompany) => {
    setActingCompany(company);
    setActing(company);
  }, []);

  const leaveCompany = useCallback(() => {
    clearActingCompany();
    setActing(null);
    // A one-shot "you just uploaded" flag set while onboarding one company would
    // otherwise fire on the next company's dashboard.
    try {
      sessionStorage.removeItem("centriyon:freshUpload");
    } catch {
      /* private mode / storage disabled — the flag simply isn't there */
    }
  }, []);

  // Spark staff have no company of their own, so everything downstream that
  // reads `user.company_id` — ~30 pages, the whole onboarding wizard, the
  // topbar breadcrumb — would otherwise see null and degrade. Overlaying the
  // chosen company here is what makes all of them work untouched, and it
  // mirrors exactly what the backend does with the X-Company-Id header.
  //
  // Not written to storage: the stored user stays the real, company-less one,
  // so clearing the acting company restores the truth with nothing to undo.
  const effectiveUser = useMemo<AuthUser | null>(() => {
    if (!user || user.role !== "spark_internal" || !actingCompany) return user;
    return { ...user, company_id: actingCompany.id, company_name: actingCompany.name };
  }, [user, actingCompany]);

  return (
    <AuthContext.Provider
      value={{
        user: effectiveUser,
        token,
        loading,
        login,
        changePassword,
        refreshUser,
        completeOnboarding,
        logout,
        actingCompany,
        switchCompany,
        leaveCompany,
      }}
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
