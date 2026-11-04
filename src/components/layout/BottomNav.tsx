import { motion } from "framer-motion";
import { GraduationCap, Home, PlusCircle, User, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useAuthGateStore } from "../../store/authGateStore";
import { springs } from "../../theme/tokens";
import { Avatar } from "../ui/Avatar";
import { useScrollDirection } from "../../hooks/useScrollDirection";

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
  { label: "Spotlight", to: "/spotlight", icon: Zap },
  { label: "Create", to: "/create", icon: PlusCircle, create: true },
  { label: "Schools", to: "/schools", icon: GraduationCap },
  { label: "Your profile", to: "/profile", icon: User, profile: true },
];

/** Icon-only iOS floating dock. Every item shares identical sizing and press physics. */
export function BottomNav({ spotlight = false }: { spotlight?: boolean }) {
  const { user, profile } = useAuth();
  const openAuthGate = useAuthGateStore((state) => state.openAuthGate);
  const hidden = useScrollDirection();

  return (
    <nav
      aria-label="Primary navigation"
      className={`fixed inset-x-0 bottom-0 z-40 flex w-full items-center justify-center px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] transition-transform duration-300 ease-in-out md:hidden ${
        spotlight
          ? "border-0 bg-transparent shadow-none backdrop-blur-none"
          : "border-t border-zinc-200/60 bg-white/65 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur-lg dark:border-white/10 dark:bg-black/40 dark:shadow-[0_-8px_24px_rgba(0,0,0,0.2)]"
      } ${!spotlight && hidden ? "translate-y-full" : "translate-y-0"}`}
    >
      <div className="mx-auto grid w-full max-w-sm grid-cols-5 items-center justify-items-center">
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
                      ? spotlight
                        ? "bg-black/25 text-white ring-1 ring-white/30"
                        : "bg-[#8B5CF6]/15 text-[#7C3AED] ring-1 ring-[#8B5CF6]/25 dark:bg-[#8B5CF6]/25 dark:text-[#A78BFA]"
                      : spotlight
                        ? "bg-black/20 text-white hover:bg-black/40"
                        : "text-ink-muted group-hover:bg-black/5 group-hover:text-ink dark:group-hover:bg-white/10"
                }`}
              >
                {isProfile && user ? (
                  <Avatar name={profile?.username ?? "you"} src={profile?.avatarUrl} size="sm" />
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
