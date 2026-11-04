import { useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthGateModal } from "./components/auth/AuthGateModal";
import { PWAInstallPrompt } from "./components/common/PWAInstallPrompt";
import { OfflineSyncListener } from "./components/common/OfflineSyncListener";
import { SplashScreen } from "./components/common/SplashScreen";
import { CommentDrawer } from "./components/feed/CommentDrawer";
import { NotificationDrawer } from "./components/notifications/NotificationDrawer";
import { NotificationListener } from "./components/notifications/NotificationListener";
import { SEOHead } from "./components/seo/SEOHead";
import { AppLayout } from "./components/layout/AppLayout";
import { SetupGate } from "./components/SetupGate";
import { ToastProvider, ToastViewport } from "./components/ui/Toast";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { isSupabaseConfigured } from "./lib/supabase";
import { AdminPage } from "./pages/AdminPage";
import { AdminDashboard } from "./pages/AdminDashboard";
import { AuthWizardPage } from "./pages/AuthWizardPage";
import { ConfessionsPage } from "./pages/ConfessionsPage";
import { CreatePage } from "./pages/CreatePage";
import { ExplorePage } from "./pages/ExplorePage";
import { HomePage } from "./pages/HomePage";
import { ProfilePage } from "./pages/ProfilePage";
import { PublicProfilePage } from "./pages/PublicProfilePage";
import { SchoolPage } from "./pages/SchoolPage";
import { SchoolsPage } from "./pages/SchoolsPage";
import { ShoutoutsPage } from "./pages/ShoutoutsPage";
import { ShoutoutCreatePage } from "./pages/ShoutoutCreatePage";
import { SafetyPage } from "./pages/admin/SafetyPage";
import { SpotlightPage } from "./pages/SpotlightPage";
import { LegalPage } from "./pages/LegalPage";
import { useGistStore } from "./store/gistStore";
import { springs } from "./theme/tokens";

const FULLSCREEN_PATHS = new Set(["/create", "/auth", "/login", "/register", "/shoutouts/create"]);

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={springs.gentle}
        className="min-h-[calc(100dvh-4rem)]"
      >
        <Routes location={location}>
          <Route path="/" element={<HomePage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/trending" element={<HomePage />} />
          <Route path="/spotlight" element={<SpotlightPage />} />
          <Route path="/login" element={<AuthWizardPage />} />
          <Route path="/register" element={<AuthWizardPage />} />
          <Route path="/privacy" element={<LegalPage kind="privacy" />} />
          <Route path="/terms" element={<LegalPage kind="terms" />} />
          <Route path="/schools" element={<SchoolsPage />} />
          <Route path="/schools/:id" element={<SchoolPage />} />
          <Route path="/confessions" element={<ConfessionsPage />} />
          <Route path="/shoutouts" element={<ShoutoutsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/profile/:userId" element={<PublicProfilePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/vvip" element={<AdminDashboard />} />
          <Route path="/admin/safety" element={<SafetyPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

/** Full-screen routes (creator, auth wizard) bypass the shell; public feeds share AppLayout. */
function Shell() {
  const location = useLocation();
  const loadSchools = useGistStore((state) => state.loadSchools);

  useEffect(() => {
    void loadSchools();
  }, [loadSchools]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  if (FULLSCREEN_PATHS.has(location.pathname)) {
    if (["/auth", "/login", "/register"].includes(location.pathname)) return <AuthWizardPage />;
    if (location.pathname === "/shoutouts/create") return <ShoutoutCreatePage />;
    return <CreatePage />;
  }

  return (
    <AppLayout>
      <AnimatedRoutes />
    </AppLayout>
  );
}

function RoutedApp() {
  const { loading } = useAuth();
  const loadFeed = useGistStore((state) => state.loadFeed);
  const initialFeedStarted = useRef(false);
  const [initialFeedReady, setInitialFeedReady] = useState(false);

  useEffect(() => {
    if (loading || initialFeedStarted.current) return;
    initialFeedStarted.current = true;
    void loadFeed().finally(() => setInitialFeedReady(true));
  }, [loading, loadFeed]);

  return (
    <>
      {!loading && (
        <>
          <NotificationListener />
          <OfflineSyncListener />
          <Shell />
          <AuthGateModal />
          <CommentDrawer />
          <NotificationDrawer />
          <ToastViewport />
        </>
      )}
      <AnimatePresence>
        {(loading || !initialFeedReady) && <SplashScreen key="startup-splash" />}
      </AnimatePresence>
    </>
  );
}

export default function App() {
  if (!isSupabaseConfigured) return <SetupGate />;

  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <SEOHead />
            <PWAInstallPrompt />
            <RoutedApp />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </MotionConfig>
  );
}
