import { forwardRef, type ReactNode } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { Loader2 } from "lucide-react";
import { cn } from "../../utils/cn";
import {
  depthShadow,
  flatShadow,
  PRESS_DEPTH,
  springs,
  type DepthShadow,
} from "../../theme/tokens";

/* ————————————————————— Types ————————————————————— */

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  /** Button label / content. */
  children?: ReactNode;
  /** Visual style. @default "primary" */
  variant?: ButtonVariant;
  /** Control height + padding scale. @default "md" */
  size?: ButtonSize;
  /** Shows a spinner and blocks interaction while keeping the label. */
  loading?: boolean;
  /** Icon rendered before the label (replaced by the spinner while loading). */
  leftIcon?: ReactNode;
  /** Icon rendered after the label. */
  rightIcon?: ReactNode;
  /** Stretch to fill the parent width. */
  fullWidth?: boolean;
}

/* ————————————————————— Variant + size maps ————————————————————— */

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-brand-deep text-brand-contrast hover:brightness-110",
  secondary: "border-2 border-line-deep bg-ink text-card hover:brightness-110",
  outline:
    "border-2 border-line-deep bg-card text-ink hover:bg-brand-wash hover:text-brand-deep",
  ghost: "bg-transparent text-brand hover:bg-brand-wash",
  danger: "bg-danger text-white hover:brightness-110",
};

const variantDepths: Record<ButtonVariant, DepthShadow> = {
  primary: depthShadow("var(--brand-edge)"),
  secondary: depthShadow("var(--border-strong)"),
  outline: depthShadow("var(--border-strong)"),
  ghost: flatShadow,
  danger: depthShadow("var(--danger-deep)"),
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-10 gap-1.5 rounded-xl px-4 text-xs",
  md: "h-12 gap-2 rounded-2xl px-5 text-sm",
  lg: "h-[52px] gap-2 rounded-2xl px-6 text-[15px]",
};

const spinnerSize: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 18 };

/* ————————————————————— Component ————————————————————— */

/**
 * Gist me signature 3D button.
 *
 * The chunky bottom edge is a hard bottom shadow (a `border-b-[5px]` look
 * without layout shift). On press, the face springs down into its edge —
 * the tactile Duolingo-style "clack".
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      loading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled = false,
      className,
      children,
      style,
      type,
      ...rest
    },
    ref
  ) {
    const blocked = disabled || loading;
    const hasDepth = variant !== "ghost";
    const depth3d = variantDepths[variant];

    return (
      <motion.button
        ref={ref}
        type={type ?? "button"}
        disabled={blocked}
        aria-busy={loading || undefined}
        data-loading={loading || undefined}
        className={cn(
          "relative inline-flex select-none items-center justify-center whitespace-nowrap",
          "font-extrabold uppercase tracking-[0.07em]",
          "transition-colors duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft",
          sizeClasses[size],
          variantClasses[variant],
          fullWidth && "w-full",
          blocked && "cursor-not-allowed",
          disabled &&
            "border-transparent bg-line text-ink-muted hover:bg-line",
          className
        )}
        style={{ boxShadow: disabled ? flatShadow.rest : depth3d.rest, ...style }}
        initial={false}
        animate={{ y: 0, boxShadow: disabled ? flatShadow.rest : depth3d.rest }}
        whileHover={
          blocked
            ? undefined
            : hasDepth
              ? { y: -2, boxShadow: depth3d.hover }
              : { scale: 1.04 }
        }
        whileTap={
          blocked
            ? undefined
            : hasDepth
              ? { y: PRESS_DEPTH - 1, boxShadow: depth3d.tap }
              : { scale: 0.95, y: 1 }
        }
        transition={springs.snappy}
        {...rest}
      >
        {loading ? (
          <Loader2
            size={spinnerSize[size]}
            strokeWidth={3}
            className="animate-spin"
            aria-hidden
          />
        ) : (
          leftIcon
        )}
        {children}
        {rightIcon}
      </motion.button>
    );
  }
);
