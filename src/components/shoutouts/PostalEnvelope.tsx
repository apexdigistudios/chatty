import { motion } from "framer-motion";
import { Mail, ShieldCheck, Sparkles } from "lucide-react";
import { crestColorsFor } from "../../lib/media";
import { ENVELOPE_THEME_BY_ID, STAMP_BY_ID } from "./postalThemes";
import { springs } from "../../theme/tokens";
import type { School } from "../../types/models";
import { SchoolBadge } from "../ui/SchoolBadge";
import { cn } from "../../utils/cn";

export function envelopePalette(school: School | null, theme = "school_crest") {
  const preset = ENVELOPE_THEME_BY_ID.get(theme);
  if (preset) return preset;
  const [primary, secondary] = crestColorsFor(school?.id ?? "gist-me");
  return { primary, secondary, accent: "#EDE9FE" };
}

interface PostalEnvelopeProps {
  school: School | null;
  theme?: string;
  stampLabel?: string;
  recipientName?: string;
  recipientClass?: string;
  senderName?: string;
  compact?: boolean;
  sealed?: boolean;
  stampId?: string;
  className?: string;
}

/** CSS/SVG digital envelope with the recipient SHS crest and postal seal. */
export function PostalEnvelope({
  school,
  theme = "school_crest",
  stampLabel = "Priority Campus Mail",
  recipientName = "Your favourite student",
  recipientClass = "Form 2 Science 1",
  senderName = "@CampusKing",
  compact = false,
  sealed = true,
  stampId = "priority",
  className,
}: PostalEnvelopeProps) {
  const palette = envelopePalette(school, theme);
  const sealColor = (STAMP_BY_ID as Map<string, { seal: string }>).get(stampId)?.seal ?? "#991B1B";

  return (
    <motion.div
      whileHover={{ y: -3, rotate: -0.5 }}
      transition={springs.gentle}
      className={cn(
        "relative isolate overflow-hidden rounded-[22px] border-2 border-[#18181B] shadow-[0_5px_0_#18181B]",
        compact ? "aspect-[1.65/1]" : "aspect-[1.75/1]",
        className
      )}
      style={{ backgroundColor: palette.accent }}
    >
      {/* School-colour top flap and diagonal airmail edge */}
      <div
        className="absolute inset-x-0 top-0 h-[48%] origin-top border-b-2 border-[#18181B]/25"
        style={{
          background: `linear-gradient(145deg, ${palette.primary} 0%, ${palette.primary} 48%, ${palette.secondary} 48%, ${palette.secondary} 100%)`,
          clipPath: "polygon(0 0, 100% 0, 50% 100%)",
        }}
        aria-hidden
      />
      <div
        className="absolute inset-y-0 left-0 w-2.5"
        style={{ background: `repeating-linear-gradient(0deg, ${palette.primary} 0 8px, #fff 8px 13px, ${palette.secondary} 13px 21px, #fff 21px 26px)` }}
        aria-hidden
      />

      {/* Crest and school identity */}
      <div className="absolute left-4 top-3 flex items-center gap-2 rounded-xl border border-white/35 bg-white/90 px-2 py-1.5 shadow-sm">
        <SchoolBadge schoolId={school?.id} crestUrl={school?.crestUrl} name={school?.name ?? "Gist me"} size="xs" />
        <span className="max-w-[9rem] truncate text-[9px] font-black uppercase tracking-[0.12em] text-[#18181B]">
          {school?.shortName ?? "SHS"} Post Office
        </span>
      </div>

      {/* Stamp sticker */}
      <div className="absolute right-3 top-3 rotate-6 rounded-md border-2 border-dashed border-[#18181B]/55 bg-[#FFFBEB] px-2 py-1 text-center shadow-[0_2px_0_rgba(24,24,27,0.25)]">
        <Sparkles size={11} className="mx-auto text-[#7C3AED]" aria-hidden />
        <span className="mt-0.5 block max-w-[5.5rem] text-[7px] font-black uppercase leading-tight tracking-wider text-[#18181B]">
          {stampLabel}
        </span>
      </div>

      {/* Address lines */}
      <div className="absolute inset-x-5 bottom-3 rounded-xl border-2 border-[#18181B]/15 bg-white/95 px-3 py-2 text-[#18181B] shadow-sm">
        <p className="truncate text-[11px] font-black leading-tight">To: {recipientName}</p>
        <p className="mt-0.5 truncate text-[9px] font-bold text-[#52525B]">{recipientClass} · {school?.shortName ?? "Ghana SHS"}</p>
        <p className="mt-0.5 truncate text-[8px] font-bold text-[#71717A]">From: {senderName}</p>
      </div>

      {sealed && (
        <motion.span
          initial={{ scale: 0.9, rotate: -8 }}
          animate={{ scale: 1, rotate: -8 }}
          className="absolute left-1/2 top-[48%] flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-black/35 text-white shadow-[0_3px_0_rgba(0,0,0,0.35)]"
            style={{ backgroundColor: sealColor }}
          aria-label="Wax seal"
        >
          <Mail size={17} strokeWidth={2.5} aria-hidden />
        </motion.span>
      )}

      <span className="absolute bottom-1 right-2 inline-flex items-center gap-0.5 text-[7px] font-black uppercase tracking-widest text-[#18181B]/50">
        <ShieldCheck size={8} aria-hidden />
        Let&apos;s Gist Post
      </span>
    </motion.div>
  );
}
