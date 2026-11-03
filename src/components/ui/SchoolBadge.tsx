import { crestColorsFor, initialsOf } from "../../lib/media";
import { useGistStore } from "../../store/gistStore";
import { cn } from "../../utils/cn";
import { SafeImage } from "../common/SafeImage";

export type SchoolBadgeSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

interface SchoolBadgeProps {
  schoolId?: string | null;
  /** Pass the crest directly when the row is already joined (avoids a store lookup). */
  crestUrl?: string | null;
  name?: string;
  size?: SchoolBadgeSize;
  ring?: boolean;
  className?: string;
}

const frameSize: Record<SchoolBadgeSize, string> = {
  xs: "size-6",
  sm: "size-8",
  md: "size-10",
  lg: "size-12",
  xl: "size-16",
  "2xl": "size-24",
};

/** Heraldic medallion rendered when a community has not uploaded a crest. */
function CrestMedallion({ initials, colors }: { initials: string; colors: readonly [string, string] }) {
  const [primary, secondary] = colors;
  return (
    <svg viewBox="0 0 100 100" className="size-full" role="presentation" aria-hidden>
      <circle cx="50" cy="50" r="50" fill={primary} />
      <circle cx="50" cy="50" r="43" fill={secondary} opacity="0.9" />
      <circle cx="50" cy="50" r="38" fill={primary} />
      <path d="M50 24 L72 31 V52 C72 65 62 73 50 79 C38 73 28 65 28 52 V31 Z" fill={secondary} />
      <path d="M50 28 L68 34 V52 C68 62.5 60 69.5 50 74.5 C40 69.5 32 62.5 32 52 V34 Z" fill={primary} opacity="0.92" />
      <text
        x="50"
        y="57"
        textAnchor="middle"
        fontFamily="Nunito Variable, Nunito, sans-serif"
        fontSize="22"
        fontWeight="900"
        fill={secondary}
        letterSpacing="-0.5"
      >
        {initials}
      </text>
      <circle cx="50" cy="35" r="3.2" fill={secondary} opacity="0.85" />
    </svg>
  );
}

/** Circular crest frame for an SHS community. */
export function SchoolBadge({ schoolId, crestUrl, name, size = "md", ring = false, className }: SchoolBadgeProps) {
  const school = useGistStore((state) =>
    schoolId ? state.schools.find((item) => item.id === schoolId) : undefined
  );
  const resolvedCrest = crestUrl !== undefined ? crestUrl : school?.crestUrl ?? null;
  const resolvedName = name ?? school?.name ?? "School";

  const colors = crestColorsFor(schoolId ?? resolvedName);
  const showImage = Boolean(resolvedCrest);

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 ring-line",
        frameSize[size],
        !showImage && "bg-surface-muted",
        ring && "ring-2 ring-brand",
        className
      )}
      aria-hidden
    >
      {showImage ? (
        <SafeImage
          src={resolvedCrest as string}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="relative size-full object-contain p-[8%]"
        />
      ) : (
        <CrestMedallion initials={initialsOf(resolvedName)} colors={colors} />
      )}
    </span>
  );
}

interface SchoolTagProps {
  schoolId?: string | null;
  name: string;
  crestUrl?: string | null;
  detail?: string;
  size?: SchoolBadgeSize;
  ring?: boolean;
  className?: string;
  nameClassName?: string;
}

/** Crest circle paired with the school name — feeds, cards, tags. */
export function SchoolTag({ schoolId, name, crestUrl, detail, size = "sm", ring = false, className, nameClassName }: SchoolTagProps) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <SchoolBadge schoolId={schoolId} crestUrl={crestUrl} name={name} size={size} ring={ring} />
      <span className="min-w-0">
        <span className={cn("block truncate font-extrabold text-ink", nameClassName)}>{name}</span>
        {detail && <span className="block truncate text-[10px] font-semibold text-ink-muted">{detail}</span>}
      </span>
    </span>
  );
}
