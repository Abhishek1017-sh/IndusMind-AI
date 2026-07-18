import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The "no data" contract for this product.
 *
 * This platform never fabricates industrial data — so an empty state must
 * *explain why* a module has nothing to show and what would populate it, rather
 * than showing a shrug or (worse) inventing plausible numbers. `reason` is the
 * honest explanation; `hint` tells the user the concrete next step.
 */
export function EmptyState({
  icon: Icon,
  title,
  reason,
  hint,
  action,
  className,
}: {
  icon?: React.ElementType;
  title: string;
  /** Why there is no data — derived from real system state, never guessed. */
  reason: string;
  /** What the user can do to populate it. */
  hint?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-10 text-center",
        className
      )}
    >
      {Icon && (
        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-ui-lg border border-line bg-subtle">
          <Icon className="h-4 w-4 text-ink-tertiary" />
        </div>
      )}
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-md text-xs leading-relaxed text-ink-secondary">
        {reason}
      </p>
      {hint && (
        <p className="mt-2.5 max-w-md text-xs leading-relaxed text-ink-tertiary">
          {hint}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
