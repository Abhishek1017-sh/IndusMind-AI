"use client";

import * as React from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Modal dialog built on Radix — gives us focus trapping, Escape-to-close,
 * scroll locking and correct ARIA for free, which a hand-rolled overlay does
 * not. Animation is CSS-driven off Radix's `data-state` so it works without
 * coordinating an exit animation with unmount.
 */
export function Dialog({
  open, onOpenChange, title, description, children, footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        {/* Animation via `ui-dialog-*` keyframes in globals.css — the
            `animate-in`/`zoom-in-95` utilities belong to tailwindcss-animate,
            which this project does not install. */}
        <RadixDialog.Overlay className="ui-dialog-overlay fixed inset-0 z-50 bg-ink/25" />
        <RadixDialog.Content
          className={cn(
            "ui-dialog-content fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md",
            "rounded-ui-xl border border-line bg-surface shadow-e4 focus:outline-none"
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
            <div>
              <RadixDialog.Title className="text-sm font-bold text-ink">{title}</RadixDialog.Title>
              {description && (
                <RadixDialog.Description className="mt-1 text-xs leading-relaxed text-ink-secondary">
                  {description}
                </RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close className="flex h-6 w-6 shrink-0 items-center justify-center rounded-ui-sm text-ink-tertiary hover:bg-subtle">
              <X className="h-3.5 w-3.5" />
            </RadixDialog.Close>
          </div>

          {children && <div className="px-5 py-4">{children}</div>}

          {footer && (
            <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
