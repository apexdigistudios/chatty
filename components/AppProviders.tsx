'use client';

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig } from "framer-motion";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { NavigationFeedback } from "@/components/layout/NavigationFeedback";
import { AuthGateModal } from "@/components/auth/AuthGateModal";
import { OfflineSyncListener } from "@/components/common/OfflineSyncListener";
import { PWAInstallPrompt } from "@/components/common/PWAInstallPrompt";
import { SplashScreen } from "@/components/common/SplashScreen";
import { CommentDrawer } from "@/components/feed/CommentDrawer";
import { NotificationDrawer } from "@/components/notifications/NotificationDrawer";
import { NotificationListener } from "@/components/notifications/NotificationListener";
import { SEOHead } from "@/components/seo/SEOHead";
import { SetupGate } from "@/components/SetupGate";
import { ToastProvider, ToastViewport } from "@/components/ui/Toast";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { isSupabaseConfigured } from "@/lib/supabase";
import { identifyUser, resetUser } from "@/lib/mixpanel";
import { useGistStore } from "@/store/gistStore";
import { SPOTLIGHT_SCROLL_DIRECTION_EVENT, useScrollDirection } from "@/hooks/useScrollDirection";

const FULLSCREEN_PATHS = new Set([
  "/create",
  "/confessions/create",
  "/auth",
  "/onboarding",
  "/login",
  "/register",
  "/shoutouts/create",
]);

function RoutedApp({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, user, profile, isGlobalAdmin } = useAuth();
  const navigationHidden = useScrollDirection(pathname);
  const [spotlightNavigationHidden, setSpotlightNavigationHidden] = useState(false);
  const loadFeed = useGistStore((state) => state.loadFeed);
  const loadSchools = useGistStore((state) => state.loadSchools);
  const feedHasLoaded = useGistStore((state) => state.feedHasLoaded);
  const schoolsHasLoaded = useGistStore((state) => state.schoolsHasLoaded);
  const schools = useGistStore((state) => state.schools);
  const analyticsUserId = useRef<string | null>(null);
  const analyticsIdentity = useRef<string | null>(null);
  useEffect(() => {
    if (!user) {
      if (analyticsUserId.current) {
        resetUser();
        analyticsUserId.current = null;
        analyticsIdentity.current = null;
      }
      return;
    }
    if (!profile) return;
    const schoolName = schools.find((school) => school.id === profile.schoolId)?.name ?? null;
    const traits = {
      $name: profile.fullName?.trim() || profile.username,
      school_name: schoolName,
      is_verified: profile.isVerified ?? false,
    };
    const identity = JSON.stringify([user.id, traits]);
    if (analyticsIdentity.current === identity) return;
    identifyUser(user.id, {
      ...traits,
    });
    analyticsUserId.current = user.id;
    analyticsIdentity.current = identity;
  }, [profile, schools, user]);

  useEffect(() => {
    if (!isSupabaseConfigured || schoolsHasLoaded) return;
    if (pathname === "/schools") return;
    void loadSchools();
  }, [loadSchools, pathname, schoolsHasLoaded]);

  useEffect(() => {
    if (!isSupabaseConfigured || loading || feedHasLoaded) return;
    if (pathname === "/" || pathname === "/trending" || pathname === "/spotlight") return;
    void loadFeed();
  }, [feedHasLoaded, loading, loadFeed, pathname]);

  useEffect(() => {
    if (loading) return;
    if (pathname === "/onboarding" && !user) {
      router.replace("/auth?mode=signup&returnTo=%2F");
      return;
    }
    if (pathname === "/onboarding" && user && (profile || isGlobalAdmin)) {
      router.replace("/");
    }
  }, [isGlobalAdmin, loading, pathname, profile, router, user]);

  useEffect(() => {
    const handleSpotlightScroll = (event: Event) => {
      setSpotlightNavigationHidden((event as CustomEvent<boolean>).detail);
    };
    window.addEventListener(SPOTLIGHT_SCROLL_DIRECTION_EVENT, handleSpotlightScroll);
    return () => window.removeEventListener(SPOTLIGHT_SCROLL_DIRECTION_EVENT, handleSpotlightScroll);
  }, []);

  useEffect(() => {
    setSpotlightNavigationHidden(false);
  }, [pathname]);

  if (!isSupabaseConfigured) return <SetupGate />;

  const fullscreen = FULLSCREEN_PATHS.has(pathname);
  const standaloneAuth = pathname === "/auth" || pathname === "/login" || pathname === "/register";
  const standaloneOnboarding = pathname === "/onboarding";
  const isHome = pathname === "/";
  const isSpotlight = pathname === "/spotlight";

  return (
    <MotionConfig reducedMotion="user">
      <NavigationFeedback />
      <PWAInstallPrompt />
      <SEOHead />
      {!loading && (
        <>
          <NotificationListener />
          <OfflineSyncListener />
          <AuthGateModal />
          <CommentDrawer />
          <NotificationDrawer />
          <ToastViewport />
        </>
      )}
      {standaloneAuth || standaloneOnboarding ? (
        children
      ) : (
        <AppLayout
          headerHidden={false}
          bottomNavHidden={isSpotlight ? spotlightNavigationHidden : navigationHidden && isHome}
          fullscreen={fullscreen}
        >
          {children}
        </AppLayout>
      )}
      <AnimatePresence>
        {loading && <SplashScreen key="startup-splash" />}
      </AnimatePresence>
    </MotionConfig>
  );
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const registerServiceWorker = () => {
      void navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
        console.error("Could not register the offline image service worker.", error);
      });
    };

    if (document.readyState === "complete") {
      registerServiceWorker();
      return;
    }

    window.addEventListener("load", registerServiceWorker);
    return () => window.removeEventListener("load", registerServiceWorker);
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <RoutedApp>{children}</RoutedApp>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
