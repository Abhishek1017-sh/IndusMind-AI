import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Status vocabulary. Colour here always carries meaning (never decoration), so
 * the same tone means the same thing on every page:
 *   neutral = informational · success = healthy/passed · warning = attention
 *   danger = failed/critical · info = in progress · brand = AI/derived
 */
export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

const TONES: Record<Tone, string> = {
  neutral: "bg-subtle text-ink-secondary border-line",
  success: "bg-success-subtle text-success border-success/20",
  warning: "bg-warning-subtle text-warning border-warning/20",
  danger: "bg-danger-subtle text-danger border-danger/20",
  info: "bg-info-subtle text-info border-info/20",
  brand: "bg-brand-subtle text-brand border-brand-line",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-ui-sm border px-1.5 py-0.5",
        "text-[10px] font-bold uppercase tracking-wide whitespace-nowrap",
        TONES[tone],
        className
      )}
      {...props}
    />
  );
}

const DOT_TONES: Record<Tone, string> = {
  neutral: "bg-ink-tertiary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  brand: "bg-brand",
};

/** Small status dot, optionally pulsing for live/active states. */
export function StatusDot({
  tone = "neutral",
  pulse = false,
  className,
}: {
  tone?: Tone;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("relative flex h-1.5 w-1.5", className)}>
      {pulse && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
            DOT_TONES[tone]
          )}
        />
      )}
      <span
        className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", DOT_TONES[tone])}
      />
    </span>
  );
}
