import { forwardRef, type HTMLAttributes } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "../../utils/cn";
import { shadows, springs } from "../../theme/tokens";

/* ————————————————————— Card ————————————————————— */

export interface CardProps extends HTMLMotionProps<"div"> {
  /** Adds a gentle lift on hover and a press on tap. */
  interactive?: boolean;
}

/** Crisp white surface with a restrained 4px bottom edge. */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { interactive = false, className, children, style, ...rest },
  ref
) {
  return (
    <motion.div
      ref={ref}
      className={cn("rounded-3xl border-2 border-line bg-card transition-colors duration-200", className)}
      style={{ boxShadow: shadows.card, ...style }}
      initial={false}
      whileHover={
        interactive ? { y: -3, boxShadow: shadows.cardHover } : undefined
      }
      whileTap={interactive ? { y: 1, boxShadow: shadows.cardTap } : undefined}
      transition={springs.gentle}
      {...rest}
    >
      {children}
    </motion.div>
  );
});

/* ————————————————————— Composition helpers ————————————————————— */

export function CardHeader({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center gap-3 px-5 pb-3 pt-5", className)}
      {...rest}
    />
  );
}

export function CardBody({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5", className)} {...rest} />;
}

export function CardFooter({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 border-t-2 border-line px-3 py-2",
        className
      )}
      {...rest}
    />
  );
}
