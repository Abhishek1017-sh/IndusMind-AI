"use client";

import { motion } from "framer-motion";
import { pageVariants } from "./variants";
import { cn } from "@/lib/utils";

/**
 * Wraps a page's content in the standard enter transition.
 *
 * Client component: Framer Motion needs browser APIs and the pages that use it
 * are already client components (see Next's Server/Client Components guide).
 */
export default function PageTransition({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={pageVariants}
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}
