import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isUserGlobalAdmin } from "../lib/adminAccess";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { ensureProfile, fetchMyRoles, signOut as signOutService } from "../services/profilesService";
import type { AdminRoleRow, Profile } from "../types/models";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: AdminRoleRow[];
  isGlobalAdmin: boolean;
  /** School ids this user moderates via admin_roles (founders are also covered by schools.creator_id). */
  moderatedSchoolIds: string[];
  /** True until the initial session + profile load finishes. */
  loading: boolean;
  profileError: string | null;
  refreshProfile: () => Promise<void>;
  setProfile: (profile: Profile) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AdminRoleRow[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [profileError, setProfileError] = useState<string | null>(null);
  const sessionUserId = useRef<string | null>(null);

  // Session bootstrap + live auth changes.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    let sessionCheckComplete = false;

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        sessionCheckComplete = true;
        if (error) {
          setProfileError(error.message);
          setLoading(false);
          return;
        }
        setProfileError(null);
        sessionUserId.current = data.session?.user.id ?? null;
        setSession(data.session);
        if (!data.session) setLoading(false);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setProfileError(
          error instanceof Error ? error.message : "Could not check your sign-in status."
        );
        sessionCheckComplete = true;
        setLoading(false);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const nextUserId = nextSession?.user.id ?? null;
      if (sessionUserId.current !== nextUserId) {
        sessionUserId.current = nextUserId;
        setLoading(Boolean(nextSession));
      }
      setSession(nextSession);
      if (!nextSession) {
        setProfileState(null);
        setRoles([]);
        if (sessionCheckComplete) setLoading(false);
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id ?? null;

  const refreshProfile = useCallback(async () => {
    if (!userId) {
      setProfileState(null);
      setRoles([]);
      return;
    }
    const [profileResult, rolesResult] = await Promise.allSettled([
      ensureProfile(),
      fetchMyRoles(),
    ]);
    if (profileResult.status === "rejected") {
      setProfileError(
        profileResult.reason instanceof Error
          ? profileResult.reason.message
          : "Could not load your profile."
      );
      return;
    }

    setProfileState(profileResult.value);
    if (rolesResult.status === "fulfilled") {
      setRoles(rolesResult.value);
      setProfileError(null);
    } else {
      setRoles([]);
      setProfileError(
        rolesResult.reason instanceof Error
          ? rolesResult.reason.message
          : "Could not load your account roles."
      );
    }
  }, [userId]);

  // Load profile + roles whenever the signed-in user changes.
  useEffect(() => {
    if (!userId) return;
    let active = true;
    setLoading(true);
    refreshProfile().finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [userId, refreshProfile]);

  const signOut = useCallback(async () => {
    await signOutService();
    setProfileState(null);
    setRoles([]);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      roles,
      isGlobalAdmin:
        roles.some((role) => role.role === "global_admin") ||
        isUserGlobalAdmin(session?.user.email),
      moderatedSchoolIds: roles
        .filter((role) => role.role === "school_moderator" && role.school_id)
        .map((role) => role.school_id as string),
      loading,
      profileError,
      refreshProfile,
      setProfile: setProfileState,
      signOut,
    }),
    [session, profile, roles, loading, profileError, refreshProfile, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>.");
  return context;
}
