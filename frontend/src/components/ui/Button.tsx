"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  // One solid brand action per view — everything else is quiet.
  primary:
    "bg-brand text-white shadow-e1 hover:bg-brand-hover active:translate-y-px disabled:bg-brand/50",
  secondary:
    "bg-surface text-ink border border-line shadow-e1 hover:bg-subtle hover:border-line-strong",
  ghost: "text-ink-secondary hover:bg-subtle hover:text-ink",
  danger:
    "bg-surface text-danger border border-danger/25 hover:bg-danger-subtle hover:border-danger/40",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-2.5 text-xs gap-1.5",
  md: "h-9 px-3.5 text-[13px] gap-2",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Renders a spinner and blocks interaction. */
  loading?: boolean;
  /** Render as the child element (e.g. a Next <Link>) instead of a <button>. */
  asChild?: boolean;
}

/**
 * The single button in the system. Every action in the app should use this so
 * height, radius, focus ring and disabled behaviour stay identical everywhere.
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "secondary", size = "md", loading, asChild, children, disabled, ...props },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center rounded-ui-md font-semibold whitespace-nowrap",
          "transition-colors duration-150 cursor-pointer select-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35 focus-visible:ring-offset-1",
          "disabled:pointer-events-none disabled:opacity-60",
          SIZES[size],
          VARIANTS[variant],
          className
        )}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export default Button;
