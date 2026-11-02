import { motion } from "framer-motion";
import { Compass, EyeOff, GraduationCap, Home, LogOut, Mailbox, PlusCircle, ShieldAlert, ShieldCheck, Sparkles, User, type LucideIcon } from "lucide-react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useAuthGateStore } from "../../store/authGateStore";
import { useGistStore } from "../../store/gistStore";
import { springs } from "../../theme/tokens";
import { describeError } from "../../lib/supabase";
import { Avatar } from "../ui/Avatar";
import { ThemeToggle } from "../ui/ThemeToggle";
import { useToast } from "../ui/Toast";

interface SidebarItem {
  label: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
  featured?: boolean;
  badge?: string;
}

const primary: SidebarItem[] = [
  { label: "Home", to: "/", icon: Home, end: true },
  { label: "Explore", to: "/explore", icon: Compass },
  { label: "Create a Gist", to: "/create", icon: PlusCircle, featured: true },
  { label: "Schools", to: "/schools", icon: GraduationCap },
  { label: "Confessions", to: "/confessions", icon: EyeOff, badge: "Secret" },
  { label: "Shoutouts", to: "/shoutouts", icon: Mailbox, badge: "Post" },
  { label: "Profile", to: "/profile", icon: User },
];

function SidebarLink({
  label,
  to,
  icon: Icon,
  end,
  featured,
  badge,
  onClickIntercept,
}: SidebarItem & { onClickIntercept?: () => boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={(event) => {
        if (onClickIntercept && onClickIntercept()) {
          event.preventDefault();
        }
      }}
      className="block rounded-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
    >
      {({ isActive }) => (
        <motion.span
          whileTap={{ y: 3, boxShadow: "0px 1px 0px var(--border-strong)" }}
          transition={springs.snappy}
          className={`relative flex min-h-12 items-center gap-3 rounded-2xl border-2 px-3.5 text-sm font-extrabold transition-colors ${
            featured
              ? "border-brand-deep bg-brand-deep text-brand-contrast shadow-[0_4px_0_var(--brand-edge)]"
              : isActive
                ? "border-line bg-brand-wash text-brand-deep shadow-[0_3px_0_var(--border-color)]"
                : "border-transparent text-ink-muted hover:border-line hover:bg-card hover:text-ink"
          }`}
        >
          <Icon size={19} strokeWidth={2.5} aria-hidden />
          <span className="truncate">{label}</span>
          {badge && (
            <span className="ml-auto rounded-full bg-warning-wash px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-warning-deep">{badge}</span>
          )}
        </motion.span>
      )}
    </NavLink>
  );
}

/** Tablet/desktop navigation with moderation shortcuts for founders and admins. */
export function SidebarNav() {
  const { user, profile, isGlobalAdmin, moderatedSchoolIds, signOut } = useAuth();
  const openAuthGate = useAuthGateStore((state) => state.openAuthGate);
  const schools = useGistStore((state) => state.schools);
  const navigate = useNavigate();
  const { toast } = useToast();
  const mySchool = schools.find((school) => school.id === profile?.schoolId) ?? null;

  const handleSignOut = async () => {
    try {
      await signOut();
      toast("Signed out. See you at prep!", "brand");
      navigate("/");
    } catch (error) {
      toast(describeError(error), "danger");
    }
  };
  const founded = user ? schools.filter((school) => school.creatorId === user.id).map((school) => school.id) : [];
  const moderated = [...new Set([...moderatedSchoolIds, ...founded])];

  return (
    <nav aria-label="Main navigation" className="sticky top-[88px] py-7">
      <p className="mb-3 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-ink-muted">Your space</p>
      <div className="space-y-2">
        {primary.map((item) => (
          <SidebarLink
            key={item.to}
            {...item}
            onClickIntercept={
              item.to === "/create" && !user
                ? () => {
                    openAuthGate({
                      title: "Drop a Campus Gist!",
                      speech:
                        "Grab your undercover @nickname in 30 seconds to post gists, photos, and confessions!",
                      returnTo: "/create",
                    });
                    return true;
                  }
                : undefined
            }
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => navigate("/shoutouts/create")}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-brand bg-brand-wash px-3 py-2.5 text-[11px] font-black uppercase tracking-wider text-brand-deep shadow-[0_3px_0_var(--brand-edge)] transition-transform active:translate-y-[2px]"
      >
        <Mailbox size={15} strokeWidth={2.6} aria-hidden />
        Send a Shoutout
      </button>

      {(moderated.length > 0 || isGlobalAdmin) && (
        <>
          <p className="mb-3 mt-7 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-ink-muted">Moderation</p>
          <div className="space-y-2">
            {moderated.map((schoolId) => {
              const school = schools.find((item) => item.id === schoolId);
              return (
                <SidebarLink key={schoolId} to={`/schools/${schoolId}?tab=manage`} icon={ShieldCheck} label={`Manage ${school?.shortName ?? "community"}`} />
              );
            })}
            {isGlobalAdmin && <SidebarLink to="/admin" icon={Sparkles} label="Global admin" badge="Admin" />}
            {isGlobalAdmin && <SidebarLink to="/admin/safety" icon={ShieldAlert} label="Safety management" />}
          </div>
        </>
      )}

      {/* Account card — the signed-in avatar lives in the navigation shell. */}
      <div className="mt-7 border-t-2 border-line pt-4">
        {user && profile ? (
          <div className="rounded-2xl border-2 border-line bg-card p-2.5">
            <Link
              to="/profile"
              className="flex items-center gap-2.5 rounded-xl px-1 py-1 transition-colors hover:bg-page"
            >
              <Avatar name={profile.username} src={profile.avatarUrl} size="md" ring online />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-black text-ink">@{profile.username}</span>
                <span className="block truncate text-[10px] font-semibold text-ink-muted">
                  {mySchool?.shortName ?? "No SHS yet"}
                </span>
              </span>
            </Link>
            <div className="mt-2 flex items-center gap-1.5">
              <ThemeToggle className="h-8 min-h-8 flex-1 justify-center p-0" />
              <button
                type="button"
                onClick={handleSignOut}
                aria-label="Sign out"
                className="flex size-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-danger-wash hover:text-danger"
              >
                <LogOut size={14} strokeWidth={2.5} aria-hidden />
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-line bg-card p-3 text-center">
            <p className="text-xs font-extrabold text-ink">Join your SHS</p>
            <p className="mt-0.5 text-[10px] font-semibold text-ink-muted">Post, like and represent your campus.</p>
            <Link
              to="/auth?mode=signup"
              className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-xl bg-[#8B5CF6] text-[10px] font-extrabold uppercase tracking-wider text-white shadow-[0_3px_0_#5B21B6]"
            >
              Get started
            </Link>
          </div>
        )}
        <p className="mt-4 px-1 text-[10px] font-semibold leading-relaxed text-ink-muted">
          Your school. Your people. Your gist.
        </p>
      </div>
    </nav>
  );
}
