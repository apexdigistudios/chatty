'use client';

import { useState, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from "react";
import { motion, useAnimationControls, useReducedMotion } from "framer-motion";
import { springs } from "@/theme/tokens";
import { cn } from "@/utils/cn";

interface AnimatedReactionProps extends Pick<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "aria-pressed" | "role" | "title" | "id" | "name" | "value"
> {
  icon: ReactNode;
  count?: number;
  children?: ReactNode;
  className?: string;
  iconClassName?: string;
  countClassName?: string;
  wiggle?: boolean;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  "aria-label"?: string;
  "aria-pressed"?: boolean;
  role?: string;
}

const popTransition = { type: "spring" as const, stiffness: 400, damping: 10 };

/** Reusable tactile button for likes, emoji reactions, and saved-state toggles. */
export function AnimatedReaction({
  icon,
  count,
  children,
  className,
  iconClassName,
  countClassName,
  wiggle = false,
  disabled = false,
  type = "button",
  onClick,
  ...attributes
}: AnimatedReactionProps) {
  const controls = useAnimationControls();
  const reduceMotion = useReducedMotion();
  const [countKey, setCountKey] = useState(0);

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!disabled && !reduceMotion) {
      void controls.start({
        scale: [1, 1.3, 1],
        rotate: wiggle ? [0, -9, 8, -5, 0] : 0,
        transition: popTransition,
      });
      setCountKey((key) => key + 1);
    }
    onClick?.(event);
  };

  return (
    <motion.button
      type={type}
      disabled={disabled}
      whileTap={disabled || reduceMotion ? undefined : { scale: 0.94 }}
      transition={springs.snappy}
      onClick={handleClick}
      className={cn("inline-flex items-center justify-center", className)}
      {...attributes}
    >
      <motion.span
        animate={controls}
        className={cn("inline-flex shrink-0 items-center justify-center", iconClassName)}
      >
        {icon}
      </motion.span>
      {count !== undefined && (
        <motion.span
          key={countKey}
          initial={reduceMotion ? false : { scale: 1.28, y: 2 }}
          animate={{ scale: 1, y: 0 }}
          transition={popTransition}
          className={cn("inline-flex tabular-nums", countClassName)}
        >
          {count}
        </motion.span>
      )}
      {children}
    </motion.button>
  );
}
