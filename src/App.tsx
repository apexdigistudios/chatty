import { useEffect } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthGateModal } from "./components/auth/AuthGateModal";
import { CommentDrawer } from "./components/feed/CommentDrawer";
import { NotificationDrawer } from "./components/notifications/NotificationDrawer";
import { NotificationListener } from "./components/notifications/NotificationListener";
import { AppLayout } from "./components/layout/AppLayout";
import { SetupGate } from "./components/SetupGate";
import { ToastProvider, ToastViewport } from "./components/ui/Toast";
import { AuthProvider } from "./context/AuthContext";
import { isSupabaseConfigured } from "./lib/supabase";
import { AdminPage } from "./pages/AdminPage";
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
import { useGistStore } from "./store/gistStore";
import { springs } from "./theme/tokens";

const FULLSCREEN_PATHS = new Set(["/create", "/auth", "/shoutouts/create"]);

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
          <Route path="/schools" element={<SchoolsPage />} />
          <Route path="/schools/:id" element={<SchoolPage />} />
          <Route path="/confessions" element={<ConfessionsPage />} />
          <Route path="/shoutouts" element={<ShoutoutsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/profile/:userId" element={<PublicProfilePage />} />
          <Route path="/admin" element={<AdminPage />} />
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
    if (location.pathname === "/auth") return <AuthWizardPage />;
    if (location.pathname === "/shoutouts/create") return <ShoutoutCreatePage />;
    return <CreatePage />;
  }

  return (
    <AppLayout>
      <AnimatedRoutes />
    </AppLayout>
  );
}

export default function App() {
  if (!isSupabaseConfigured) return <SetupGate />;

  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <NotificationListener />
            <Shell />
            <AuthGateModal />
            <CommentDrawer />
            <NotificationDrawer />
            <ToastViewport />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </MotionConfig>
  );
}
