import { motion } from "framer-motion";
import { EyeOff, GraduationCap, Home, LogOut, Mailbox, PlusCircle, Search, ShieldAlert, ShieldCheck, Sparkles, User, Zap, type LucideIcon } from "lucide-react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useAuthGateStore } from "../../store/authGateStore";
import { useGistStore } from "../../store/gistStore";
import { springs } from "../../theme/tokens";
import { describeError } from "../../lib/supabase";
import { Avatar } from "../ui/Avatar";
import { ThemeToggle } from "../ui/ThemeToggle";
import { useToast } from "../ui/Toast";
import { BrandLogo } from "../brand/BrandLogo";

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
  { label: "Spotlight", to: "/spotlight", icon: Zap },
  { label: "Search", to: "/explore", icon: Search },
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
  collapsed = false,
  onClickIntercept,
}: SidebarItem & { collapsed?: boolean; onClickIntercept?: () => boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
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
          className={`relative flex min-h-12 items-center rounded-2xl border-2 text-sm font-extrabold transition-colors ${
            collapsed ? "justify-center px-0" : "gap-3 px-3.5"
          } ${
            featured
              ? "border-brand-deep bg-brand-deep text-brand-contrast shadow-[0_4px_0_var(--brand-edge)]"
              : isActive
                ? "border-line bg-brand-wash text-brand-deep shadow-[0_3px_0_var(--border-color)]"
                : "border-transparent text-ink-muted hover:border-line hover:bg-card hover:text-ink"
          }`}
        >
          <Icon size={19} strokeWidth={2.5} aria-hidden />
          <span className={collapsed ? "sr-only" : "truncate"}>{label}</span>
          {badge && !collapsed && (
            <span className="ml-auto rounded-full bg-warning-wash px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-warning-deep">{badge}</span>
          )}
        </motion.span>
      )}
    </NavLink>
  );
}

/** Tablet/desktop navigation with moderation shortcuts for founders and admins. */
export function SidebarNav({ collapsed = false }: { collapsed?: boolean }) {
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
    <nav aria-label="Main navigation" className={`sticky top-[88px] py-7 ${collapsed ? "px-0" : ""}`}>
      <Link to="/" aria-label="Gist me home" title={collapsed ? "Gist me home" : undefined} className={`mb-6 flex items-center rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft ${collapsed ? "justify-center px-0" : "gap-2.5 px-3"}`}>
        <BrandLogo className="h-8 w-auto max-w-8 shrink-0 object-contain" />
        <span className={collapsed ? "sr-only" : "truncate text-base font-black tracking-tight text-ink"}>Gist me</span>
      </Link>
      {!collapsed && <p className="mb-3 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-ink-muted">Your space</p>}
      <div className="space-y-2">
        {primary.map((item) => (
          <SidebarLink
            key={item.to}
            {...item}
            collapsed={collapsed}
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
        title={collapsed ? "Send a Shoutout" : undefined}
        aria-label={collapsed ? "Send a Shoutout" : undefined}
        className={`mt-3 flex min-h-12 w-full items-center justify-center rounded-2xl border-2 border-brand bg-brand-wash text-[11px] font-black uppercase tracking-wider text-brand-deep shadow-[0_3px_0_var(--brand-edge)] transition-transform active:translate-y-0.5 ${collapsed ? "px-0" : "gap-2 px-3 py-2.5"}`}
      >
        <Mailbox size={15} strokeWidth={2.6} aria-hidden />
        {!collapsed && "Send a Shoutout"}
      </button>

      {(moderated.length > 0 || isGlobalAdmin) && (
        <>
          {!collapsed && <p className="mb-3 mt-7 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-ink-muted">Moderation</p>}
          <div className="space-y-2">
            {moderated.map((schoolId) => {
              const school = schools.find((item) => item.id === schoolId);
              return (
                <SidebarLink collapsed={collapsed} key={schoolId} to={`/schools/${schoolId}?tab=manage`} icon={ShieldCheck} label={`Manage ${school?.shortName ?? "community"}`} />
              );
            })}
            {isGlobalAdmin && <SidebarLink collapsed={collapsed} to="/admin" icon={Sparkles} label="Global admin" badge="Admin" />}
            {isGlobalAdmin && <SidebarLink collapsed={collapsed} to="/admin/safety" icon={ShieldAlert} label="Safety management" />}
          </div>
        </>
      )}

      {/* Account card — the signed-in avatar lives in the navigation shell. */}
      <div className={`mt-7 border-t-2 border-line pt-4 ${collapsed ? "text-center" : ""}`}>
        {user && profile ? (
          <div className={`rounded-2xl border-2 border-line bg-card p-2.5 ${collapsed ? "flex flex-col items-center gap-2" : ""}`}>
            <Link
              to="/profile"
              title={collapsed ? `@${profile.username}` : undefined}
              className={`flex items-center rounded-xl py-1 transition-colors hover:bg-page ${collapsed ? "justify-center px-0" : "gap-2.5 px-1"}`}
            >
              <Avatar name={profile.username} src={profile.avatarUrl} size="md" ring online />
              <span className={collapsed ? "sr-only" : "min-w-0 flex-1"}>
                <span className="block truncate text-xs font-black text-ink">@{profile.username}</span>
                <span className="block truncate text-[10px] font-semibold text-ink-muted">
                  {mySchool?.shortName ?? "No SHS yet"}
                </span>
              </span>
            </Link>
            <div className={`mt-2 flex items-center gap-1.5 ${collapsed ? "flex-col" : ""}`}>
              <ThemeToggle className={collapsed ? "size-8 min-h-8 justify-center p-0" : "h-8 min-h-8 flex-1 justify-center p-0"} />
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
            <p className={collapsed ? "sr-only" : "text-xs font-extrabold text-ink"}>Join your SHS</p>
            {collapsed && <User size={18} className="mx-auto text-ink-muted" aria-hidden />}
            {!collapsed && <>
            <p className="mt-0.5 text-[10px] font-semibold text-ink-muted">Post, like and represent your campus.</p>
            <Link
              to="/auth?mode=signup"
              className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-xl bg-[#8B5CF6] text-[10px] font-extrabold uppercase tracking-wider text-white shadow-[0_3px_0_#5B21B6]"
            >
              Get started
            </Link>
            </>}
          </div>
        )}
        <p className={`mt-4 px-1 text-[10px] font-semibold leading-relaxed text-ink-muted ${collapsed ? "sr-only" : ""}`}>
          Your school. Your people. Your gist.
        </p>
      </div>
    </nav>
  );
}
