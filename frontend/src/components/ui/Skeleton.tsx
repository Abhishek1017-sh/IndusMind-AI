import { cn } from "@/lib/utils";

/**
 * Loading placeholder. Skeletons must mirror the *shape* of the real content
 * (same height/width/rhythm) so the layout doesn't jump when data lands.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-ui-md bg-line/70",
        className
      )}
    />
  );
}

/** Skeleton matching the KpiTile footprint. */
export function SkeletonKpi() {
  return (
    <div className="rounded-ui-xl border border-line bg-surface p-4 shadow-e1">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-3 h-7 w-14" />
      <Skeleton className="mt-2 h-2.5 w-24" />
    </div>
  );
}

/** Skeleton matching a list/table row. */
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <Skeleton className="h-8 w-8 rounded-ui-md" />
      <div className="flex-1">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="mt-1.5 h-2.5 w-1/5" />
      </div>
      <Skeleton className="h-5 w-16" />
    </div>
  );
}
