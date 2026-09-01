// Feature-visibility checks against the backend-computed visible_features
// list. Never recompute gating/derivation rules here — the backend already
// applied them; this just reads the resulting array.

import { useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import type { FeatureKey } from "@/constants/features";
import type { AuthUser } from "@/types/auth";

// Fail-closed: a user with no visible_features (e.g. a session cached before
// this system existed) sees no catalogued features until their next login,
// rather than silently seeing everything.
export function isFeatureVisible(user: AuthUser | null | undefined, key: FeatureKey): boolean {
  if (!user?.visible_features) return false;
  return user.visible_features.includes(key);
}

export function useFeatureAccess() {
  const { user } = useAuth();
  const isVisible = useCallback((key: FeatureKey) => isFeatureVisible(user, key), [user]);
  return { isVisible, visibleFeatures: user?.visible_features ?? [] };
}

// Action-level checks, for features whose page shows a create form/action
// (e.g. a validator's config form + "Run") alongside a read list (previous
// reports/history). create implies read (a user who can create a report can
// always see the ones they and others made) — read alone never implies
// create.
export function canCreateFeature(user: AuthUser | null | undefined, key: FeatureKey): boolean {
  return user?.permissions?.[key]?.create === true;
}

export function canReadFeature(user: AuthUser | null | undefined, key: FeatureKey): boolean {
  const perms = user?.permissions?.[key];
  return perms?.read === true || perms?.create === true;
}

export function useFeaturePermissions(key: FeatureKey) {
  const { user } = useAuth();
  return {
    canCreate: canCreateFeature(user, key),
    canRead: canReadFeature(user, key),
  };
}
