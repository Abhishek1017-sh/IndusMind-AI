"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";
import { Brain } from "lucide-react";

const PAGE_MESSAGES: Record<string, string> = {
  "/dashboard":   "Loading Dashboard...",
  "/graph":       "Loading Knowledge Graph...",
  "/documents":   "Loading Document Intelligence...",
  "/maintenance": "Loading Maintenance Intelligence...",
  "/compliance":  "Loading Compliance Records...",
  "/chat":        "Launching AI Copilot...",
  "/analytics":   "Preparing Analytics...",
  "/reports":     "Loading Reports...",
  "/incidents":   "Loading Incident Records...",
  "/settings":    "Loading Settings...",
};

export default function PageTransitionBar() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("Loading...");
  const prevPath = useRef<string | null>(null);

  useEffect(() => {
    if (prevPath.current === null) {
      prevPath.current = pathname;
      return;
    }
    if (prevPath.current === pathname) return;
    prevPath.current = pathname;

    const msg = Object.entries(PAGE_MESSAGES).find(([key]) =>
      pathname.startsWith(key)
    )?.[1] ?? "Loading...";

    setMessage(msg);
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 600);
    return () => clearTimeout(t);
  }, [pathname]);

  if (!visible) return null;

  return (
    <>
      {/* Top progress bar */}
      <div className="im-top-bar" />

      {/* Small pill indicator */}
      <div
        className="fixed top-4 left-1/2 -translate-x-1/2 z-[9997] flex items-center gap-2.5 px-4 py-2 bg-white border border-[#E2E8F0] rounded-full shadow-lg im-slide-down"
        style={{ boxShadow: "0 4px 20px rgba(37,99,235,0.12)" }}
      >
        <div
          style={{
            width: 22, height: 22,
            borderRadius: "50%",
            background: "linear-gradient(135deg,#2563EB,#3B82F6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Brain className="w-3 h-3 text-white" />
        </div>
        <span className="text-[11px] font-bold text-[#0F172A] whitespace-nowrap">{message}</span>
        <div className="flex gap-1 items-center">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              style={{
                width: 4, height: 4, borderRadius: "50%",
                background: "#2563EB",
                display: "inline-block",
                animation: `im-dot-bounce 1.1s ease-in-out ${i * 0.18}s infinite`,
              }}
            />
          ))}
        </div>
      </div>
    </>
  );
}
