import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Check, GraduationCap, Hash, Loader2, Lock, ShieldCheck, Users } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { describeError } from "../../lib/supabase";
import { updateMyProfile } from "../../services/profilesService";
import { useAuthGateStore } from "../../store/authGateStore";
import { springs } from "../../theme/tokens";
import { schoolTypeLabel, type School } from "../../types/models";
import { cn } from "../../utils/cn";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { SchoolBadge } from "../ui/SchoolBadge";
import { useToast } from "../ui/Toast";

export type SchoolView = "grid" | "list";

interface SchoolCardProps {
  school: School;
  view: SchoolView;
}

/** SHS community card: join (sets your profile school) or open its feed. */
export function SchoolCard({ school, view }: SchoolCardProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile, setProfile } = useAuth();
  const openAuthGate = useAuthGateStore((state) => state.openAuthGate);
  const [joining, setJoining] = useState(false);

  const isGrid = view === "grid";
  const joined = profile?.schoolId === school.id;
  const isFounder = user?.id === school.creatorId;
  /** SHS identity is permanent once set in onboarding (see migration-step9.sql). */
  const schoolLocked = Boolean(profile?.schoolId) && !joined;

  const join = async () => {
    if (schoolLocked) {
      toast("Your SHS identity is permanently locked. Ask a global admin to correct it.", "brand");
      return;
    }
    if (!user) {
      openAuthGate({
        title: `Rep ${school.shortName} on Let's Gist!`,
        speech: `Create your student pass to wear the ${school.shortName} crest beside all your campus gists!`,
        prefillSchoolId: school.id,
      });
      return;
    }
    setJoining(true);
    try {
      const updated = await updateMyProfile({ schoolId: joined ? null : school.id });
      setProfile(updated);
      toast(joined ? `Left ${school.shortName}.` : `You joined ${school.shortName}!`, "success");
    } catch (error) {
      toast(describeError(error), "danger");
    } finally {
      setJoining(false);
    }
  };

  return (
    <motion.article
      whileHover={{ y: -2 }}
      transition={springs.gentle}
      className={cn(
        "flex rounded-3xl border-2 border-line bg-card shadow-[0_4px_0_var(--border-color)] transition-colors",
        isGrid ? "flex-col p-4" : "items-center gap-3 p-3 sm:gap-4 sm:p-4"
      )}
    >
      <div className={cn("flex items-start", isGrid ? "flex-col gap-3" : "min-w-0 flex-1 gap-3")}>
        <SchoolBadge schoolId={school.id} crestUrl={school.crestUrl} name={school.name} size={isGrid ? "xl" : "lg"} ring={joined} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className={cn("truncate font-extrabold text-ink", isGrid ? "text-sm" : "text-xs sm:text-sm")}>{school.name}</h3>
            <Badge tone="neutral" className="px-2 py-0.5 text-[9px]">{schoolTypeLabel(school.schoolType)}</Badge>
            {isFounder && (
              <Badge tone="brand" className="px-2 py-0.5 text-[9px]">
                <ShieldCheck size={10} strokeWidth={2.6} aria-hidden />
                Moderator
              </Badge>
            )}
          </div>
          <p className="mt-1 truncate text-[11px] font-semibold text-ink-muted">{school.region}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-ink-muted">
              <Users size={11} strokeWidth={2.5} aria-hidden />
              {school.memberCount.toLocaleString()} students
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-ink-muted">
              <Hash size={11} strokeWidth={2.5} aria-hidden />
              {school.postCount.toLocaleString()} gists
            </span>
          </div>
        </div>
      </div>

      <div className={cn("flex shrink-0 gap-2", isGrid ? "mt-4 flex-col" : "flex-col sm:flex-row")}>
        <Button
          size="sm"
          variant={joined ? "outline" : "primary"}
          fullWidth={isGrid}
          disabled={joining || schoolLocked}
          leftIcon={joining ? <Loader2 size={14} className="animate-spin" aria-hidden /> : joined ? <Check size={14} strokeWidth={3} aria-hidden /> : schoolLocked ? <Lock size={14} strokeWidth={2.5} aria-hidden /> : <GraduationCap size={14} strokeWidth={2.5} aria-hidden />}
          onClick={join}
        >
          {joined ? "Joined" : schoolLocked ? "SHS locked" : "Join"}
        </Button>
        <Button size="sm" variant={joined ? "primary" : "outline"} fullWidth={isGrid} onClick={() => navigate(`/schools/${school.id}`)}>
          View feed
        </Button>
      </div>
    </motion.article>
  );
}
