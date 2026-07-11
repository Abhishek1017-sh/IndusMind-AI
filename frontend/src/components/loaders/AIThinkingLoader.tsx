"use client";

import { useEffect, useState } from "react";
import { Brain } from "lucide-react";

const THINKING_MESSAGES = [
  "Searching Documents...",
  "Reading SOPs...",
  "Building Context...",
  "Connecting Knowledge Graph...",
  "Analyzing Maintenance History...",
  "Generating AI Insights...",
  "Preparing Final Response...",
];

export default function AIThinkingLoader() {
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => {
      setMsgIdx(i => (i + 1) % THINKING_MESSAGES.length);
    }, 900);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="flex items-start gap-3 py-2">
      {/* Animated AI Logo */}
      <div
        style={{
          width: 32, height: 32, borderRadius: 10, flexShrink: 0,
          background: "linear-gradient(135deg,#2563EB,#3B82F6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 2px 12px rgba(37,99,235,0.25)",
          animation: "im-pulse-glow 2s ease-in-out infinite",
        }}
      >
        <Brain className="w-4 h-4 text-white" />
      </div>

      <div className="flex flex-col gap-1.5 pt-1">
        {/* Thinking label */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-[#2563EB]">Thinking</span>
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

        {/* Rotating message */}
        <p
          key={msgIdx}
          className="text-[11px] font-semibold text-[#64748B]"
          style={{ animation: "im-fade-in 0.3s ease both" }}
        >
          {THINKING_MESSAGES[msgIdx]}
        </p>

        {/* Shimmer bar */}
        <div className="flex gap-1 mt-1">
          {[100, 80, 120, 60, 90].map((w, i) => (
            <div
              key={i}
              className="im-skeleton h-2 rounded"
              style={{ width: w, animationDelay: `${i * 0.1}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
