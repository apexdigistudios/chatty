'use client';

import { motion } from "framer-motion";
import { useNavigate } from "@/lib/router";
import { Hash, Users } from "lucide-react";
import { springs } from "@/theme/tokens";
import { schoolTypeLabel, type School } from "@/types/models";
import { cn } from "@/utils/cn";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SchoolBadge } from "@/components/ui/SchoolBadge";
import { formatCompactNumber } from "@/lib/utils";

export type SchoolView = "grid" | "list";

interface SchoolCardProps {
  school: School;
  view: SchoolView;
}

/** SHS community card with a direct link to its feed. */
export function SchoolCard({ school, view }: SchoolCardProps) {
  const navigate = useNavigate();

  const isGrid = view === "grid";

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
        <SchoolBadge schoolId={school.id} crestUrl={school.crestUrl} name={school.name} size={isGrid ? "xl" : "lg"} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className={cn("truncate font-extrabold text-ink", isGrid ? "text-sm" : "text-xs sm:text-sm")}>{school.name}</h3>
            <Badge tone="neutral" className="px-2 py-0.5 text-[9px]">{schoolTypeLabel(school.schoolType)}</Badge>
          </div>
          <p className="mt-1 truncate text-[11px] font-semibold text-ink-muted">{school.region}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-ink-muted">
              <Users size={11} strokeWidth={2.5} aria-hidden />
              {formatCompactNumber(school.memberCount)} students
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-ink-muted">
              <Hash size={11} strokeWidth={2.5} aria-hidden />
              {formatCompactNumber(school.postCount)} gists
            </span>
          </div>
        </div>
      </div>

      <div className={cn("flex shrink-0 gap-2", isGrid ? "mt-4 flex-col" : "flex-col sm:flex-row")}>
        <Button size="sm" variant="primary" fullWidth={isGrid} onClick={() => navigate(`/schools/${school.id}`)}>
          View feed
        </Button>
      </div>
    </motion.article>
  );
}
