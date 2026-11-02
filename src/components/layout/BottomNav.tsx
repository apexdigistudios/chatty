import { motion } from "framer-motion";
import { Compass, GraduationCap, Home, PlusCircle, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useAuthGateStore } from "../../store/authGateStore";
import { springs } from "../../theme/tokens";
import { Avatar } from "../ui/Avatar";

interface NavigationItem {
  label: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
  create?: boolean;
  profile?: boolean;
}

const navigation: NavigationItem[] = [
  { label: "Home", to: "/", icon: Home, end: true },
  { label: "Explore", to: "/explore", icon: Compass },
  { label: "Create", to: "/create", icon: PlusCircle, create: true },
  { label: "Schools", to: "/schools", icon: GraduationCap },
  { label: "Your profile", to: "/profile", icon: User, profile: true },
];

/** Icon-only iOS floating dock. Every item shares identical sizing and press physics. */
export function BottomNav() {
  const { user, profile } = useAuth();
  const openAuthGate = useAuthGateStore((state) => state.openAuthGate);

  return (
    <nav
      aria-label="Primary navigation"
      className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-40 w-[94%] max-w-sm -translate-x-1/2 rounded-full border border-zinc-200 bg-white/90 px-4 py-2 shadow-2xl backdrop-blur-lg transition-colors duration-200 dark:border-zinc-800 dark:bg-zinc-900/90 md:hidden"
    >
      <div className="grid grid-cols-5 items-center justify-items-center">
        {navigation.map(({ label, to, icon: Icon, end, create, profile: isProfile }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            aria-label={label}
            title={label}
            onClick={(event) => {
              if ((create || isProfile) && !user) {
                event.preventDefault();
                openAuthGate({
                  title: isProfile ? "Your SHS Student Pass" : "Drop a Campus Gist!",
                  speech: isProfile
                    ? "Create your secret student pass in 30 seconds to see your profile and campus gists!"
                    : "Grab your undercover @nickname in 30 seconds to post gists, photos and confessions!",
                  outfit: isProfile ? "detective" : "shs_welcome",
                  returnTo: to,
                });
              }
            }}
            className="group relative flex size-12 items-center justify-center rounded-full outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
          >
            {({ isActive }) => (
              <motion.span
                whileHover={{ y: -2, boxShadow: create ? "0px 5px 0px #5B21B6" : "0px 4px 0px var(--border-color)" }}
                whileTap={{ y: 2, scale: 0.94, boxShadow: create ? "0px 1px 0px #5B21B6" : "0px 1px 0px var(--border-color)" }}
                transition={springs.snappy}
                className={`relative flex size-11 items-center justify-center rounded-full ${
                  create
                    ? "bg-[#8B5CF6] text-white shadow-[0_3px_0_#5B21B6]"
                    : isActive
                      ? "bg-[#8B5CF6]/15 text-[#7C3AED] shadow-[0_3px_0_var(--border-color)] ring-1 ring-[#8B5CF6]/25 dark:bg-[#8B5CF6]/25 dark:text-[#A78BFA]"
                      : "text-ink-muted shadow-[0_3px_0_var(--border-color)] group-hover:bg-page group-hover:text-ink"
                }`}
              >
                {isProfile && user ? (
                  <Avatar name={profile?.username ?? "you"} src={profile?.avatarUrl} size="sm" ring={isActive} />
                ) : (
                  <Icon size={22} strokeWidth={isActive || create ? 2.65 : 2.3} aria-hidden />
                )}
              </motion.span>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
