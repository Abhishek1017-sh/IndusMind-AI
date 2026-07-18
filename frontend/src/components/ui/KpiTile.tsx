"use client";

import * as React from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
  useReducedMotion,
} from "framer-motion";
import { DURATION, EASE } from "@/components/motion/variants";
import { cn } from "@/lib/utils";
import type { Tone } from "./Badge";

/**
 * Counts up to `value` on mount.
 *
 * The count-up is an *enhancement only* — the real figure is always the source
 * of truth. If motion is reduced or the animation is interrupted we snap
 * straight to `value`, because a KPI that displays a stale "0" while animating
 * (or never animates) would be showing the user a number that is simply wrong.
 */
function AnimatedNumber({ value }: { value: number }) {
  const reduceMotion = useReducedMotion();
  const count = useMotionValue(reduceMotion ? value : 0);
  const text = useTransform(count, (v) => Math.round(v).toLocaleString());

  React.useEffect(() => {
    // Driving an external animation system is exactly what effects are for.
    if (reduceMotion) {
      count.set(value);
      return;
    }
    const controls = animate(count, value, { duration: DURATION.slow, ease: EASE });
    return () => {
      controls.stop();
      count.set(value); // never leave a half-counted, incorrect figure on screen
    };
  }, [count, value, reduceMotion]);

  return <motion.span>{text}</motion.span>;
}

const ACCENT: Record<Tone, string> = {
  neutral: "text-ink-tertiary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  brand: "text-brand",
};

export interface KpiTileProps {
  label: string;
  /**
   * The metric. `null` means "not derivable from the uploaded documents" and
   * renders an em dash — we never substitute a zero or an invented figure.
   */
  value: number | null;
  sub?: string;
  icon?: React.ElementType;
  tone?: Tone;
  className?: string;
}

/**
 * Compact KPI tile for executive overviews. Dense by design: label, figure and
 * one line of context — no oversized empty padding.
 */
export function KpiTile({
  label,
  value,
  sub,
  icon: Icon,
  tone = "neutral",
  className,
}: KpiTileProps) {
  return (
    <div
      className={cn(
        "group rounded-ui-xl border border-line bg-surface p-4 shadow-e1",
        "transition-colors duration-150 hover:border-line-strong",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
          {label}
        </p>
        {Icon && <Icon className={cn("h-3.5 w-3.5", ACCENT[tone])} />}
      </div>

      <p className="mt-2.5 text-2xl font-bold tabular-nums tracking-tight text-ink">
        {value === null ? (
          <span className="text-ink-tertiary">—</span>
        ) : (
          <AnimatedNumber value={value} />
        )}
      </p>

      {sub && <p className="mt-1 text-[11px] font-medium text-ink-tertiary">{sub}</p>}
    </div>
  );
}
