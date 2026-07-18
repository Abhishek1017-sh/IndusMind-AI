import type { Variants, Transition } from "framer-motion";

/**
 * Shared motion language.
 *
 * Enterprise motion is *informational*, not decorative: short durations, a
 * single decelerating curve, small travel distances. Every page imports these
 * instead of hand-tuning timings, so the whole app moves as one product.
 */

// Decelerate curve (matches --ease-enterprise in globals.css).
export const EASE: Transition["ease"] = [0.22, 1, 0.36, 1];

export const DURATION = {
  fast: 0.15,
  base: 0.25,
  slow: 0.4,
} as const;

/** Page-level fade+lift. Paired with PageTransition. */
export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.base, ease: EASE },
  },
};

/** Parent list/grid — staggers children in sequence. */
export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.05, delayChildren: 0.04 },
  },
};

/** Child of staggerContainer (cards, rows, KPI tiles). */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.base, ease: EASE },
  },
};

/** Simple fade — for text/secondary content. */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: DURATION.base, ease: EASE } },
};

/** Height auto expand/collapse (accordions, detail panels). */
export const expandCollapse: Variants = {
  collapsed: { height: 0, opacity: 0 },
  expanded: {
    height: "auto",
    opacity: 1,
    transition: { duration: DURATION.base, ease: EASE },
  },
};

/** Subtle lift used on interactive cards. */
export const hoverLift = {
  rest: { y: 0 },
  hover: { y: -2, transition: { duration: DURATION.fast, ease: EASE } },
} as const;
